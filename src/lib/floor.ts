import { db, HOOKAH_LIST_ID } from '../db/db'
import type { CoalTimer, Item, LineOption, Order } from '../db/types'
import { splitPicked } from './offers'
import { newId } from './menu'

// شاشة الطاولات: مؤقت الفحم لكل أرجيلة، والطاولة الساكتة (صارلها فترة ما انضاف عليها إشي).

export interface FloorSettings {
  /** بعد كم دقيقة لازم يتغيّر الفحم */
  coalMinutes: number
  /** بعد كم دقيقة بدون طلب الطاولة بتصير «ساكتة» */
  idleMinutes: number
}

const KEY = 'floor'
export const DEFAULT_FLOOR: FloorSettings = { coalMinutes: 25, idleMinutes: 45 }

export async function getFloorSettings(): Promise<FloorSettings> {
  return { ...DEFAULT_FLOOR, ...((await db.settings.get(KEY))?.value as Partial<FloorSettings> | undefined) }
}

export async function saveFloorSettings(s: FloorSettings) {
  for (const v of [s.coalMinutes, s.idleMinutes])
    if (!Number.isInteger(v) || v < 1 || v > 600) throw new Error('الدقائق لازم تكون بين 1 و600')
  await db.settings.put({ key: KEY, value: s })
}

/**
 * نكهة كل أرجيلة بوحدة وحدة من الصنف: الصنف اللي إله مجموعة مربوطة بنكهات الأرجيلة
 * (أرجيلة = وحدة، قعدة الشلّة = 2). «تغيير راس» ما بيبلّش أرجيلة جديدة.
 */
export function hookahLabels(item: Item, options: LineOption[]): string[] {
  if (item.coalReset) return []
  const labels: string[] = []
  for (const g of item.options) {
    if (g.listId !== HOOKAH_LIST_ID) continue
    const chosen = options
      .filter((o) => o.groupId === g.id)
      .flatMap((o) => {
        const [name, n] = splitPicked(o.choice)
        return Array<string>(n).fill(name)
      })
    const count = Math.max(g.pick ?? 1, chosen.length)
    for (let i = 0; i < count; i++) labels.push(chosen[i] ?? 'أرجيلة')
  }
  return labels
}

/** نكهة «تغيير راس» (أول خيار من مجموعة النكهات) */
export function headChangeLabel(item: Item, options: LineOption[]): string {
  const g = item.options.find((x) => x.listId === HOOKAH_LIST_ID)
  return options.find((o) => o.groupId === g?.id)?.choice ?? 'تغيير راس'
}

/**
 * بيظبّط مؤقتات الفحم حسب أراجيل الطلب: أرجيلة جديدة = مؤقت جديد من هلق،
 * وأرجيلة انشالت = مؤقتها بينشال (الأحدث أول).
 */
export async function syncCoals(orderId: number) {
  await db.transaction('rw', ['orders', 'orderLines'], async () => {
    const order = await db.orders.get(orderId)
    if (!order || order.status !== 'open') return
    const lines = await db.orderLines.where('orderId').equals(orderId).sortBy('createdAt')
    const old = order.coals ?? []
    const now = Date.now()
    const next: CoalTimer[] = []
    for (const l of lines) {
      if (!l.hookahs?.length) continue
      const want = l.qty * l.hookahs.length
      const mine = old.filter((t) => t.lineId === l.id)
      next.push(...mine.slice(0, want))
      for (let i = mine.length; i < want; i++)
        next.push({ id: newId(), lineId: l.id!, label: l.hookahs[i % l.hookahs.length], since: now, changes: 0 })
    }
    const same = next.length === old.length && next.every((t, i) => t.id === old[i].id)
    if (!same) await db.orders.update(orderId, { coals: next })
  })
}

/** غيّرت الفحم: المؤقت بيرجع من الأول. */
export async function changeCoal(orderId: number, timerId: string, label?: string) {
  await db.transaction('rw', 'orders', async () => {
    const order = await db.orders.get(orderId)
    if (!order?.coals) return
    await db.orders.update(orderId, {
      coals: order.coals.map((t) =>
        t.id === timerId ? { ...t, since: Date.now(), changes: t.changes + 1, ...(label ? { label } : {}) } : t,
      ),
    })
  })
}

/** «تغيير راس»: بيصفّر مؤقت الأرجيلة اللي صارلها أطول وقت، وبيحط النكهة الجديدة. */
export async function headChange(orderId: number, label: string) {
  const order = await db.orders.get(orderId)
  const oldest = [...(order?.coals ?? [])].sort((a, b) => a.since - b.since)[0]
  if (oldest) await changeCoal(orderId, oldest.id, label)
}

export const coalMinutesOf = (t: CoalTimer, now: number) => Math.max(0, Math.floor((now - t.since) / 60000))

export const coalDue = (t: CoalTimer, s: FloorSettings, now: number) => coalMinutesOf(t, now) >= s.coalMinutes

/** آخر مرة انضاف صنف على الطلب */
export const lastAddedOf = (o: Order) => o.lastAddedAt ?? o.openedAt

const FLAG = 'coal-reset-flag'

/** أول مرة: «تغيير راس» بيصفّر المؤقت (بعدها المالك بيغيّرها من «المنيو»). */
export async function ensureCoalReset() {
  await db.transaction('rw', ['items', 'settings'], async () => {
    if (await db.settings.get(FLAG)) return
    await db.items.toCollection().modify((i) => {
      if (i.name === 'تغيير راس') i.coalReset = true
    })
    await db.settings.put({ key: FLAG, value: true })
  })
}
