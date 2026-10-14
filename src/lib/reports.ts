import { db } from '../db/db'
import type { Expense, ExpenseSource, Item, Order, OrderLine, OptionList, Shift } from '../db/types'
import { resolveGroups } from './options'
import { splitPicked } from './offers'
import { cliqInDrawerOf, expectedCashOf, expenseSource, withdrawnOf } from './shift'
import { getCliqSettings, isStaffCliq, splitCliq, type CliqSplitRow } from './cliq'

// «يوم الشغل» = شيفت (من فتحه لتسكيره)، مش اليوم بالتقويم.
// بيع بعد نص الليل بينحسب على نفس يوم الشغل، والشهر بيتحدد من تاريخ فتح الشيفت.

export const MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
]

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** "2026-10" */
export const monthKey = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export const dayLabel = (ts: number) => {
  const d = new Date(ts)
  return `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export interface Totals {
  cash: number
  cliq: number
  sales: number
  /** مصاريف الدرج */
  expenses: number
  /** مصاريف من برا الدرج (ما بتأثر على الدرج) */
  outside: number
  /** الدخل ناقص كل المصاريف */
  net: number
  orders: number
  voids: number
  /** خصم الولاء على الطلبات المدفوعة */
  loyalty: number
  /** الخصومات اليدوية على الطلبات المدفوعة */
  manual: number
  /** عدد الزباين المسجّل على الطلبات المدفوعة */
  men: number
  women: number
  kids: number
  /** مبيعات الطلبات اللي إلها عدد زباين (لمعدّل الصرف للشخص) */
  guestSales: number
  /** كليك على حساب الموظف (كله) */
  cliqStaff: number
  /** منه: الموظف رح يحوّله لصاحب المحل (مش بالدرج) */
  cliqTransfer: number
}

export interface DayRow extends Totals {
  shift: Shift
  /** الكاش المعدود ناقص المفروض (للشيفتات المسكّرة) */
  drawerDiff?: number
  /** المسحوب من الدرج عند التسكير */
  withdrawn?: number
}

/** فروقات الدرج لموظف بشهر (الفرق بينسجّل على الموظف اللي فاتح الشيفت) */
export interface DrawerStaffRow {
  month: string
  userId: number
  shifts: number
  /** مجموع الزيادات */
  over: number
  /** مجموع النقص (رقم موجب) */
  short: number
}

export interface MonthRow extends Totals {
  key: string
  days: number
}

export interface ItemRow {
  name: string
  qty: number
  revenue: number
  /** الكمية والمبيعات اللي إلها تكلفة (اللي ما إلها تكلفة ما بتنحسب بالربح) */
  costedQty: number
  costedRevenue: number
  cost: number
}

/** ربح الصنف (من المبيعات اللي إلها تكلفة بس). undefined = بدون تكلفة */
export const itemProfit = (i: ItemRow) => (i.costedQty ? i.costedRevenue - i.cost : undefined)
export const itemMargin = (i: ItemRow) => (i.costedRevenue ? (i.costedRevenue - i.cost) / i.costedRevenue : undefined)

/**
 * تكلفة وحدة السطر: المحفوظة وقت البيع، وإذا السطر قديم (قبل ما تنحط التكلفة)
 * بنحسبها من تكلفة الصنف وخياراته هلق.
 */
function lineUnitCost(l: OrderLine, items: Map<number, Item>, lists: Map<string, OptionList>): number | undefined {
  if (l.costSnapshot !== undefined) return l.costSnapshot
  const item = items.get(l.itemId)
  if (item?.cost === undefined) return undefined
  const groups = resolveGroups(item, lists)
  return (
    item.cost +
    l.options.reduce((s, o) => {
      const [name, n] = splitPicked(o.choice)
      return s + n * (groups.find((g) => g.id === o.groupId)?.choices.find((c) => c.name === name)?.costDelta ?? 0)
    }, 0)
  )
}

export interface HourRow {
  hour: number
  orders: number
  sales: number
  /** عدد الزباين المسجّل بهالساعة */
  guests: number
}

/** أداء موظف بالفترة */
export interface StaffRow {
  userId: number
  /** شيفتات فتحها */
  shifts: number
  /** الطلبات المدفوعة اللي فتحها، ومبيعاتها (بعد الخصومات) */
  orders: number
  sales: number
  /** الخصومات اليدوية اللي عطاها */
  manual: number
  manualCount: number
  /** إلغاءات وشيل أصناف (عدد وقيمة) */
  cancels: number
  cancelAmount: number
  /** فروقات الدرج على شيفتاته */
  drawerOver: number
  drawerShort: number
  /** كليك على حسابه رح يحوّله لصاحب المحل */
  cliqTransfer: number
}

export interface OfferRow {
  name: string
  qty: number
  revenue: number
}

export interface ManualDiscountRow {
  label: string
  at: number
  amount: number
  pct?: number
  reason: string
  byUserId: number
  approvedBy?: number
  customerId?: number
}

export interface ExpenseReasonRow {
  reason: string
  source: ExpenseSource
  count: number
  amount: number
}

/** إلغاءات وشيل أصناف لكل موظف (من سجل التعديلات) */
export interface CancellationRow {
  userId: number
  voids: number
  voidAmount: number
  removals: number
  removalAmount: number
}

export interface Report {
  totals: Totals
  cancellations: CancellationRow[]
  /** الكليك حسب الحساب */
  cliqSplit: CliqSplitRow[]
  manualDiscounts: ManualDiscountRow[]
  /** أداء كل موظف */
  staff: StaffRow[]
  /** كل عرض كم انباع (والعروض الحالية اللي ما انباعت كمان) */
  offers: OfferRow[]
  /** فروقات الدرج لكل موظف بكل شهر */
  drawerByStaff: DrawerStaffRow[]
  days: DayRow[]
  months: MonthRow[]
  items: ItemRow[]
  hours: HourRow[]
  expenseReasons: ExpenseReasonRow[]
  expenses: Expense[]
}

const emptyTotals = (): Totals => ({
  cash: 0,
  cliq: 0,
  sales: 0,
  expenses: 0,
  outside: 0,
  net: 0,
  orders: 0,
  voids: 0,
  loyalty: 0,
  manual: 0,
  men: 0,
  women: 0,
  kids: 0,
  guestSales: 0,
  cliqStaff: 0,
  cliqTransfer: 0,
})

function addTotals(a: Totals, b: Totals) {
  a.cash += b.cash
  a.cliq += b.cliq
  a.sales += b.sales
  a.expenses += b.expenses
  a.outside += b.outside
  a.net += b.net
  a.orders += b.orders
  a.voids += b.voids
  a.loyalty += b.loyalty
  a.manual += b.manual
  a.men += b.men
  a.women += b.women
  a.kids += b.kids
  a.guestSales += b.guestSales
  a.cliqStaff += b.cliqStaff
  a.cliqTransfer += b.cliqTransfer
}

/** كل الشيفتات، الأحدث أول. */
export async function allShifts(): Promise<Shift[]> {
  return (await db.shifts.orderBy('openedAt').toArray()).reverse()
}

/**
 * تقرير مجموعة أيام شغل (شيفتات).
 * - الدخل من الدفعات المسجّلة بالشيفت، بدون دفعات الطلبات الملغية.
 * - الأصناف والساعات من الطلبات المدفوعة اللي تسكّرت جوا الشيفت. الساعة = ساعة فتح الطلب.
 */
export async function buildReport(shifts: Shift[]): Promise<Report> {
  const ids = shifts.map((s) => s.id!)
  const now = Date.now()
  const windows = shifts.map((s) => [s.openedAt, s.closedAt ?? now] as const)
  const from = Math.min(...windows.map((w) => w[0]))
  const to = Math.max(...windows.map((w) => w[1]))

  const [payments, expenses, closedOrders, audit] = await Promise.all([
    db.payments.where('shiftId').anyOf(ids).toArray(),
    db.expenses.where('shiftId').anyOf(ids).toArray(),
    shifts.length ? db.orders.where('closedAt').between(from, to, true, true).toArray() : Promise.resolve([] as Order[]),
    db.auditLog.where('shiftId').anyOf(ids).toArray(),
  ])

  // طلبات الفترة: اللي تسكّرت جوا شيفت من الشيفتات المختارة
  const shiftOf = (ts: number) => shifts.find((s) => ts >= s.openedAt && ts <= (s.closedAt ?? now))
  const orders = closedOrders.filter((o) => shiftOf(o.closedAt!))

  const paymentOrders = await db.orders.bulkGet([...new Set(payments.map((p) => p.orderId))])
  const voided = new Set(paymentOrders.filter((o) => o?.status === 'void').map((o) => o!.id!))
  const counted = payments.filter((p) => !voided.has(p.orderId))

  const paidOrders = orders.filter((o) => o.status === 'paid')
  const lines: OrderLine[] = paidOrders.length
    ? await db.orderLines.where('orderId').anyOf(paidOrders.map((o) => o.id!)).toArray()
    : []

  const orderDueById = new Map<number, number>()
  for (const l of lines) orderDueById.set(l.orderId, (orderDueById.get(l.orderId) ?? 0) + l.qty * l.priceSnapshot)
  for (const o of paidOrders) {
    const gross = orderDueById.get(o.id!) ?? 0
    orderDueById.set(o.id!, Math.max(0, gross - (o.loyaltyDiscount ?? 0) - (o.manualDiscount?.amount ?? 0)))
  }

  // أيام الشغل
  const byShift = new Map<number, DayRow>(shifts.map((s) => [s.id!, { shift: s, ...emptyTotals() }]))
  for (const p of counted) {
    const row = byShift.get(p.shiftId)!
    row[p.method] += p.amount
    row.sales += p.amount
  }
  for (const p of counted) if (p.method === 'cliq' && isStaffCliq(p)) byShift.get(p.shiftId)!.cliqStaff += p.amount
  for (const e of expenses) {
    const row = byShift.get(e.shiftId)!
    if (expenseSource(e) === 'outside') row.outside += e.amount
    else row.expenses += e.amount
  }
  for (const o of orders) {
    const row = byShift.get(shiftOf(o.closedAt!)!.id!)!
    if (o.status === 'paid') {
      row.orders++
      row.loyalty += o.loyaltyDiscount ?? 0
      row.manual += o.manualDiscount?.amount ?? 0
      if (o.guests) {
        row.men += o.guests.men
        row.women += o.guests.women
        row.kids += o.guests.kids
        row.guestSales += orderDueById.get(o.id!) ?? 0
      }
    } else if (o.status === 'void') row.voids++
  }
  const days = [...byShift.values()]
  for (const d of days) {
    d.net = d.sales - d.expenses - d.outside
    d.cliqTransfer = d.cliqStaff - cliqInDrawerOf(d.shift, d.cliqStaff)
    // فرق الدرج (للشيفتات المسكّرة): مصاريف الدرج بس، والكليك على حساب الموظف بيتحط كاش
    if (d.shift.closedAt && d.shift.countedCash !== undefined) {
      d.drawerDiff = d.shift.countedCash - expectedCashOf(d.shift, d)
      d.withdrawn = withdrawnOf(d.shift)
    }
  }
  days.sort((a, b) => b.shift.openedAt - a.shift.openedAt)

  // فروقات الدرج لكل موظف بالشهر
  const drawerMap = new Map<string, DrawerStaffRow>()
  for (const d of days) {
    if (d.drawerDiff === undefined) continue
    const month = monthKey(d.shift.openedAt)
    const key = `${month}|${d.shift.staffId}`
    const row = drawerMap.get(key) ?? { month, userId: d.shift.staffId, shifts: 0, over: 0, short: 0 }
    row.shifts++
    if (d.drawerDiff > 0) row.over += d.drawerDiff
    else row.short -= d.drawerDiff
    drawerMap.set(key, row)
  }
  const drawerByStaff = [...drawerMap.values()].sort(
    (a, b) => b.month.localeCompare(a.month) || b.short - b.over - (a.short - a.over),
  )

  // الشهور
  const monthMap = new Map<string, MonthRow>()
  const totals = emptyTotals()
  for (const d of days) {
    const key = monthKey(d.shift.openedAt)
    const m = monthMap.get(key) ?? { key, days: 0, ...emptyTotals() }
    addTotals(m, d)
    m.days++
    monthMap.set(key, m)
    addTotals(totals, d)
  }
  const months = [...monthMap.values()].sort((a, b) => b.key.localeCompare(a.key))

  // الأصناف (بالاسم وقت البيع، عشان لو تغيّر السعر أو الاسم بعدين)
  const [menuItems, optionLists] = await Promise.all([db.items.toArray(), db.optionLists.toArray()])
  const itemById = new Map(menuItems.map((i) => [i.id!, i]))
  const listById = new Map(optionLists.map((l) => [l.id, l]))
  const itemMap = new Map<string, ItemRow>()
  for (const l of lines) {
    const row = itemMap.get(l.nameSnapshot) ?? { name: l.nameSnapshot, qty: 0, revenue: 0, costedQty: 0, costedRevenue: 0, cost: 0 }
    row.qty += l.qty
    row.revenue += l.qty * l.priceSnapshot
    const unitCost = lineUnitCost(l, itemById, listById)
    if (unitCost !== undefined) {
      row.costedQty += l.qty
      row.costedRevenue += l.qty * l.priceSnapshot
      row.cost += l.qty * unitCost
    }
    itemMap.set(l.nameSnapshot, row)
  }
  const items = [...itemMap.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)

  // العروض: اللي انباع، والعروض الحالية اللي ما انباعت (صفر)
  const offerCategories = new Set((await db.categories.toArray()).filter((c) => c.kind === 'offers').map((c) => c.id!))
  const offerMap = new Map<string, OfferRow>()
  for (const i of menuItems) if (offerCategories.has(i.categoryId)) offerMap.set(i.name, { name: i.name, qty: 0, revenue: 0 })
  for (const l of lines) {
    if (!l.isOffer) continue
    const row = offerMap.get(l.nameSnapshot) ?? { name: l.nameSnapshot, qty: 0, revenue: 0 }
    row.qty += l.qty
    row.revenue += l.qty * l.priceSnapshot
    offerMap.set(l.nameSnapshot, row)
  }
  const offers = [...offerMap.values()].sort((a, b) => b.qty - a.qty)

  // الساعات
  const orderTotal = new Map<number, number>()
  for (const l of lines) orderTotal.set(l.orderId, (orderTotal.get(l.orderId) ?? 0) + l.qty * l.priceSnapshot)
  const hourMap = new Map<number, HourRow>()
  for (const o of paidOrders) {
    const hour = new Date(o.openedAt).getHours()
    const row = hourMap.get(hour) ?? { hour, orders: 0, sales: 0, guests: 0 }
    row.orders++
    row.sales += orderTotal.get(o.id!) ?? 0
    row.guests += o.guests ? o.guests.men + o.guests.women + o.guests.kids : 0
    hourMap.set(hour, row)
  }
  const hours = [...hourMap.values()]

  // المصاريف حسب السبب
  const reasonMap = new Map<string, ExpenseReasonRow>()
  for (const e of expenses) {
    const source = expenseSource(e)
    const key = `${source}|${e.reason}`
    const row = reasonMap.get(key) ?? { reason: e.reason, source, count: 0, amount: 0 }
    row.count++
    row.amount += e.amount
    reasonMap.set(key, row)
  }
  const expenseReasons = [...reasonMap.values()].sort((a, b) => b.amount - a.amount)

  // الإلغاءات لكل موظف
  const cancelMap = new Map<number, CancellationRow>()
  for (const a of audit) {
    if (a.kind !== 'void' && a.kind !== 'line') continue
    const row = cancelMap.get(a.byUserId) ?? { userId: a.byUserId, voids: 0, voidAmount: 0, removals: 0, removalAmount: 0 }
    if (a.kind === 'void') {
      row.voids++
      row.voidAmount += a.amount ?? 0
    } else {
      row.removals++
      row.removalAmount += a.amount ?? 0
    }
    cancelMap.set(a.byUserId, row)
  }
  const cancellations = [...cancelMap.values()].sort(
    (a, b) => b.voidAmount + b.removalAmount - (a.voidAmount + a.removalAmount),
  )

  const manualDiscounts: ManualDiscountRow[] = paidOrders
    .filter((o) => o.manualDiscount)
    .map((o) => ({
      label: o.label,
      at: o.closedAt!,
      amount: o.manualDiscount!.amount,
      pct: o.manualDiscount!.pct,
      reason: o.manualDiscount!.reason,
      byUserId: o.manualDiscount!.byUserId,
      approvedBy: o.manualDiscount!.approvedBy,
      customerId: o.customerId,
    }))
    .sort((a, b) => b.at - a.at)

  // أداء الموظفين
  const staffMap = new Map<number, StaffRow>()
  const staffRow = (userId: number) => {
    const row = staffMap.get(userId) ?? {
      userId,
      shifts: 0,
      orders: 0,
      sales: 0,
      manual: 0,
      manualCount: 0,
      cancels: 0,
      cancelAmount: 0,
      drawerOver: 0,
      drawerShort: 0,
      cliqTransfer: 0,
    }
    staffMap.set(userId, row)
    return row
  }
  for (const d of days) {
    const row = staffRow(d.shift.staffId)
    row.shifts++
    row.cliqTransfer += d.cliqTransfer
    if (d.drawerDiff !== undefined) {
      if (d.drawerDiff > 0) row.drawerOver += d.drawerDiff
      else row.drawerShort -= d.drawerDiff
    }
  }
  for (const o of paidOrders) {
    const row = staffRow(o.staffId)
    row.orders++
    row.sales += orderDueById.get(o.id!) ?? 0
    if (o.manualDiscount) {
      const by = staffRow(o.manualDiscount.byUserId)
      by.manual += o.manualDiscount.amount
      by.manualCount++
    }
  }
  for (const c of cancellations) {
    const row = staffRow(c.userId)
    row.cancels += c.voids + c.removals
    row.cancelAmount += c.voidAmount + c.removalAmount
  }
  const staff = [...staffMap.values()].sort((a, b) => b.sales - a.sales)

  return {
    totals,
    cancellations,
    staff,
    cliqSplit: splitCliq(counted, await getCliqSettings()),
    manualDiscounts,
    offers,
    drawerByStaff,
    days,
    months,
    items,
    hours,
    expenseReasons,
    expenses: expenses.sort((a, b) => b.createdAt - a.createdAt),
  }
}

/** ترتيب ساعات الشغل: من 6 الصبح لـ 5 الفجر، عشان 12 و1 بالليل يجوا آخر اليوم. */
export const hourOrder = (h: number) => (h + 24 - 6) % 24

export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

/**
 * مسح كل بيانات البيع والمخزون (للتجربة). المنيو (مع الأصناف الموقفة) والطاولات
 * والمستخدمين بيضلّوا زي ما هم.
 */
export async function wipeSalesData() {
  const tables = db.tables.filter((t) =>
    ['orders', 'orderLines', 'payments', 'paymentCorrections', 'shifts', 'expenses', 'stockMoves', 'stockCounts', 'auditLog', 'customers'].includes(
      t.name,
    ),
  )
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear()
  })
}

