import { db } from '../db/db'
import type { DiscountSettings, ManualDiscount } from '../db/types'
import { logAudit } from './audit'
import { formatJod } from './money'
import { linesTotal, orderDue, paymentsTotal } from './orders'
import { getOpenShift } from './shift'

const KEY = 'discounts'
export const DEFAULT_DISCOUNTS: DiscountSettings = { staffMaxPct: 10 }
export const DISCOUNT_REASONS = ['صاحب', 'زبون دائم', 'تعويض']

export async function getDiscountSettings(): Promise<DiscountSettings> {
  const row = await db.settings.get(KEY)
  return { ...DEFAULT_DISCOUNTS, ...((row?.value as Partial<DiscountSettings>) ?? {}) }
}

export async function saveDiscountSettings(s: DiscountSettings) {
  if (!(s.staffMaxPct >= 0 && s.staffMaxPct <= 100)) throw new Error('النسبة لازم تكون بين 0 و 100')
  await db.settings.put({ key: KEY, value: s })
}

/** قيمة خصم بنسبة، مدوّرة لأقرب 10 فلس. */
export const pctAmount = (subtotal: number, pct: number) => Math.round((subtotal * pct) / 100 / 10) * 10

/**
 * خصم يدوي على الطلب (بيحلّ محل أي خصم يدوي قبله). بينسجّل مين عطاه ولمين وليش.
 * المطلوب بعد الخصم ما بينزل تحت اللي انْدفع.
 */
export async function applyManualDiscount(
  orderId: number,
  d: { amount: number; pct?: number; reason: string },
  byUserId: number,
  approvedBy?: number,
) {
  const reason = d.reason.trim()
  if (!reason) throw new Error('اختار سبب الخصم')
  if (!(d.amount > 0)) throw new Error('الخصم لازم يكون أكبر من صفر')
  await db.transaction('rw', ['orders', 'orderLines', 'payments', 'customers', 'shifts', 'auditLog'], async () => {
    const order = (await db.orders.get(orderId))!
    const lines = await db.orderLines.where('orderId').equals(orderId).toArray()
    const subtotal = linesTotal(lines)
    const paid = paymentsTotal(await db.payments.where('orderId').equals(orderId).toArray())
    const discount: ManualDiscount = { amount: d.amount, ...(d.pct ? { pct: d.pct } : {}), reason, byUserId, approvedBy, at: Date.now() }
    if (orderDue(lines, { ...order, manualDiscount: discount }) < paid) throw new Error('الخصم أكبر من اللي ضل للدفع')
    if (d.amount > subtotal) throw new Error('الخصم أكبر من الفاتورة')
    await db.orders.update(orderId, { manualDiscount: discount })
    const customer = order.customerId ? await db.customers.get(order.customerId) : undefined
    await logAudit({
      kind: 'discount',
      byUserId,
      approvedBy,
      orderId,
      shiftId: (await getOpenShift())?.id,
      amount: d.amount,
      summary: `خصم ${d.pct ? `${d.pct}% ` : ''}(${formatJod(d.amount)}) على ${order.label}${
        customer ? ` لـ${customer.name || customer.phone}` : ''
      } — السبب: ${reason}${approvedBy ? ' (بموافقة المالك)' : ''}`,
      before: order.manualDiscount ? { ...order.manualDiscount } : undefined,
      after: discount,
    })
  })
}

export async function removeManualDiscount(orderId: number, byUserId: number) {
  await db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts', 'auditLog'], async () => {
    const order = (await db.orders.get(orderId))!
    if (!order.manualDiscount) return
    const lines = await db.orderLines.where('orderId').equals(orderId).toArray()
    const paid = paymentsTotal(await db.payments.where('orderId').equals(orderId).toArray())
    if (orderDue(lines, { ...order, manualDiscount: undefined }) < paid) throw new Error('ما بنقدر نشيل الخصم')
    await db.orders.update(orderId, { manualDiscount: undefined })
    await logAudit({
      kind: 'discount',
      byUserId,
      orderId,
      shiftId: (await getOpenShift())?.id,
      amount: 0,
      summary: `شال خصم ${formatJod(order.manualDiscount.amount)} عن ${order.label}`,
      before: { ...order.manualDiscount },
    })
  })
}

/** الخصم بالنسبة بيتحسب من جديد إذا تغيّرت الأصناف. الخصم بمبلغ ثابت ما بيزيد عن الفاتورة. */
export async function refreshManualDiscount(orderId: number) {
  const order = await db.orders.get(orderId)
  const d = order?.manualDiscount
  if (!d || order.status !== 'open') return
  const lines = await db.orderLines.where('orderId').equals(orderId).toArray()
  const subtotal = linesTotal(lines)
  const amount = d.pct ? pctAmount(subtotal, d.pct) : Math.min(d.amount, subtotal)
  if (amount !== d.amount) await db.orders.update(orderId, { manualDiscount: { ...d, amount } })
}
