import { db } from '../db/db'
import { openOrder, orderDue, paymentsTotal, type OrderTarget } from './orders'

// المي التلقائية: لما الموظف يحط عدد الزباين على طاولة، بتنضاف مي بعددهم (٤ أشخاص = ٤ مي).
// إذا غيّر العدد بعدين، المي بتزيد أو بتنقص بنفس الفرق (فاللي زاده أو شاله بإيده بيضل).
// المي بتتعدّل بس لما الموظف يغيّر عدد الزباين، مش مع أي تغيير تاني بالطلب.
// العدد اللي المي محسوبة عليه محفوظ على الطلب (waterGuests)، فلو انكبس «تم» مرتين، التانية ما بتضيف إشي.

export interface WaterSettings {
  enabled: boolean
  /** المي مجانية (بسعر صفر) ولا بسعرها من المنيو */
  free: boolean
}

const KEY = 'water'
export const DEFAULT_WATER: WaterSettings = { enabled: true, free: false }
export const WATER_NAME = 'مي'

export async function getWaterSettings(): Promise<WaterSettings> {
  return { ...DEFAULT_WATER, ...((await db.settings.get(KEY))?.value as Partial<WaterSettings> | undefined) }
}

export async function saveWaterSettings(s: WaterSettings) {
  await db.settings.put({ key: KEY, value: s })
}

/** صنف المي من المنيو */
export const waterItem = () => db.items.filter((i) => i.name === WATER_NAME).first()

const guestsTotal = (g?: { men: number; women: number; kids: number }) => (g ? g.men + g.women + g.kids : 0)

/**
 * بيحط عدد الزباين على الطاولة وبيظبّط المي التلقائية عليه، بمعاملة وحدة.
 * إذا الطلب لسا مش مفتوح وفي زباين (والمي شغّالة)، بيفتحه. بيرجع رقم الطلب (أو undefined).
 */
export async function setGuestsWithWater(
  orderId: number | undefined,
  target: OrderTarget,
  guests: { men: number; women: number; kids: number } | undefined,
  staffId: number,
): Promise<number | undefined> {
  const settings = await getWaterSettings()
  const item = settings.enabled ? await waterItem() : undefined
  const count = guestsTotal(guests)
  // shifts: فتح الطلب بيقرا الشيفت المفتوح (ترقيم التيك أواي)، فلازم يكون ضمن المعاملة
  return db.transaction('rw', ['orders', 'orderLines', 'payments', 'shifts'], async () => {
    let id = orderId
    if (!id) {
      // ما في طلب لسا: بنفتحه بس إذا في مي تنضاف
      if (!item || count === 0) return undefined
      id = await openOrder(target, staffId)
    }
    const order = await db.orders.get(id)
    if (!order || order.status !== 'open') return id
    await db.orders.update(id, { guests })
    if (!item) return id

    // الفرق عن آخر عدد انحسبت عليه المي (الطلبات القديمة: عدد زباينها)
    const delta = count - (order.waterGuests ?? guestsTotal(order.guests))
    const lines = await db.orderLines.where('orderId').equals(id).toArray()
    const line = lines.find((l) => l.autoWater)
    if (delta > 0) {
      if (line) await db.orderLines.update(line.id!, { qty: line.qty + delta })
      else
        await db.orderLines.add({
          orderId: id,
          itemId: item.id!,
          nameSnapshot: item.name,
          priceSnapshot: settings.free ? 0 : item.price,
          ...(item.cost !== undefined ? { costSnapshot: item.cost } : {}),
          qty: delta,
          options: [],
          autoWater: true,
          createdAt: Date.now(),
        })
      await db.orders.update(id, { waterGuests: count, lastAddedAt: Date.now() })
    } else if (delta < 0 && line) {
      const qty = Math.max(0, line.qty + delta)
      // ما بنقّص تحت اللي انْدفع
      const changed = lines.map((l) => (l.id === line.id ? { ...l, qty } : l)).filter((l) => l.qty > 0)
      const paid = paymentsTotal(await db.payments.where('orderId').equals(id).toArray())
      if (orderDue(changed, order) >= paid) {
        if (qty > 0) await db.orderLines.update(line.id!, { qty })
        else await db.orderLines.delete(line.id!)
      }
      await db.orders.update(id, { waterGuests: count })
    } else {
      await db.orders.update(id, { waterGuests: count })
    }
    return id
  })
}

const CLEANUP_FLAG = 'water-cleanup-1'

/**
 * مرة وحدة (بعد مشكلة المي اللي كانت تنضاف أكثر من مرة): أي طلب مفتوح فيه مي تلقائية أكثر
 * من عدد زباينه بيرجع لعدد الزباين.
 */
export async function cleanupExtraWater() {
  await db.transaction('rw', ['orders', 'orderLines', 'payments', 'settings'], async () => {
    if (await db.settings.get(CLEANUP_FLAG)) return
    const open = await db.orders.where('status').equals('open').toArray()
    for (const order of open) {
      const lines = await db.orderLines.where('orderId').equals(order.id!).toArray()
      const line = lines.find((l) => l.autoWater)
      const count = guestsTotal(order.guests)
      if (line && line.qty > count) {
        const changed = lines.map((l) => (l.id === line.id ? { ...l, qty: count } : l)).filter((l) => l.qty > 0)
        const paid = paymentsTotal(await db.payments.where('orderId').equals(order.id!).toArray())
        if (orderDue(changed, order) >= paid) {
          if (count > 0) await db.orderLines.update(line.id!, { qty: count })
          else await db.orderLines.delete(line.id!)
        }
      }
      if (line) await db.orders.update(order.id!, { waterGuests: count })
    }
    await db.settings.put({ key: CLEANUP_FLAG, value: Date.now() })
  })
}

const BACKFILL_FLAG = 'water-backfill-1'

/**
 * مرة وحدة (بعد مشكلة المي اللي ما كانت تنضاف): الطاولات المفتوحة اللي إلها عدد زباين وما عليها مي أبدًا
 * (لا تلقائية ولا بالإيد) بتنضافلها المي بعدد الزباين.
 */
export async function backfillMissingWater() {
  const settings = await getWaterSettings()
  const item = settings.enabled ? await waterItem() : undefined
  await db.transaction('rw', ['orders', 'orderLines', 'settings'], async () => {
    if (await db.settings.get(BACKFILL_FLAG)) return
    if (item) {
      for (const order of await db.orders.where('status').equals('open').toArray()) {
        const count = guestsTotal(order.guests)
        if (!count || order.waterGuests !== undefined || order.takeaway) continue
        const lines = await db.orderLines.where('orderId').equals(order.id!).toArray()
        if (lines.some((l) => l.autoWater || l.itemId === item.id)) continue
        await db.orderLines.add({
          orderId: order.id!,
          itemId: item.id!,
          nameSnapshot: item.name,
          priceSnapshot: settings.free ? 0 : item.price,
          ...(item.cost !== undefined ? { costSnapshot: item.cost } : {}),
          qty: count,
          options: [],
          autoWater: true,
          createdAt: Date.now(),
        })
        await db.orders.update(order.id!, { waterGuests: count })
      }
    }
    await db.settings.put({ key: BACKFILL_FLAG, value: Date.now() })
  })
}
