import { db } from '../db/db'
import type { AuditEntry, Expense, Order, OrderLine, Payment } from '../db/types'
import { formatJod } from './money'
import { linesTotal, paymentsTotal } from './orders'

// تعديلات المالك على الأيام الماضية. كل تعديل بينحفظ معه: مين، ومتى، وشو كان قبل وشو صار.
// التقارير بتتحدّث لحالها لأنها بتقرا من نفس البيانات.

export async function logAudit(entry: Omit<AuditEntry, 'id' | 'at'>) {
  await db.auditLog.add({ ...entry, at: Date.now() })
}

/** يوم الشغل اللي بيخصّه الطلب: شيفت أول دفعة، أو الشيفت اللي تسكّر فيه. */
async function shiftIdForOrder(order: Order): Promise<number | undefined> {
  const first = await db.payments.where('orderId').equals(order.id!).first()
  if (first) return first.shiftId
  const ts = order.closedAt ?? order.openedAt
  const shift = await db.shifts
    .filter((s) => ts >= s.openedAt && ts <= (s.closedAt ?? Date.now()))
    .first()
  return shift?.id
}

/**
 * شيل وحدات من سطر (أو السطر كله). إذا الطلب مدفوع، الدفعات بتنقص بنفس المبلغ
 * (من آخر دفعة لورا)، عشان الدخل والدرج يضلّوا مطابقين للطلب.
 */
export async function removeLineUnits(line: OrderLine, units: number, byUserId: number) {
  await db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts', 'auditLog'], async () => {
    const order = (await db.orders.get(line.orderId))!
    const lines = await db.orderLines.where('orderId').equals(order.id!).toArray()
    const remove = Math.min(units, line.qty)
    if (remove === line.qty && lines.length === 1) throw new Error('هاد آخر صنف بالطلب. إذا بدك تشيله، ألغِ الطلب كله')

    const amount = remove * line.priceSnapshot
    const payments = await db.payments.where('orderId').equals(order.id!).sortBy('createdAt')
    const paid = paymentsTotal(payments)
    const newTotal = linesTotal(lines) - amount

    const before = { line: { ...line }, payments: payments.map((p) => ({ ...p })) }
    if (remove === line.qty) await db.orderLines.delete(line.id!)
    else await db.orderLines.update(line.id!, { qty: line.qty - remove })

    // إذا المدفوع صار أكثر من الطلب: بنقّص الفرق من الدفعات (الأحدث أول)
    let excess = paid - newTotal
    let reduced = 0
    const changed: { id: number; amount: number }[] = []
    for (const p of [...payments].reverse()) {
      if (excess <= 0) break
      const cut = Math.min(p.amount, excess)
      excess -= cut
      reduced += cut
      if (p.amount - cut === 0) await db.payments.delete(p.id!)
      else await db.payments.update(p.id!, { amount: p.amount - cut })
      changed.push({ id: p.id!, amount: p.amount - cut })
    }

    await logAudit({
      kind: 'line',
      byUserId,
      orderId: order.id,
      shiftId: await shiftIdForOrder({ ...order }),
      summary: `شال ${remove}× ${line.nameSnapshot} من ${order.label} (−${formatJod(amount)})${
        reduced ? `، والدفعات نقصت ${formatJod(reduced)}` : ''
      }`,
      before,
      after: { qty: line.qty - remove, payments: changed },
    })
  })
}

/**
 * إلغاء طلب من سجل الأيام. الطلب المسكّر بيضل بيومه (ما بنغيّر closedAt)،
 * ودفعاته ما بتنحسب بالدخل لأنه صار ملغي.
 */
export async function voidOrderAudited(order: Order, byUserId: number) {
  await db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts', 'auditLog'], async () => {
    const fresh = (await db.orders.get(order.id!))!
    if (fresh.status === 'void') return
    const total = linesTotal(await db.orderLines.where('orderId').equals(order.id!).toArray())
    const now = Date.now()
    await db.orders.update(order.id!, {
      status: 'void',
      voidedAt: now,
      voidedBy: byUserId,
      ...(fresh.closedAt ? {} : { closedAt: now }),
    })
    await logAudit({
      kind: 'void',
      byUserId,
      orderId: order.id,
      shiftId: await shiftIdForOrder(fresh),
      summary: `ألغى ${fresh.label} (${formatJod(total)})`,
      before: { status: fresh.status },
      after: { status: 'void' },
    })
  })
}

/** تسجيل تصحيح دفعة بسجل التعديلات (التصحيح نفسه بـ correctPayment). */
export async function logPaymentCorrection(payment: Payment, to: Payment['method'], byUserId: number) {
  const order = await db.orders.get(payment.orderId)
  const label = { cash: 'كاش', cliq: 'كليك' }
  await logAudit({
    kind: 'payment',
    byUserId,
    orderId: payment.orderId,
    shiftId: payment.shiftId,
    summary: `حوّل دفعة ${formatJod(payment.amount)} بـ${order?.label ?? 'طلب'} من ${label[payment.method]} لـ${label[to]}`,
    before: { method: payment.method },
    after: { method: to },
  })
}

export async function updateExpenseAudited(expense: Expense, changes: { amount?: number; reason?: string }, byUserId: number) {
  const reason = changes.reason?.trim()
  if (changes.amount !== undefined && !(changes.amount > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر')
  if (changes.reason !== undefined && !reason) throw new Error('اكتب السبب')
  const after = { amount: changes.amount ?? expense.amount, reason: reason ?? expense.reason }
  if (after.amount === expense.amount && after.reason === expense.reason) return
  await db.transaction('rw', ['expenses', 'auditLog'], async () => {
    await db.expenses.update(expense.id!, after)
    await logAudit({
      kind: 'expense-edit',
      byUserId,
      shiftId: expense.shiftId,
      summary: `عدّل مصروف «${expense.reason}» ${formatJod(expense.amount)} ← «${after.reason}» ${formatJod(after.amount)}`,
      before: { amount: expense.amount, reason: expense.reason },
      after,
    })
  })
}

export async function deleteExpenseAudited(expense: Expense, byUserId: number) {
  await db.transaction('rw', ['expenses', 'auditLog'], async () => {
    await db.expenses.delete(expense.id!)
    await logAudit({
      kind: 'expense-delete',
      byUserId,
      shiftId: expense.shiftId,
      summary: `حذف مصروف «${expense.reason}» ${formatJod(expense.amount)}`,
      before: { ...expense },
    })
  })
}
