import type { Item, OptionGroup, OptionList } from '../db/types'

/**
 * مجموعات خيارات الصنف بعد ما نعبّي المربوط منها بقائمة مشتركة.
 * إذا الصنف ما بيطبّق فروق الأسعار (مثل «تغيير راس»)، الفروق بتصير صفر.
 */
export function resolveGroups(item: Item, lists: Map<string, OptionList> | undefined): OptionGroup[] {
  return item.options.map((g) => {
    if (!g.listId) return g
    const list = lists?.get(g.listId)
    const choices = (list?.choices ?? []).map((c) => (g.applyDeltas ? c : { ...c, priceDelta: 0 }))
    return { ...g, choices }
  })
}
