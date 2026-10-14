import { db } from '../db/db'
import type { Expense, ExpenseSource, Order, OrderLine, Shift } from '../db/types'
import { expenseSource, withdrawnOf } from './shift'

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
}

export interface DayRow extends Totals {
  shift: Shift
  /** الكاش المعدود ناقص المفروض (للشيفتات المسكّرة) */
  drawerDiff?: number
  /** المسحوب من الدرج عند التسكير */
  withdrawn?: number
}

export interface MonthRow extends Totals {
  key: string
  days: number
}

export interface ItemRow {
  name: string
  qty: number
  revenue: number
}

export interface HourRow {
  hour: number
  orders: number
  sales: number
}

export interface ExpenseReasonRow {
  reason: string
  source: ExpenseSource
  count: number
  amount: number
}

export interface Report {
  totals: Totals
  days: DayRow[]
  months: MonthRow[]
  items: ItemRow[]
  hours: HourRow[]
  expenseReasons: ExpenseReasonRow[]
  expenses: Expense[]
}

const emptyTotals = (): Totals => ({ cash: 0, cliq: 0, sales: 0, expenses: 0, outside: 0, net: 0, orders: 0, voids: 0 })

function addTotals(a: Totals, b: Totals) {
  a.cash += b.cash
  a.cliq += b.cliq
  a.sales += b.sales
  a.expenses += b.expenses
  a.outside += b.outside
  a.net += b.net
  a.orders += b.orders
  a.voids += b.voids
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

  const [payments, expenses, closedOrders] = await Promise.all([
    db.payments.where('shiftId').anyOf(ids).toArray(),
    db.expenses.where('shiftId').anyOf(ids).toArray(),
    shifts.length ? db.orders.where('closedAt').between(from, to, true, true).toArray() : Promise.resolve([] as Order[]),
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

  // أيام الشغل
  const byShift = new Map<number, DayRow>(shifts.map((s) => [s.id!, { shift: s, ...emptyTotals() }]))
  for (const p of counted) {
    const row = byShift.get(p.shiftId)!
    row[p.method] += p.amount
    row.sales += p.amount
  }
  for (const e of expenses) {
    const row = byShift.get(e.shiftId)!
    if (expenseSource(e) === 'outside') row.outside += e.amount
    else row.expenses += e.amount
  }
  for (const o of orders) {
    const row = byShift.get(shiftOf(o.closedAt!)!.id!)!
    if (o.status === 'paid') row.orders++
    else if (o.status === 'void') row.voids++
  }
  const days = [...byShift.values()]
  for (const d of days) {
    d.net = d.sales - d.expenses - d.outside
    // فرق الدرج بمصاريف الدرج بس
    if (d.shift.countedCash !== undefined) {
      d.drawerDiff = d.shift.countedCash - (d.shift.openingCash + d.cash - d.expenses)
      d.withdrawn = withdrawnOf(d.shift)
    }
  }
  days.sort((a, b) => b.shift.openedAt - a.shift.openedAt)

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
  const itemMap = new Map<string, ItemRow>()
  for (const l of lines) {
    const row = itemMap.get(l.nameSnapshot) ?? { name: l.nameSnapshot, qty: 0, revenue: 0 }
    row.qty += l.qty
    row.revenue += l.qty * l.priceSnapshot
    itemMap.set(l.nameSnapshot, row)
  }
  const items = [...itemMap.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)

  // الساعات
  const orderTotal = new Map<number, number>()
  for (const l of lines) orderTotal.set(l.orderId, (orderTotal.get(l.orderId) ?? 0) + l.qty * l.priceSnapshot)
  const hourMap = new Map<number, HourRow>()
  for (const o of paidOrders) {
    const hour = new Date(o.openedAt).getHours()
    const row = hourMap.get(hour) ?? { hour, orders: 0, sales: 0 }
    row.orders++
    row.sales += orderTotal.get(o.id!) ?? 0
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

  return {
    totals,
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
    ['orders', 'orderLines', 'payments', 'paymentCorrections', 'shifts', 'expenses', 'stockMoves', 'stockCounts', 'auditLog'].includes(
      t.name,
    ),
  )
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear()
  })
}

