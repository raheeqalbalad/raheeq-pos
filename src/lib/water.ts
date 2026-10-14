import { db } from '../db/db'
import { linesTotal, openOrder, orderDue, paymentsTotal, type OrderTarget } from './orders'

// المي التلقائية: لما ينحط عدد الزباين على طاولة، بتنضاف مي بعددهم (٤ أشخاص = ٤ مي).
// إذا تغيّر العدد بعدين، المي بتزيد أو بتنقص بنفس الفرق (فاللي زاده أو شاله الموظف بإيده بيضل).

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

/**
 * بيزيد أو بينقّص المي التلقائية بفرق عدد الزباين. إذا الطلب لسا مش مفتوح وفي زباين، بيفتحه.
 * بيرجع رقم الطلب (أو undefined إذا ما في طلب).
 */
export async function adjustAutoWater(
  orderId: number | undefined,
  target: OrderTarget,
  delta: number,
  staffId: number,
): Promise<number | undefined> {
  const settings = await getWaterSettings()
  const item = await waterItem()
  if (!settings.enabled || !item || !delta) return orderId
  if (!orderId) {
    if (delta < 0) return orderId
    orderId = await openOrder(target, staffId)
  }
  const id = orderId
  await db.transaction('rw', ['orders', 'orderLines', 'payments'], async () => {
    const order = await db.orders.get(id)
    if (!order || order.status !== 'open') return
    const lines = await db.orderLines.where('orderId').equals(id).toArray()
    const line = lines.find((l) => l.autoWater)
    const qty = Math.max(0, (line?.qty ?? 0) + delta)
    if (delta > 0) {
      if (line) await db.orderLines.update(line.id!, { qty })
      else
        await db.orderLines.add({
          orderId: id,
          itemId: item.id!,
          nameSnapshot: item.name,
          priceSnapshot: settings.free ? 0 : item.price,
          ...(item.cost !== undefined ? { costSnapshot: item.cost } : {}),
          qty,
          options: [],
          autoWater: true,
          createdAt: Date.now(),
        })
      await db.orders.update(id, { lastAddedAt: Date.now() })
      return
    }
    if (!line) return
    // ما بنقّص تحت اللي انْدفع
    const changed = lines.map((l) => (l.id === line.id ? { ...l, qty } : l)).filter((l) => l.qty > 0)
    const paid = paymentsTotal(await db.payments.where('orderId').equals(id).toArray())
    if (orderDue(changed, order) < paid) return
    if (qty > 0) await db.orderLines.update(line.id!, { qty })
    else {
      await db.orderLines.delete(line.id!)
      // الطلب فضي وما عليه دفعات: كأنه ما انفتح
      if (!changed.length && paid === 0 && linesTotal(changed) === 0) await db.orders.delete(id)
    }
  })
  return (await db.orders.get(id)) ? id : undefined
}
