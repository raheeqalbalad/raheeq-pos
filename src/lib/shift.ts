import { db } from '../db/db'
import type { Expense, ExpenseSource, Shift } from '../db/types'
import { getCliqSettings, splitCliq, type CliqSplitRow } from './cliq'
import { logAudit } from './audit'
import { formatJod } from './money'

/** في درج واحد، فبيكون في شيفت مفتوح واحد بس بأي وقت. */
export async function getOpenShift(): Promise<Shift | undefined> {
  return db.shifts
    .orderBy('openedAt')
    .reverse()
    .filter((s) => !s.closedAt)
    .first()
}

export async function lastClosedShift(): Promise<Shift | undefined> {
  return db.shifts
    .orderBy('openedAt')
    .reverse()
    .filter((s) => !!s.closedAt)
    .first()
}

export async function openShift(staffId: number, openingCash: number): Promise<number> {
  return db.transaction('rw', 'shifts', async () => {
    const existing = await getOpenShift()
    if (existing) return existing.id!
    return (await db.shifts.add({ staffId, openingCash, openedAt: Date.now() }))!
  })
}

/** العدّ الأعمى: الموظف بيأكّد كم عدّ قبل ما يشوف المفروض، والرقم بينحفظ على الشيفت. */
export async function countDrawer(shiftId: number, countedCash: number, countedBy: number) {
  await db.transaction('rw', 'shifts', async () => {
    const shift = await db.shifts.get(shiftId)
    if (!shift || shift.closedAt) throw new Error('الشيفت مسكّر')
    if (shift.countedCash !== undefined) throw new Error('الدرج انعدّ قبل')
    await db.shifts.update(shiftId, { countedCash, countedAt: Date.now(), countedBy })
  })
}

/** يرجّع العدّ من جديد (بيتسجّل بسجل التعديلات). */
export async function resetDrawerCount(shiftId: number, byUserId: number, reason: string, approvedBy?: number) {
  await db.transaction('rw', ['shifts', 'auditLog'], async () => {
    const shift = await db.shifts.get(shiftId)
    if (!shift || shift.closedAt || shift.countedCash === undefined) return
    await db.shifts.update(shiftId, { countedCash: undefined, countedAt: undefined, countedBy: undefined })
    await logAudit({
      byUserId,
      approvedBy,
      kind: 'recount',
      shiftId,
      summary: `رجّع عدّ الدرج (كان ${formatJod(shift.countedCash)}) — ${reason}`,
      before: { countedCash: shift.countedCash, countedAt: shift.countedAt, countedBy: shift.countedBy },
    })
  })
}

export async function closeShift(shiftId: number, closedBy: number, leftInDrawer: number) {
  await db.transaction('rw', 'shifts', async () => {
    const shift = await db.shifts.get(shiftId)
    if (!shift || shift.closedAt) throw new Error('الشيفت مسكّر')
    if (shift.countedCash === undefined) throw new Error('لازم الدرج ينعدّ أول')
    if (leftInDrawer > shift.countedCash) throw new Error('المتروك ما بصير يكون أكثر من المعدود')
    await db.shifts.update(shiftId, { closedAt: Date.now(), closedBy, leftInDrawer })
  })
}

/** اللي انترك بالدرج (الشيفتات القديمة قبل هالخانة: كل المعدود). */
export const leftInDrawerOf = (s: Shift) => s.leftInDrawer ?? s.countedCash

/** المسحوب من الدرج عند التسكير = المعدود − المتروك. */
export const withdrawnOf = (s: Shift) =>
  s.countedCash === undefined ? undefined : s.countedCash - (leftInDrawerOf(s) ?? s.countedCash)

export interface ShiftSummary {
  cash: number
  cliq: number
  sales: number
  /** مصاريف الدرج */
  expenses: number
  /** مصاريف من برا الدرج (ما بتأثر على الدرج) */
  outside: number
  /** المبيعات ناقص كل المصاريف */
  net: number
  /** كاش البداية + الكاش + كليك على حساب الموظف − مصاريف الدرج */
  expectedCash: number
  paidOrders: number
  voidOrders: number
  /** خصم الولاء على طلبات الشيفت المدفوعة */
  loyalty: number
  /** خصومات يدوية على طلبات الشيفت المدفوعة */
  manual: number
  /** الكليك مقسوم حسب الحساب */
  cliqSplit: CliqSplitRow[]
  /** كليك على حساب الموظف: بيحط مقابله كاش بالدرج */
  cliqStaff: number
  /** مين باع بالشيفت */
  staffIds: number[]
}

/**
 * ملخّص الشيفت. الدفعات بتنحسب بالشيفت اللي انْدفعت فيه (مش اللي انفتح فيه الطلب).
 * دفعات الطلبات الملغية ما بتنحسب، لأنه المصاري رجعت للزبون.
 */
export async function shiftSummary(shift: Shift): Promise<ShiftSummary> {
  const payments = await db.payments.where('shiftId').equals(shift.id!).toArray()
  const orderIds = [...new Set(payments.map((p) => p.orderId))]
  const orders = await db.orders.bulkGet(orderIds)
  const voided = new Set(orders.filter((o) => o?.status === 'void').map((o) => o!.id!))
  const counted = payments.filter((p) => !voided.has(p.orderId))

  const cash = counted.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0)
  const cliq = counted.filter((p) => p.method === 'cliq').reduce((s, p) => s + p.amount, 0)
  const all = await db.expenses.where('shiftId').equals(shift.id!).toArray()
  const expenses = all.filter((e) => expenseSource(e) === 'drawer').reduce((s, e) => s + e.amount, 0)
  const outside = all.filter((e) => expenseSource(e) === 'outside').reduce((s, e) => s + e.amount, 0)

  const cliqSplit = splitCliq(counted, await getCliqSettings())
  const cliqStaff = cliqSplit.filter((r) => r.isStaff).reduce((s, r) => s + r.amount, 0)

  const end = shift.closedAt ?? Date.now()
  const closedInShift = await db.orders
    .where('closedAt')
    .between(shift.openedAt, end, true, true)
    .toArray()

  return {
    cash,
    cliq,
    sales: cash + cliq,
    expenses,
    outside,
    net: cash + cliq - expenses - outside,
    expectedCash: expectedCashOf(shift, { cash, cliqStaff, expenses }),
    paidOrders: closedInShift.filter((o) => o.status === 'paid').length,
    loyalty: closedInShift.filter((o) => o.status === 'paid').reduce((s, o) => s + (o.loyaltyDiscount ?? 0), 0),
    manual: closedInShift.filter((o) => o.status === 'paid').reduce((s, o) => s + (o.manualDiscount?.amount ?? 0), 0),
    cliqSplit,
    cliqStaff,
    voidOrders: closedInShift.filter((o) => o.status === 'void').length,
    staffIds: [...new Set(counted.map((p) => p.staffId))],
  }
}

/** المفروض بالدرج: الكليك على حساب الموظف بيحط مقابله كاش بالدرج. */
export const expectedCashOf = (shift: Shift, t: { cash: number; cliqStaff: number; expenses: number }) =>
  shift.openingCash + t.cash + t.cliqStaff - t.expenses

export const expenseSource = (e: Expense): ExpenseSource => e.source ?? 'drawer'

/** بيسجّل مصروف على الشيفت المفتوح، وبيرجع رقمه. */
export async function addExpense(amount: number, reason: string, staffId: number, source: ExpenseSource = 'drawer') {
  return db.transaction('rw', ['shifts', 'expenses'], async () => {
    const shift = await getOpenShift()
    if (!shift) throw new Error('ما في شيفت مفتوح')
    return (await db.expenses.add({ amount, reason: reason.trim(), staffId, shiftId: shift.id!, createdAt: Date.now(), source }))!
  })
}
