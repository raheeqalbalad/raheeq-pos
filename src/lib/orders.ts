import { db } from '../db/db'
import type { CafeTable, Item, LineOption, OrderLine, Payment, PaymentMethod } from '../db/types'
import { getOpenShift } from './shift'
import { logPaymentCorrection } from './audit'

export type OrderTarget = { tableId: number; label: string } | { takeaway: true }

export function linesTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.priceSnapshot * l.qty, 0)
}

export function paymentsTotal(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** بيرجع الطلب المفتوح على الطاولة، أو بيفتح واحد جديد. */
async function openOrder(target: OrderTarget, staffId: number): Promise<number> {
  return db.transaction('rw', 'orders', async () => {
    if ('tableId' in target) {
      const existing = await db.orders
        .where('tableId')
        .equals(target.tableId)
        .filter((o) => o.status === 'open')
        .first()
      if (existing) return existing.id!
      return (await db.orders.add({
        tableId: target.tableId,
        takeaway: false,
        label: target.label,
        status: 'open',
        openedAt: Date.now(),
        staffId,
      }))!
    }
    const todayCount = await db.orders
      .where('openedAt')
      .aboveOrEqual(startOfToday())
      .filter((o) => o.takeaway)
      .count()
    const takeawayNo = todayCount + 1
    return (await db.orders.add({
      takeaway: true,
      takeawayNo,
      label: `تيك أواي ${takeawayNo}`,
      status: 'open',
      openedAt: Date.now(),
      staffId,
    }))!
  })
}

const sameOptions = (a: LineOption[], b: LineOption[]) =>
  a.length === b.length && a.every((o, i) => o.groupId === b[i].groupId && o.choice === b[i].choice)

/**
 * بيضيف صنف على الطلب. إذا الطلب لسا مش موجود بيفتحه.
 * نفس الصنف بنفس الخيارات (وبدون ملاحظة) بيزيد الكمية بدل سطر جديد.
 */
export async function addItem(
  orderId: number | undefined,
  target: OrderTarget,
  item: Item,
  options: LineOption[],
  staffId: number,
): Promise<number> {
  const id = orderId ?? (await openOrder(target, staffId))
  await db.transaction('rw', 'orderLines', async () => {
    const existing = await db.orderLines
      .where('orderId')
      .equals(id)
      .filter((l) => l.itemId === item.id && !l.note && sameOptions(l.options, options))
      .first()
    if (existing) {
      await db.orderLines.update(existing.id!, { qty: existing.qty + 1 })
      return
    }
    await db.orderLines.add({
      orderId: id,
      itemId: item.id!,
      nameSnapshot: item.name,
      priceSnapshot: item.price + options.reduce((s, o) => s + o.priceDelta, 0),
      qty: 1,
      options,
      createdAt: Date.now(),
    })
  })
  return id
}

export type LineChangeResult = 'ok' | 'below-paid' | 'order-removed'

/**
 * بيغيّر كمية سطر (0 = حذف). ممنوع ينزل مجموع الطلب تحت اللي انْدفع.
 * إذا الطلب صار فاضي وما عليه دفعات، بينحذف كأنه ما انفتح.
 */
export async function setLineQty(line: OrderLine, qty: number): Promise<LineChangeResult> {
  return db.transaction('rw', ['orders', 'orderLines', 'payments'], async () => {
    const lines = await db.orderLines.where('orderId').equals(line.orderId).toArray()
    const paid = paymentsTotal(await db.payments.where('orderId').equals(line.orderId).toArray())
    const newTotal = linesTotal(lines) + line.priceSnapshot * (qty - line.qty)
    if (newTotal < paid) return 'below-paid'

    if (qty > 0) {
      await db.orderLines.update(line.id!, { qty })
      return 'ok'
    }
    await db.orderLines.delete(line.id!)
    if (lines.length === 1 && paid === 0) {
      await db.orders.delete(line.orderId)
      return 'order-removed'
    }
    return 'ok'
  })
}

export async function setLineNote(line: OrderLine, note: string) {
  const trimmed = note.trim()
  await db.orderLines.update(line.id!, { note: trimmed || undefined })
}

/** بيسجّل دفعة. إذا اكتمل المبلغ بيسكّر الطلب. بيرجع true إذا الطلب انْدفع كامل. */
export async function addPayment(
  orderId: number,
  method: PaymentMethod,
  amount: number,
  staffId: number,
): Promise<boolean> {
  return db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts'], async () => {
    const shift = await getOpenShift()
    if (!shift) throw new Error('ما في شيفت مفتوح')
    const total = linesTotal(await db.orderLines.where('orderId').equals(orderId).toArray())
    const paid = paymentsTotal(await db.payments.where('orderId').equals(orderId).toArray())
    const remaining = total - paid
    if (amount <= 0 || amount > remaining) throw new Error('مبلغ غير صحيح')

    await db.payments.add({ orderId, method, amount, createdAt: Date.now(), staffId, shiftId: shift.id! })
    if (paid + amount >= total) {
      await db.orders.update(orderId, { status: 'paid', closedAt: Date.now() })
      return true
    }
    return false
  })
}

export async function orderHasPayments(orderId: number): Promise<boolean> {
  return (await db.payments.where('orderId').equals(orderId).count()) > 0
}

/**
 * إلغاء طلب مفتوح. بيضل محفوظ بحالة void عشان يبين بالتقارير.
 * إذا عليه دفعات، لازم موافقة المالك (byOwner)، ودفعاته ما بتنحسب بالمبيعات (رجعت للزبون).
 */
export async function voidOrder(orderId: number, byUserId: number, byOwner: boolean): Promise<boolean> {
  return db.transaction('rw', ['orders', 'payments'], async () => {
    if (!byOwner && (await orderHasPayments(orderId))) return false
    await db.orders.update(orderId, { status: 'void', closedAt: Date.now(), voidedBy: byUserId })
    return true
  })
}

/** تصحيح طريقة الدفع (كاش ↔ كليك). بيتسجّل مين صحّح ومتى، وبسجل التعديلات. */
export async function correctPayment(payment: Payment, byUserId: number) {
  const to: PaymentMethod = payment.method === 'cash' ? 'cliq' : 'cash'
  await db.transaction('rw', ['payments', 'paymentCorrections', 'orders', 'auditLog'], async () => {
    await db.payments.update(payment.id!, { method: to })
    await db.paymentCorrections.add({
      paymentId: payment.id!,
      orderId: payment.orderId,
      from: payment.method,
      to,
      byUserId,
      at: Date.now(),
    })
    await logPaymentCorrection(payment, to, byUserId)
  })
}

/** نقل طلب مفتوح لطاولة فاضية. */
export async function moveOrder(orderId: number, table: CafeTable): Promise<boolean> {
  return db.transaction('rw', 'orders', async () => {
    const busy = await db.orders
      .where('tableId')
      .equals(table.id!)
      .filter((o) => o.status === 'open')
      .count()
    if (busy) return false
    await db.orders.update(orderId, { tableId: table.id, takeaway: false, takeawayNo: undefined, label: table.name })
    return true
  })
}

export async function setItemActive(itemId: number, active: boolean) {
  await db.items.update(itemId, { active })
}

export function optionsLabel(options: LineOption[]): string {
  return options.map((o) => o.choice).join(' · ')
}

