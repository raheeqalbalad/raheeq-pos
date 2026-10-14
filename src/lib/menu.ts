import { db } from '../db/db'
import type { Item, OptionList } from '../db/types'

// تعديل المنيو (للمالك). الطلبات القديمة ما بتتأثر: كل سطر طلب محفوظ فيه اسم وسعر الصنف وقت البيع.

export async function addCategory(name: string) {
  const last = await db.categories.orderBy('sort').last()
  return (await db.categories.add({ name: name.trim(), sort: (last?.sort ?? -1) + 1, active: true }))!
}

export async function updateCategory(id: number, changes: { name?: string; active?: boolean }) {
  await db.categories.update(id, changes)
}

/** بيبدّل مكان القسم مع اللي قبله (-1) أو بعده (+1). */
export async function moveCategory(id: number, dir: -1 | 1) {
  await db.transaction('rw', 'categories', async () => {
    const all = await db.categories.orderBy('sort').toArray()
    const i = all.findIndex((c) => c.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= all.length) return
    ;[all[i], all[j]] = [all[j], all[i]]
    await Promise.all(all.map((c, sort) => db.categories.update(c.id!, { sort })))
  })
}

/** بيحفظ صنف جديد أو معدّل. صنف جديد بينحط آخر القسم. */
export async function saveItem(item: Item): Promise<number> {
  return db.transaction('rw', 'items', async () => {
    if (item.id) {
      const before = await db.items.get(item.id)
      // إذا انتقل لقسم تاني، بينحط بآخره
      if (before && before.categoryId !== item.categoryId) item = { ...item, sort: await nextSort(item.categoryId) }
      await db.items.put(item)
      return item.id!
    }
    return (await db.items.add({ ...item, sort: await nextSort(item.categoryId) }))!
  })
}

async function nextSort(categoryId: number) {
  const items = await db.items.where('categoryId').equals(categoryId).toArray()
  return items.reduce((m, i) => Math.max(m, i.sort), -1) + 1
}

export async function deleteItem(id: number) {
  await db.items.delete(id)
}

export async function moveItem(item: Item, dir: -1 | 1) {
  await db.transaction('rw', 'items', async () => {
    const all = await db.items.where('categoryId').equals(item.categoryId).sortBy('sort')
    const i = all.findIndex((x) => x.id === item.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= all.length) return
    ;[all[i], all[j]] = [all[j], all[i]]
    await Promise.all(all.map((x, sort) => db.items.update(x.id!, { sort })))
  })
}

/** رقم فريد للخيارات والمجموعات الجديدة */
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export async function saveOptionList(list: OptionList) {
  await db.optionLists.put(list)
}
