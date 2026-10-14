import { db } from '../db/db'
import type { Expense, ExpenseSource, Shift } from '../db/types'

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

export async function closeShift(shiftId: number, closedBy: number, countedCash: number, leftInDrawer: number) {
  await db.shifts.update(shiftId, { closedAt: Date.now(), closedBy, countedCash, leftInDrawer })
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
  /** كاش البداية + الكاش − المصاريف */
  expectedCash: number
  paidOrders: number
  voidOrders: number
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
    expectedCash: shift.openingCash + cash - expenses,
    paidOrders: closedInShift.filter((o) => o.status === 'paid').length,
    voidOrders: closedInShift.filter((o) => o.status === 'void').length,
    staffIds: [...new Set(counted.map((p) => p.staffId))],
  }
}

export const expenseSource = (e: Expense): ExpenseSource => e.source ?? 'drawer'

/** بيسجّل مصروف على الشيفت المفتوح، وبيرجع رقمه. */
export async function addExpense(amount: number, reason: string, staffId: number, source: ExpenseSource = 'drawer') {
  return db.transaction('rw', ['shifts', 'expenses'], async () => {
    const shift = await getOpenShift()
    if (!shift) throw new Error('ما في شيفت مفتوح')
    return (await db.expenses.add({ amount, reason: reason.trim(), staffId, shiftId: shift.id!, createdAt: Date.now(), source }))!
  })
}
