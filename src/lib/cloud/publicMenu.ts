import { db } from '../../db/db'
import { resolveGroups } from '../options'

// المنيو العام لصفحة الـ QR: أسماء وأسعار ووصف وأوقات العروض بس.
// ما فيه تكلفة ولا أرقام داخلية ولا أي إشي من المبيعات أو الزباين أو الرموز.

export interface PublicMenuItem {
  name: string
  description?: string
  price: number
  seasonal?: boolean
  schedule?: { from?: string; to?: string; days?: number[] }
  options?: { name: string; pick?: number; choices: { name: string; priceDelta?: number; group?: string }[] }[]
}

export interface PublicMenu {
  categories: { name: string; offers?: boolean; items: PublicMenuItem[] }[]
}

export async function buildPublicMenu(): Promise<PublicMenu> {
  const [categories, items, lists] = await Promise.all([
    db.categories.orderBy('sort').filter((c) => c.active).toArray(),
    db.items.filter((i) => i.active).toArray(),
    db.optionLists.toArray(),
  ])
  const listMap = new Map(lists.map((l) => [l.id, l]))
  return {
    categories: categories
      .map((c) => ({
        name: c.name,
        ...(c.kind === 'offers' ? { offers: true } : {}),
        items: items
          .filter((i) => i.categoryId === c.id)
          .sort((a, b) => a.sort - b.sort)
          .map((i): PublicMenuItem => {
            const options = resolveGroups(i, listMap)
              .filter((g) => g.choices.length)
              .map((g) => ({
                name: g.name,
                ...(g.pick && g.pick > 1 ? { pick: g.pick } : {}),
                choices: g.choices.map((ch) => ({
                  name: ch.name,
                  ...(ch.priceDelta ? { priceDelta: ch.priceDelta } : {}),
                  ...(ch.group ? { group: ch.group } : {}),
                })),
              }))
            return {
              name: i.name,
              ...(i.description ? { description: i.description } : {}),
              price: i.price,
              ...(i.isSeasonal ? { seasonal: true } : {}),
              ...(i.schedule ? { schedule: i.schedule } : {}),
              ...(options.length ? { options } : {}),
            }
          }),
      }))
      .filter((c) => c.items.length),
  }
}
