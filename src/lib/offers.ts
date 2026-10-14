import { db, HOOKAH_LIST_ID } from '../db/db'
import type { Item, OptionChoice, OptionGroup, OptionList } from '../db/types'
export { WEEK_DAYS, scheduleParts } from './schedule'

// العروض: قسم «عروض» بالمنيو. العرض صنف عادي بسعر ثابت، وخياراته (نكهة الأرجيلة، نوع المشروب)
// بتنفتح لما ينضاف. إله أوقات وأيام، وبرّاها ما بينضاف.

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** الصنف متاح هلق؟ (الأوقات بتلف على نص الليل إذا «من» أكبر من «لـ») */
export function isAvailable(item: Item, now = new Date()): boolean {
  const s = item.schedule
  if (!s) return true
  if (s.days?.length && !s.days.includes(now.getDay())) return false
  if (s.from && s.to) {
    const t = now.getHours() * 60 + now.getMinutes()
    const from = minutes(s.from)
    const to = minutes(s.to)
    return from <= to ? t >= from && t < to : t >= from || t < to
  }
  return true
}

/** "شاي ×2" → ["شاي", 2] */
export function splitPicked(choice: string): [string, number] {
  const m = choice.match(/^(.*) ×(\d+)$/)
  return m ? [m[1], Number(m[2])] : [choice, 1]
}

export const HOT_DRINKS_LIST_ID = 'offer-hot-drinks'

const c = (name: string): OptionChoice => ({ id: name, name, priceDelta: 0 })

const HOT_DRINKS: OptionList = {
  id: HOT_DRINKS_LIST_ID,
  name: 'مشروبات سخنة (للعروض)',
  choices: ['شاي', 'قهوة تركي', 'أعشاب', 'قرفة', 'عنّاب', 'نسكافيه بلاك'].map(c),
}

const hookah = (id: string, name: string, pick?: number): OptionGroup => ({
  id,
  name,
  required: true,
  choices: [],
  listId: HOOKAH_LIST_ID,
  // سعر العرض ثابت: النكهات الخاصة ما بتزيد عليه (المالك بيقدر يغيّرها من «المنيو»)
  applyDeltas: false,
  ...(pick ? { pick } : {}),
})

const OFFERS: Omit<Item, 'categoryId' | 'sort'>[] = [
  {
    name: 'فطور الطلّة',
    description: 'قهوة تركي أو أمريكانو + كوكيز بيتي',
    price: 2250,
    active: true,
    isSeasonal: false,
    schedule: { from: '09:00', to: '12:00' },
    options: [{ id: 'coffee', name: 'القهوة', required: true, choices: [c('قهوة تركي'), c('أمريكانو')] }],
  },
  {
    name: 'قعدة اثنين',
    description: 'أرجيلة + 2 شاي أو تركي',
    price: 5000,
    active: true,
    isSeasonal: false,
    options: [
      hookah('flavor', 'نكهة الأرجيلة'),
      { id: 'drinks', name: 'المشروبات', required: true, pick: 2, choices: [c('شاي'), c('قهوة تركي')] },
    ],
  },
  {
    name: 'قعدة الشلّة',
    description: '2 أرجيلة + 4 مشروبات سخنة',
    price: 10000,
    active: true,
    isSeasonal: false,
    options: [
      hookah('flavors', 'نكهات الأراجيل', 2),
      { id: 'drinks', name: 'المشروبات السخنة', required: true, choices: [], listId: HOT_DRINKS_LIST_ID, applyDeltas: false, pick: 4 },
    ],
  },
]

const SEEDED_KEY = 'offers-seeded'

/**
 * أول مرة بس: قسم «عروض» (أول قسم بالمنيو) والعروض الثلاثة. بعدها المالك بيعدّلها من «المنيو»،
 * وإذا حذفها ما بترجع. لازم تشتغل بعد تعبئة المنيو الأولى.
 */
export async function ensureOffers() {
  await db.transaction('rw', ['categories', 'items', 'optionLists', 'settings'], async () => {
    if (await db.settings.get(SEEDED_KEY)) return
    const first = await db.categories.orderBy('sort').first()
    const categoryId = (await db.categories.add({ name: 'عروض', sort: (first?.sort ?? 0) - 1, active: true, kind: 'offers' }))!
    if (!(await db.optionLists.get(HOT_DRINKS_LIST_ID))) await db.optionLists.add(HOT_DRINKS)
    await db.items.bulkAdd(OFFERS.map((o, sort) => ({ ...o, categoryId, sort })))
    await db.settings.put({ key: SEEDED_KEY, value: true })
  })
}
