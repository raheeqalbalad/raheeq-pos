import { db, HOOKAH_LIST_ID } from './db'
import type { Item, OptionChoice, OptionGroup } from './types'
import { toFils } from '../lib/money'

// المنيو والأسعار المبدئية للكافيه

const choice = (name: string, priceDelta = 0, group?: string): OptionChoice => ({
  id: name,
  name,
  priceDelta: toFils(priceDelta),
  ...(group ? { group } : {}),
})

const group = (id: string, name: string, choices: OptionChoice[]): OptionGroup => ({
  id,
  name,
  required: true,
  choices,
})

const HOT_COLD = group('temp', 'سخن ولا بارد', [choice('سخن'), choice('بارد')])
const ICE_CREAM = group('icecream', 'نوع البوظة', ['عربية', 'فانيلا', 'شوكليت', 'فراولة', 'أوريو'].map((n) => choice(n)))
const MILKSHAKE = group('milkshake', 'نكهة الميلك شيك', ['شوكليت', 'فانيلا', 'فراولة', 'عربية'].map((n) => choice(n)))
const ICED_TEA = group('icedtea', 'النكهة', [choice('خوخ'), choice('ليمون')])

const HOOKAH_FLAVORS: Record<string, string[]> = {
  'نكهتنا الخاصة': ['رحيق البلد'],
  'تفاحتين': ['تفاحتين نخلة', 'تفاحتين', 'تفاحتين ونعنع'],
  'نعنع': ['ليمون ونعنع', 'بطيخ ونعنع'],
  'علكة': ['علكة وقرفة', 'علكة ونعنع', 'علكة'],
  'عنب': ['عنب', 'عنب ونعنع', 'عنب وتوت'],
  'فواكه': ['مانغا', 'دراق', 'فراولة', 'بلوبيري', 'فخفخينا'],
  'مميّزة': ['مستكة', 'كاندي', 'كيف', 'بلوميست', 'Love', 'زغلول مع راس'],
}

/**
 * قائمة النكهات المشتركة. تفاحتين نخلة بـ 4.00 بدل 3.50، فبتنضاف كفرق سعر —
 * بس على الأرجيلة (applyDeltas)، مش على تغيير الراس.
 */
const HOOKAH_LIST = {
  id: HOOKAH_LIST_ID,
  name: 'نكهات الأرجيلة',
  choices: Object.entries(HOOKAH_FLAVORS).flatMap(([g, names]) =>
    names.map((n) => choice(n, n === 'تفاحتين نخلة' ? 0.5 : 0, g)),
  ),
}

const hookahFlavors = (applyDeltas: boolean): OptionGroup => ({
  ...group('flavor', 'النكهة', []),
  listId: HOOKAH_LIST_ID,
  applyDeltas,
})

type ItemSeed = [name: string, price: number, opts?: { options?: OptionGroup[]; description?: string }]

const MENU: { name: string; seasonal?: boolean; items: ItemSeed[] }[] = [
  {
    name: 'مشروبات الموسم',
    seasonal: true,
    items: [
      ['ذهب', 2.5, { description: 'لاتيه كركم وقرفة وعسل', options: [HOT_COLD] }],
      ['غروب', 2.5, { description: 'كركديه مثلّج وبرتقال' }],
      ['نسمة', 2.5, { description: 'إبريق شاي بالنعنع والميرمية' }],
      ['رمّان', 2.5, { description: 'موهيتو رمان بماء الورد والنعنع' }],
      ['شفق', 2.5, { description: 'ميلك شيك كراميل' }],
      ['روكا', 2.5, { description: 'جرجير وحليب وبوظة' }],
    ],
  },
  {
    name: 'سخن',
    items: [
      ['شاي', 1.5],
      ['بريق شاي', 2],
      ['شاي بالحليب / كرك', 2],
      ['أعشاب', 1.5],
      ['عنّاب', 1.5],
      ['قرفة', 1.5],
      ['سحلب', 2],
      ['نسكافيه حليب', 2],
      ['نسكافيه بلاك', 1.5],
      ['هوت شوكليت', 2],
      ['كاكاو', 2],
    ],
  },
  {
    name: 'قهوة',
    items: [
      ['تركي صغير', 1.5],
      ['تركي كبير', 2],
      ['اسبريسو سنقل', 1.5],
      ['اسبريسو دبل', 2],
      ['أمريكانو', 2, { options: [HOT_COLD] }],
      ['موكا', 2],
      ['آيس موكا', 2.5],
      ['كابتشينو', 2],
      ['موكاتشينو', 2],
      ['فرابتشينو', 2.5],
    ],
  },
  {
    name: 'لاتيه',
    items: [
      'كلاسيك لاتيه',
      'سبانيش لاتيه',
      'لاتيه فانيلا',
      'لاتيه كراميل',
      'ماتشا لاتيه',
      'لاتيه بندق',
      'لاتيه مكياتو',
      'كراميل مكياتو',
    ].map((n): ItemSeed => [n, 2.5, { options: [HOT_COLD] }]),
  },
  {
    name: 'بارد',
    items: [
      ['كركديه', 2.5],
      ['آيس تي', 2.5, { options: [ICED_TEA] }],
      ['موهيتو', 2.5],
      ['بينا كولادا', 2.5],
      ['ميلك شيك', 2.5, { options: [MILKSHAKE] }],
      ['بوظة', 2.5, { options: [ICE_CREAM] }],
    ],
  },
  {
    name: 'عصاير طازة',
    items: [
      'ليمون ونعنع',
      'مانغا',
      'فراولة',
      'برتقال',
      'فراولة بحليب',
      'موز بحليب',
      'موز وفراولة',
      'رمان',
      'كوكتيل',
    ].map((n): ItemSeed => [n, 2.5]),
  },
  {
    name: 'غازي',
    items: [
      ['ماتركس كولا', 1.5],
      ['ماتركس برتقال / أب', 1.5],
      ['ريد بول', 2.75],
      ['مشروب طاقة', 2],
      ['باربيكان', 2],
      ['مي', 0.25],
    ],
  },
  {
    name: 'حلو البيت',
    items: [
      ['كوكيز بيتي', 1.25],
      ['كيكة اليوم', 1.5],
      ['كريب شوكليت', 3],
      ['كريب موز وشوكليت', 3],
      ['كريب فواكه', 3.5],
    ],
  },
  {
    name: 'أراجيل',
    items: [
      ['أرجيلة', 3.5, { options: [hookahFlavors(true)] }],
      ['تغيير راس', 1.5, { options: [hookahFlavors(false)] }],
    ],
  },
]

const TABLES = [
  ...Array.from({ length: 7 }, (_, i) => ({ name: `بلكونة ${i + 1}`, area: 'balcony' as const, sort: i })),
  ...Array.from({ length: 6 }, (_, i) => ({ name: `جوا ${i + 1}`, area: 'inside' as const, sort: 10 + i })),
]

// ما في مستخدمين ولا رموز بالكود: أول مرة بيفتح التطبيق، المالك بيحددهم من شاشة الإعداد.

/** بيعبّي القاعدة أول مرة بس (إذا فاضية). */
export async function seedIfEmpty() {
  await db.transaction('rw', ['categories', 'items', 'cafeTables', 'optionLists'], async () => {
    if ((await db.categories.count()) > 0) return
    await db.optionLists.add(HOOKAH_LIST)

    for (const [ci, cat] of MENU.entries()) {
      const categoryId = (await db.categories.add({ name: cat.name, sort: ci, active: true }))!
      const items: Item[] = cat.items.map(([name, price, opts], ii) => ({
        categoryId,
        name,
        price: toFils(price),
        active: true,
        isSeasonal: !!cat.seasonal,
        sort: ii,
        options: opts?.options ?? [],
        ...(opts?.description ? { description: opts.description } : {}),
      }))
      await db.items.bulkAdd(items)
    }
    await db.cafeTables.bulkAdd(TABLES)
  })
}

const ADDED_KEY = 'menu-added-teapot'

/**
 * أصناف انضافت للمنيو بعد ما التابلت اشتغل (مرة وحدة بس): «بريق شاي» بقسم «سخن» بعد «شاي».
 * إذا المالك حذفه بعدين ما بيرجع. لازم تشتغل بعد تعبئة المنيو الأولى.
 */
export async function ensureMenuAdditions() {
  await db.transaction('rw', ['categories', 'items', 'settings'], async () => {
    if (await db.settings.get(ADDED_KEY)) return
    const hot = (await db.categories.toArray()).find((c) => c.name === 'سخن')
    if (hot) {
      const items = await db.items.where('categoryId').equals(hot.id!).sortBy('sort')
      if (!items.some((i) => i.name === 'بريق شاي')) {
        const tea = items.find((i) => i.name === 'شاي')
        const sort = tea ? tea.sort + 1 : (items.at(-1)?.sort ?? -1) + 1
        for (const i of items) if (i.sort >= sort) await db.items.update(i.id!, { sort: i.sort + 1 })
        await db.items.add({ categoryId: hot.id!, name: 'بريق شاي', price: toFils(2), active: true, isSeasonal: false, sort, options: [] })
      }
    }
    await db.settings.put({ key: ADDED_KEY, value: true })
  })
}

// أصناف المخزون المبدئية (من البريف). المالك بيعدّلها من شاشة المخزون.
const STOCK_ITEMS: [string, string][] = [
  ['حليب', 'لتر'],
  ['بن', 'كيلو'],
  ['معسّل', 'علبة'],
  ['فحم', 'كيلو'],
  ['سكر', 'كيلو'],
  ['شاي', 'كيلو'],
]

/** بتشتغل كل مرة بيفتح التطبيق، بس بتعبّي إذا قائمة المخزون فاضية. */
export async function seedStockIfEmpty() {
  await db.transaction('rw', 'stockItems', async () => {
    if ((await db.stockItems.count()) > 0) return
    await db.stockItems.bulkAdd(STOCK_ITEMS.map(([name, unit], sort) => ({ name, unit, active: true, sort })))
  })
}
