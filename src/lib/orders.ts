import { db } from '../db/db'
import { headChange, headChangeLabel, hookahLabels, syncCoals } from './floor'
import type { CafeTable, Item, LineOption, Order, OrderLine, Payment, PaymentMethod } from '../db/types'
import { getOpenShift } from './shift'
import { logAudit, logPaymentCorrection } from './audit'
import { formatJod } from './money'
import { getCliqSettings } from './cliq'

export type OrderTarget = { tableId: number; label: string } | { takeaway: true }

export function linesTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.priceSnapshot * l.qty, 0)
}

/** المطلوب من الزبون: مجموع الأصناف ناقص الخصومات (ما بينزل تحت الصفر). */
export function orderDue(lines: OrderLine[], order: Pick<Order, 'loyaltyDiscount' | 'manualDiscount'> | undefined): number {
  return Math.max(0, linesTotal(lines) - orderDiscounts(order))
}

/** مجموع الخصومات على الطلب (ولاء + يدوي). */
export function orderDiscounts(order: Pick<Order, 'loyaltyDiscount' | 'manualDiscount'> | undefined): number {
  return (order?.loyaltyDiscount ?? 0) + (order?.manualDiscount?.amount ?? 0)
}

export function paymentsTotal(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

/** بداية يوم الشغل: فتح الشيفت المفتوح (ترقيم التيك أواي ما بيرجع لـ 1 بعد نص الليل) */
async function startOfBusinessDay(): Promise<number> {
  const shift = await getOpenShift()
  if (shift) return shift.openedAt
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** بيرجع الطلب المفتوح على الطاولة، أو بيفتح واحد جديد. */
export async function openOrder(target: OrderTarget, staffId: number): Promise<number> {
  return db.transaction('rw', ['orders', 'shifts'], async () => {
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
      .aboveOrEqual(await startOfBusinessDay())
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
  const hookahs = hookahLabels(item, options)
  await db.transaction('rw', ['orders', 'orderLines', 'categories'], async () => {
    await db.orders.update(id, { lastAddedAt: Date.now() })
    const isOffer = (await db.categories.get(item.categoryId))?.kind === 'offers'
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
      ...(item.cost !== undefined ? { costSnapshot: item.cost + options.reduce((s, o) => s + (o.costDelta ?? 0), 0) } : {}),
      ...(isOffer ? { isOffer: true } : {}),
      ...(hookahs.length ? { hookahs } : {}),
      qty: 1,
      options,
      createdAt: Date.now(),
    })
  })
  // مؤقت الفحم: أرجيلة جديدة بتبلّش مؤقت، و«تغيير راس» بيصفّر واحد
  if (item.coalReset) await headChange(id, headChangeLabel(item, options))
  else if (hookahs.length) await syncCoals(id)
  return id
}

export type LineChangeResult = 'ok' | 'below-paid' | 'order-removed'

/**
 * بيغيّر كمية سطر (0 = حذف). ممنوع ينزل المطلوب تحت اللي انْدفع.
 * إذا الطلب صار فاضي وما عليه دفعات، بينحذف كأنه ما انفتح.
 * أي تنقيص بينسجّل بسجل التعديلات باسم اللي عمله.
 */
export async function setLineQty(line: OrderLine, qty: number, byUserId: number): Promise<LineChangeResult> {
  return db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts', 'auditLog'], async () => {
    const order = await db.orders.get(line.orderId)
    const lines = await db.orderLines.where('orderId').equals(line.orderId).toArray()
    const paid = paymentsTotal(await db.payments.where('orderId').equals(line.orderId).toArray())
    const changed = lines.map((l) => (l.id === line.id ? { ...l, qty } : l)).filter((l) => l.qty > 0)
    if (orderDue(changed, order) < paid) return 'below-paid'

    const removed = line.qty - qty
    const logRemoval = async (extra = '') => {
      if (removed <= 0 || !order) return
      const shift = await getOpenShift()
      await logAudit({
        kind: 'line',
        byUserId,
        orderId: line.orderId,
        shiftId: shift?.id,
        amount: removed * line.priceSnapshot,
        summary: `شال ${removed}× ${line.nameSnapshot} من ${order.label} (−${formatJod(removed * line.priceSnapshot)})${extra}`,
        before: { qty: line.qty },
        after: { qty },
      })
    }

    if (qty > 0) {
      await db.orderLines.update(line.id!, { qty })
      if (qty > line.qty) await db.orders.update(line.orderId, { lastAddedAt: Date.now() })
      await logRemoval()
      if (line.hookahs) await syncCoals(line.orderId)
      return 'ok'
    }
    await db.orderLines.delete(line.id!)
    if (lines.length === 1 && paid === 0) {
      await db.orders.delete(line.orderId)
      await logRemoval('، والطلب فضي وانشال')
      return 'order-removed'
    }
    await logRemoval()
    if (line.hookahs) await syncCoals(line.orderId)
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
  /** للكليك: على حساب مين */
  cliq?: { key: string; name: string },
): Promise<boolean> {
  return db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts'], async () => {
    const shift = await getOpenShift()
    if (!shift) throw new Error('ما في شيفت مفتوح')
    const order = await db.orders.get(orderId)
    const total = orderDue(await db.orderLines.where('orderId').equals(orderId).toArray(), order)
    const paid = paymentsTotal(await db.payments.where('orderId').equals(orderId).toArray())
    const remaining = total - paid
    if (amount <= 0 || amount > remaining) throw new Error('مبلغ غير صحيح')

    await db.payments.add({
      orderId,
      method,
      amount,
      createdAt: Date.now(),
      staffId,
      shiftId: shift.id!,
      ...(method === 'cliq' && cliq ? { cliqAccount: cliq.key, cliqAccountName: cliq.name } : {}),
    })
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
 * إلغاء طلب مفتوح. بيضل محفوظ بحالة void عشان يبين بالتقارير، وبينسجّل بسجل التعديلات.
 * إذا عليه دفعات، لازم موافقة المالك (approvedBy)، ودفعاته ما بتنحسب بالمبيعات (رجعت للزبون).
 */
export async function voidOrder(orderId: number, byUserId: number, approvedBy?: number): Promise<boolean> {
  return db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts', 'auditLog'], async () => {
    if (!approvedBy && (await orderHasPayments(orderId))) return false
    const order = (await db.orders.get(orderId))!
    const total = linesTotal(await db.orderLines.where('orderId').equals(orderId).toArray())
    await db.orders.update(orderId, { status: 'void', closedAt: Date.now(), voidedAt: Date.now(), voidedBy: byUserId })
    const shift = await getOpenShift()
    await logAudit({
      kind: 'void',
      byUserId,
      approvedBy,
      orderId,
      shiftId: shift?.id,
      amount: total,
      summary: `ألغى ${order.label} (${formatJod(total)})${approvedBy ? ' بموافقة المالك' : ''}`,
      before: { status: order.status },
      after: { status: 'void' },
    })
    return true
  })
}

/** تصحيح طريقة الدفع (كاش ↔ كليك). بيتسجّل مين صحّح ومتى، وبسجل التعديلات. */
export async function correctPayment(payment: Payment, byUserId: number) {
  const to: PaymentMethod = payment.method === 'cash' ? 'cliq' : 'cash'
  // كاش ← كليك: على الحساب التلقائي. كليك ← كاش: بنشيل الحساب.
  const cliqSettings = await getCliqSettings()
  const account = cliqSettings.accounts.find((a) => a.id === cliqSettings.defaultId)
  await db.transaction('rw', ['payments', 'paymentCorrections', 'orders', 'auditLog'], async () => {
    await db.payments.update(
      payment.id!,
      to === 'cliq'
        ? { method: to, cliqAccount: account?.id, cliqAccountName: account?.name }
        : { method: to, cliqAccount: undefined, cliqAccountName: undefined },
    )
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


export async function setOrderGuests(orderId: number, guests: Order['guests']) {
  await db.orders.update(orderId, { guests })
}
