import { db } from '../db/db'
import type { Customer, LoyaltySettings, Order } from '../db/types'
import { linesTotal, orderDue, paymentsTotal } from './orders'

// ===== أرقام التلفون =====

/**
 * بيوحّد الرقم الأردني لـ 07XXXXXXXX. بيقبل: 079XXXXXXX، 79XXXXXXX، +96279XXXXXXX، 0096279XXXXXXX.
 * بيرجع null إذا الرقم مش موبايل أردني.
 */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/[^\d]/g, '')
  if (d.startsWith('00962')) d = d.slice(5)
  else if (d.startsWith('962')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return /^7[789]\d{7}$/.test(d) ? `0${d}` : null
}

/** للواتساب: 9627XXXXXXXX */
export const whatsappPhone = (phone: string) => `962${phone.slice(1)}`

// ===== إعدادات الولاء =====

export const DEFAULT_LOYALTY: LoyaltySettings = {
  enabled: true,
  visitsNeeded: 5,
  discountPct: 50,
  maxDiscount: 5000,
  minOrder: 2000,
}

const LOYALTY_KEY = 'loyalty'

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const row = await db.settings.get(LOYALTY_KEY)
  return { ...DEFAULT_LOYALTY, ...((row?.value as Partial<LoyaltySettings>) ?? {}) }
}

export async function saveLoyaltySettings(s: LoyaltySettings) {
  await db.settings.put({ key: LOYALTY_KEY, value: s })
}

// ===== الزباين =====

export async function findCustomer(phone: string) {
  return db.customers.where('phone').equals(phone).first()
}

export async function saveCustomer(c: Omit<Customer, 'id' | 'createdAt'> & { id?: number }): Promise<number> {
  const phone = normalizePhone(c.phone)
  if (!phone) throw new Error('الرقم لازم يكون موبايل أردني (07...)')
  return db.transaction('rw', 'customers', async () => {
    const existing = await db.customers.where('phone').equals(phone).first()
    if (existing && existing.id !== c.id) throw new Error('هالرقم مسجّل لزبون تاني')
    const data = { phone, name: c.name?.trim() || undefined, marketingOptIn: c.marketingOptIn }
    if (c.id) {
      await db.customers.update(c.id, data)
      return c.id
    }
    return (await db.customers.add({ ...data, createdAt: Date.now() }))!
  })
}

// ===== الزيارات والولاء =====

export interface LoyaltyStatus {
  /** زيارات محسوبة من آخر خصم */
  progress: number
  /** بيستحق خصم على الزيارة هاي */
  eligible: boolean
  settings: LoyaltySettings
}

export interface CustomerStats {
  customer: Customer
  /** كل الزيارات المحسوبة (ومعها زيارات الخصم) */
  visits: number
  lastVisit?: number
  spent: number
  favorite?: string
  loyalty: LoyaltyStatus
}

interface PaidOrderInfo {
  order: Order
  subtotal: number
  paid: number
  shiftId?: number
}

/**
 * الزيارة = طلب مدفوع لزبون مسجّل، المجموع (قبل الخصم) ≥ الحد الأدنى، وزيارة وحدة بكل يوم شغل.
 * كل `visitsNeeded` زيارة، الزيارة اللي بعدها إلها خصم. زيارة الخصم ما بتنحسب بالدورة الجاية.
 */
function computeLoyalty(paid: PaidOrderInfo[], settings: LoyaltySettings, skipOrderId?: number) {
  const days = new Set<string>()
  let visits = 0
  let progress = 0
  for (const p of paid.sort((a, b) => a.order.closedAt! - b.order.closedAt!)) {
    if (p.order.id === skipOrderId) continue
    const dayKey = p.shiftId !== undefined ? `s${p.shiftId}` : new Date(p.order.closedAt!).toDateString()
    if (days.has(dayKey)) continue
    if (p.order.loyaltyDiscount) {
      days.add(dayKey)
      visits++
      progress = 0
      continue
    }
    if (p.subtotal < settings.minOrder) continue
    days.add(dayKey)
    visits++
    progress++
  }
  return { visits, progress }
}

async function paidOrdersOf(customerIds: number[]): Promise<Map<number, PaidOrderInfo[]>> {
  const orders = (await db.orders.where('customerId').anyOf(customerIds).toArray()).filter((o) => o.status === 'paid')
  const ids = orders.map((o) => o.id!)
  const [lines, payments] = await Promise.all([
    db.orderLines.where('orderId').anyOf(ids).toArray(),
    db.payments.where('orderId').anyOf(ids).toArray(),
  ])
  const map = new Map<number, PaidOrderInfo[]>()
  for (const o of orders) {
    const ps = payments.filter((p) => p.orderId === o.id)
    const info: PaidOrderInfo = {
      order: o,
      subtotal: linesTotal(lines.filter((l) => l.orderId === o.id)),
      paid: paymentsTotal(ps),
      shiftId: ps[0]?.shiftId,
    }
    map.set(o.customerId!, [...(map.get(o.customerId!) ?? []), info])
  }
  return map
}

/** حالة الولاء لزبون (مع تجاهل الطلب الحالي إذا انعطى). */
export async function loyaltyStatus(customerId: number, currentOrderId?: number): Promise<LoyaltyStatus> {
  const settings = await getLoyaltySettings()
  const paid = (await paidOrdersOf([customerId])).get(customerId) ?? []
  const { progress } = computeLoyalty(paid, settings, currentOrderId)
  return { progress, eligible: settings.enabled && progress >= settings.visitsNeeded, settings }
}

/** إحصائيات كل الزباين لشاشة الزباين. */
export async function allCustomerStats(): Promise<CustomerStats[]> {
  const [customers, settings] = await Promise.all([db.customers.toArray(), getLoyaltySettings()])
  const paidMap = await paidOrdersOf(customers.map((c) => c.id!))
  const allPaid = [...paidMap.values()].flat()
  const lines = await db.orderLines.where('orderId').anyOf(allPaid.map((p) => p.order.id!)).toArray()

  return customers.map((customer) => {
    const paid = paidMap.get(customer.id!) ?? []
    const { visits, progress } = computeLoyalty(paid, settings)
    const counts = new Map<string, number>()
    for (const l of lines) {
      if (paid.some((p) => p.order.id === l.orderId)) counts.set(l.nameSnapshot, (counts.get(l.nameSnapshot) ?? 0) + l.qty)
    }
    const favorite = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    return {
      customer,
      visits,
      lastVisit: paid.length ? Math.max(...paid.map((p) => p.order.closedAt!)) : undefined,
      spent: paid.reduce((s, p) => s + p.paid, 0),
      favorite,
      loyalty: { progress, eligible: settings.enabled && progress >= settings.visitsNeeded, settings },
    }
  })
}

// ===== ربط الزبون بالطلب والخصم =====

export async function attachCustomer(orderId: number, customerId: number | undefined) {
  await db.transaction('rw', ['orders', 'payments'], async () => {
    const order = (await db.orders.get(orderId))!
    // تغيير الزبون بيشيل أي خصم انطبق للزبون القديم (إذا لسا ما انْدفع اشي)
    const paid = paymentsTotal(await db.payments.where('orderId').equals(orderId).toArray())
    await db.orders.update(orderId, {
      customerId,
      ...(order.customerId !== customerId && order.loyaltyDiscount && paid === 0 ? { loyaltyDiscount: undefined } : {}),
    })
  })
}

/** قيمة خصم الولاء على الطلب: نسبة من الفاتورة كاملة، بسقف. */
export function loyaltyDiscountFor(subtotal: number, s: LoyaltySettings) {
  return Math.min(Math.round((subtotal * s.discountPct) / 100 / 10) * 10, s.maxDiscount)
}

/** بيطبّق خصم الولاء إذا الزبون مستحق، وما بينزل المطلوب تحت اللي انْدفع. */
export async function applyLoyaltyDiscount(orderId: number) {
  await db.transaction('rw', ['orders', 'orderLines', 'payments', 'settings', 'customers'], async () => {
    const order = (await db.orders.get(orderId))!
    if (!order.customerId) throw new Error('لازم تسجّل الزبون أول')
    const status = await loyaltyStatus(order.customerId, orderId)
    if (!status.eligible) throw new Error('الزبون مش مستحق خصم هلق')
    const lines = await db.orderLines.where('orderId').equals(orderId).toArray()
    const discount = loyaltyDiscountFor(linesTotal(lines), status.settings)
    const paid = paymentsTotal(await db.payments.where('orderId').equals(orderId).toArray())
    if (orderDue(lines, { ...order, loyaltyDiscount: discount }) < paid) throw new Error('انْدفع من الطلب أكثر من المبلغ بعد الخصم')
    await db.orders.update(orderId, { loyaltyDiscount: discount })
  })
}

export async function removeLoyaltyDiscount(orderId: number) {
  await db.transaction('rw', ['orders', 'orderLines', 'payments'], async () => {
    const lines = await db.orderLines.where('orderId').equals(orderId).toArray()
    const paid = paymentsTotal(await db.payments.where('orderId').equals(orderId).toArray())
    const order = await db.orders.get(orderId)
    if (orderDue(lines, { ...order, loyaltyDiscount: undefined }) < paid) throw new Error('ما بنقدر نشيل الخصم')
    await db.orders.update(orderId, { loyaltyDiscount: undefined })
  })
}

/** إذا الطلب عليه خصم ولاء وتغيّرت أصنافه: الخصم بيتحسب من جديد على المجموع الجديد. */
export async function refreshLoyaltyDiscount(orderId: number) {
  const order = await db.orders.get(orderId)
  if (!order?.loyaltyDiscount || order.status !== 'open') return
  const [lines, settings, payments] = await Promise.all([
    db.orderLines.where('orderId').equals(orderId).toArray(),
    getLoyaltySettings(),
    db.payments.where('orderId').equals(orderId).toArray(),
  ])
  const discount = loyaltyDiscountFor(linesTotal(lines), settings)
  if (discount !== order.loyaltyDiscount && orderDue(lines, { ...order, loyaltyDiscount: discount }) >= paymentsTotal(payments)) {
    await db.orders.update(orderId, { loyaltyDiscount: discount })
  }
}
