import { db } from '../db/db'
import type { CafeTable, TableArea } from '../db/types'
import { logAudit } from './audit'

// تعديل الطاولات (المالك): تغيير الاسم أو المكان، زيادة طاولة، شيل طاولة. كل تعديل بسجل التعديلات.

export const AREA_LABEL: Record<TableArea, string> = { balcony: 'البلكونة', inside: 'جوا' }

/** بيحفظ طاولة (جديدة أو موجودة). الطلب المفتوح عليها بياخد الاسم الجديد. */
export async function saveTable(table: CafeTable, byUserId: number) {
  const name = table.name.trim()
  if (!name) throw new Error('اكتب اسم الطاولة')
  await db.transaction('rw', ['cafeTables', 'orders', 'auditLog'], async () => {
    const all = await db.cafeTables.toArray()
    if (all.some((t) => t.id !== table.id && t.name.trim() === name)) throw new Error(`في طاولة اسمها «${name}»`)
    const old = table.id == null ? undefined : all.find((t) => t.id === table.id)
    if (old && old.name === name && old.area === table.area) return
    const row: CafeTable = {
      ...(table.id == null ? {} : { id: table.id }),
      name,
      area: table.area,
      sort: old?.sort ?? Math.max(-1, ...all.map((t) => t.sort)) + 1,
    }
    const id = (await db.cafeTables.put(row)) as number
    if (old && old.name !== name)
      await db.orders
        .where('tableId')
        .equals(id)
        .filter((o) => o.status === 'open')
        .modify({ label: name })
    const changes = old
      ? [
          old.name !== name ? `«${old.name}» ← «${name}»` : `«${name}»`,
          old.area !== table.area ? `${AREA_LABEL[old.area]} ← ${AREA_LABEL[table.area]}` : '',
        ].filter(Boolean)
      : []
    await logAudit({
      kind: 'table',
      byUserId,
      summary: old ? `عدّل طاولة ${changes.join('، ')}` : `زاد طاولة «${name}» (${AREA_LABEL[table.area]})`,
      before: old,
      after: { ...row, id },
    })
  })
}

/** بيشيل طاولة. الطلبات القديمة عليها بتضل بأسمائها بالتقارير. */
export async function deleteTable(tableId: number, byUserId: number) {
  await db.transaction('rw', ['cafeTables', 'orders', 'auditLog'], async () => {
    const table = await db.cafeTables.get(tableId)
    if (!table) return
    const open = await db.orders
      .where('tableId')
      .equals(tableId)
      .filter((o) => o.status === 'open')
      .count()
    if (open) throw new Error(`«${table.name}» عليها طلب مفتوح. سكّره أو انقله أول`)
    await db.cafeTables.delete(tableId)
    await logAudit({ kind: 'table', byUserId, summary: `شال طاولة «${table.name}» (${AREA_LABEL[table.area]})`, before: table })
  })
}
