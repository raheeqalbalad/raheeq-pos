import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Item, ItemSchedule, OptionChoice, OptionGroup, OptionList } from '../db/types'
import { scheduleParts, WEEK_DAYS } from '../lib/offers'
import { addCategory, deleteItem, moveCategory, moveItem, newId, saveItem, saveOptionList, updateCategory } from '../lib/menu'
import { setItemActive } from '../lib/orders'
import { formatJod, toFils } from '../lib/money'
import Sheet from '../components/Sheet'
import MoneyInput from '../components/MoneyInput'

const inputClass = 'h-12 min-w-0 rounded-xl bg-white px-3 ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

/** تعديل المنيو للمالك: الأقسام والأصناف والأسعار والخيارات. */
export default function MenuEditorScreen() {
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), [])
  const [selected, setSelected] = useState<number>()
  const categoryId = selected ?? categories?.[0]?.id
  const category = categories?.find((c) => c.id === categoryId)
  const items = useLiveQuery(
    () => (categoryId ? db.items.where('categoryId').equals(categoryId).sortBy('sort') : []),
    [categoryId],
  )
  const [editing, setEditing] = useState<Item | null>(null)
  const [newCategory, setNewCategory] = useState<string | null>(null)

  const blankItem = (): Item => ({
    categoryId: categoryId!,
    name: '',
    price: 0,
    active: true,
    isSeasonal: false,
    sort: 0,
    options: [],
  })

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {/* الأقسام */}
      <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-cream-200 px-4 py-3">
        {categories?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelected(c.id)}
            className={`h-12 shrink-0 rounded-xl px-5 font-medium whitespace-nowrap ${
              c.id === categoryId ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
            } ${c.active ? '' : 'line-through opacity-50'}`}
          >
            {c.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNewCategory('')}
          className="h-12 shrink-0 rounded-xl px-4 font-medium text-green ring-1 ring-green/30 active:bg-cream-200"
        >
          + قسم
        </button>
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {category && (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {/* إعدادات القسم */}
            <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/70 p-3 ring-1 ring-cream-200">
              <input
                key={category.id}
                defaultValue={category.name}
                aria-label="اسم القسم"
                onBlur={(e) => e.target.value.trim() && updateCategory(category.id!, { name: e.target.value.trim() })}
                className={`${inputClass} flex-1 font-display text-lg text-green`}
              />
              <button
                type="button"
                onClick={() => moveCategory(category.id!, -1)}
                className="h-12 rounded-xl bg-cream-200 px-3 text-green active:bg-green-100"
              >
                → قبل
              </button>
              <button
                type="button"
                onClick={() => moveCategory(category.id!, 1)}
                className="h-12 rounded-xl bg-cream-200 px-3 text-green active:bg-green-100"
              >
                بعد ←
              </button>
              <button
                type="button"
                onClick={() => updateCategory(category.id!, { active: !category.active })}
                className="h-12 rounded-xl px-3 text-sm font-medium text-green ring-1 ring-green/20 active:bg-cream-200"
              >
                {category.active ? 'إخفاء القسم' : 'إظهار القسم'}
              </button>
            </section>
            {!category.active && (
              <p className="rounded-xl bg-gold/40 px-4 py-2 text-sm">القسم مخفي: ما بيطلع للموظف وقت البيع.</p>
            )}

            {/* الأصناف */}
            <ul className="flex flex-col gap-2">
              {items?.map((item, idx) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-2 rounded-2xl bg-white/70 p-2 ring-1 ring-cream-200 ${item.active ? '' : 'opacity-60'}`}
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="لفوق"
                      disabled={idx === 0}
                      onClick={() => moveItem(item, -1)}
                      className="h-8 w-10 rounded-lg text-green active:bg-cream-200 disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="لتحت"
                      disabled={idx === (items?.length ?? 0) - 1}
                      onClick={() => moveItem(item, 1)}
                      className="h-8 w-10 rounded-lg text-green active:bg-cream-200 disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <button type="button" onClick={() => setEditing(item)} className="min-h-12 min-w-0 flex-1 py-1 text-start">
                    <div className="font-bold text-green">{item.name}</div>
                    <div className="truncate text-xs text-ink/50">
                      {[item.description, item.options.map((g) => (g.listId ? g.name : `${g.name} (${g.choices.length})`)).join(' · ')]
                        .filter(Boolean)
                        .join(' — ')}
                    </div>
                    {item.schedule && (
                      <div className="text-xs font-medium text-green/80">
                        🕘 <span className="num">{scheduleParts(item.schedule).time}</span> {scheduleParts(item.schedule).days}
                      </div>
                    )}
                  </button>
                  <span className="flex flex-col items-end">
                    <span className="num font-display text-lg text-green">{formatJod(item.price)}</span>
                    <span className="text-xs text-ink/50">
                      {item.cost === undefined ? (
                        'بدون تكلفة'
                      ) : (
                        <>
                          ربح <span className="num">{marginPct(item.price, item.cost)}%</span>
                        </>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setItemActive(item.id!, !item.active)}
                    className={`h-12 w-20 shrink-0 rounded-xl text-sm font-bold ${
                      item.active ? 'bg-green-100 text-green' : 'bg-red-800 text-cream'
                    }`}
                  >
                    {item.active ? 'متوفر' : 'متوقف'}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setEditing(blankItem())}
              className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600"
            >
              + صنف جديد بـ«{category.name}»
            </button>
          </div>
        )}
      </div>

      {editing && <ItemEditor initial={editing} onClose={() => setEditing(null)} />}
      {newCategory !== null && (
        <Sheet title="قسم جديد" onClose={() => setNewCategory(null)}>
          <input
            autoFocus
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="مثلًا: مشروبات الشتا"
            className={`${inputClass} h-14 w-full`}
          />
          <button
            type="button"
            disabled={!newCategory.trim()}
            onClick={async () => {
              const id = await addCategory(newCategory)
              setSelected(id)
              setNewCategory(null)
            }}
            className="mt-3 h-14 w-full rounded-2xl bg-gold font-bold text-green active:bg-gold-600 disabled:opacity-40"
          >
            ضيف القسم
          </button>
        </Sheet>
      )}
    </main>
  )
}

const marginPct = (price: number, cost: number) => (price ? Math.round(((price - cost) / price) * 100) : 0)

function ProfitHint({ price, cost }: { price: number; cost?: number }) {
  if (cost === undefined)
    return <p className="-mt-2 text-sm text-ink/50">بدون تكلفة: الصنف ما بينحسب بتقرير الربح.</p>
  const profit = price - cost
  return (
    <p className={`-mt-2 text-sm font-bold ${profit < 0 ? 'text-red-800' : 'text-green'}`}>
      الربح بالوحدة <span className="num">{formatJod(profit)}</span> (<span className="num">{marginPct(price, cost)}%</span>)
    </p>
  )
}

/** أوقات وأيام البيع (للعروض). فاضي = طول الوقت وكل يوم. */
function ScheduleEditor({ value, onChange }: { value: ItemSchedule; onChange: (s: ItemSchedule) => void }) {
  const days = value.days ?? []
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    onChange({ ...value, days: next.length ? next : undefined })
  }
  return (
    <section className="rounded-2xl border border-cream-200 p-3">
      <h3 className="mb-1 font-bold text-green">أوقات العرض</h3>
      <p className="mb-3 text-xs text-ink/60">برا هالأوقات والأيام العرض بيطلع «مش وقته» وما بينضاف. فاضي = طول الوقت وكل يوم.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          من
          <input
            type="time"
            value={value.from ?? ''}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
            className={`${inputClass} num`}
          />
        </label>
        <label className="flex items-center gap-2">
          لـ
          <input
            type="time"
            value={value.to ?? ''}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
            className={`${inputClass} num`}
          />
        </label>
        {(value.from || value.to) && (
          <button
            type="button"
            onClick={() => onChange({ ...value, from: undefined, to: undefined })}
            className="h-12 rounded-xl px-3 text-sm text-ink/60 active:bg-cream-200"
          >
            طول الوقت
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {WEEK_DAYS.map((name, d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(d)}
            className={`h-12 rounded-xl px-3 text-sm font-medium ${
              days.includes(d) ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/50">{days.length ? 'بس بالأيام المختارة' : 'كل يوم (اختار أيام إذا العرض مش كل يوم)'}</p>
    </section>
  )
}

/** المبلغ كنص للتعديل: 0 بيصير فاضي */
const jodText = (fils: number) => (fils ? formatJod(fils) : '')

type DraftChoice = OptionChoice & { deltaText: string; costText: string }
type DraftGroup = Omit<OptionGroup, 'choices'> & { choices: DraftChoice[] }

const toDraftChoices = (choices: OptionChoice[]): DraftChoice[] =>
  choices.map((c) => ({ ...c, deltaText: jodText(c.priceDelta), costText: jodText(c.costDelta ?? 0) }))

const toDraft = (groups: OptionGroup[]): DraftGroup[] => groups.map((g) => ({ ...g, choices: toDraftChoices(g.choices) }))

const fromDraftChoices = (choices: DraftChoice[]): OptionChoice[] =>
  choices.map(({ deltaText, costText, ...c }) => ({
    ...c,
    name: c.name.trim(),
    priceDelta: toFils(deltaText || 0),
    costDelta: toFils(costText || 0) || undefined,
    group: c.group?.trim() || undefined,
  }))

/** مشكلة بالخيارات، أو فاضي إذا تمام */
function choicesProblem(label: string, choices: DraftChoice[]): string {
  if (!choices.length) return `«${label}» ما فيها خيارات`
  if (choices.some((c) => !c.name.trim())) return `في خيار بدون اسم بـ«${label}»`
  const names = choices.map((c) => c.name.trim())
  if (new Set(names).size !== names.length) return `في خيار مكرر بـ«${label}»`
  return ''
}

const HOT_COLD: OptionGroup = {
  id: 'temp',
  name: 'سخن ولا بارد',
  required: true,
  choices: [
    { id: 'سخن', name: 'سخن', priceDelta: 0 },
    { id: 'بارد', name: 'بارد', priceDelta: 0 },
  ],
}

/** صفوف الخيارات: الاسم، عنوان اختياري، وفرق السعر. */
function ChoicesEditor({ choices, onChange }: { choices: DraftChoice[]; onChange: (c: DraftChoice[]) => void }) {
  const update = (ci: number, change: Partial<DraftChoice>) =>
    onChange(choices.map((c, i) => (i === ci ? { ...c, ...change } : c)))
  return (
    <>
      <div className="flex flex-col gap-2">
        {choices.map((c, ci) => (
          <div key={c.id} className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] gap-2 sm:grid-cols-[1fr_8rem_5.5rem_5.5rem_3rem]">
            <input value={c.name} onChange={(e) => update(ci, { name: e.target.value })} placeholder="الخيار" className={inputClass} />
            <input
              value={c.group ?? ''}
              onChange={(e) => update(ci, { group: e.target.value })}
              placeholder="عنوان (اختياري)"
              className={`${inputClass} hidden text-sm sm:block`}
            />
            <input
              inputMode="decimal"
              value={c.deltaText}
              onChange={(e) => update(ci, { deltaText: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="+ سعر"
              className={`${inputClass} num`}
            />
            <input
              inputMode="decimal"
              value={c.costText}
              onChange={(e) => update(ci, { costText: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="+ تكلفة"
              aria-label="فرق التكلفة"
              className={`${inputClass} num`}
            />
            <button
              type="button"
              aria-label="شيل الخيار"
              onClick={() => onChange(choices.filter((_, i) => i !== ci))}
              className="h-12 rounded-xl text-red-800 active:bg-red-700/10"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...choices, { id: newId(), name: '', priceDelta: 0, deltaText: '', costText: '', group: choices.at(-1)?.group }])}
        className="mt-2 h-12 rounded-xl px-4 text-green ring-1 ring-green/20 active:bg-cream-200"
      >
        + خيار
      </button>
    </>
  )
}

/** تعديل قائمة مشتركة: بيبيّن بكل الأصناف المربوطة فيها. */
function ListEditor({ list, onClose }: { list: OptionList; onClose: () => void }) {
  const users = useLiveQuery(
    () => db.items.filter((i) => i.options.some((g) => g.listId === list.id)).toArray(),
    [list.id],
  )
  const [name, setName] = useState(list.name)
  const [choices, setChoices] = useState(toDraftChoices(list.choices))
  const [error, setError] = useState('')

  async function save() {
    const problem = !name.trim() ? 'اكتب اسم القائمة' : choicesProblem(name, choices)
    if (problem) return setError(problem)
    await saveOptionList({ ...list, name: name.trim(), choices: fromDraftChoices(choices) })
    onClose()
  }

  return (
    <Sheet title={`قائمة «${list.name}»`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-ink/60">
        مربوطة بـ: {users?.map((u) => u.name).join('، ') || '—'}. أي تعديل هون بيبيّن فيهم كلهم.
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mb-3 w-full font-bold`} />
      <ChoicesEditor choices={choices} onChange={setChoices} />
      {error && <p className="mt-3 text-center font-bold text-red-700">{error}</p>}
      <button type="button" onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
        حفظ القائمة
      </button>
    </Sheet>
  )
}

function ItemEditor({ initial, onClose }: { initial: Item; onClose: () => void }) {
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), [])
  const lists = useLiveQuery(() => db.optionLists.toArray(), [])
  const others = useLiveQuery(
    () => db.items.filter((i) => i.options.length > 0 && i.id !== initial.id).toArray(),
    [initial.id],
  )
  const [name, setName] = useState(initial.name)
  const [price, setPrice] = useState(jodText(initial.price))
  const [cost, setCost] = useState(initial.cost !== undefined ? formatJod(initial.cost) : '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [categoryId, setCategoryId] = useState(initial.categoryId)
  const [isSeasonal, setIsSeasonal] = useState(initial.isSeasonal)
  const [groups, setGroups] = useState<DraftGroup[]>(toDraft(initial.options))
  const [schedule, setSchedule] = useState<ItemSchedule>(initial.schedule ?? {})
  const isOfferCategory = categories?.find((c) => c.id === categoryId)?.kind === 'offers'
  const [editingList, setEditingList] = useState<OptionList | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const updateGroup = (gi: number, change: Partial<DraftGroup>) =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...change } : g)))

  function validate(): string {
    if (!name.trim()) return 'اكتب اسم الصنف'
    if (price.trim() === '' || !(Number(price) >= 0)) return 'اكتب السعر'
    if (cost.trim() !== '' && !(Number(cost) >= 0)) return 'التكلفة مش مزبوطة'
    if (!!schedule.from !== !!schedule.to) return 'اكتب وقت البداية والنهاية مع بعض'
    for (const g of groups) {
      if (!g.name.trim()) return 'في مجموعة خيارات بدون اسم'
      if (g.pick !== undefined && !(g.pick >= 1 && g.pick <= 10)) return `«كم واحد» بـ«${g.name}» لازم بين 1 و10`
      if (!g.listId) {
        const problem = choicesProblem(g.name, g.choices)
        if (problem) return problem
      }
    }
    return ''
  }

  async function save() {
    const problem = validate()
    if (problem) return setError(problem)
    await saveItem({
      ...initial,
      name: name.trim(),
      price: toFils(price),
      cost: cost.trim() === '' ? undefined : toFils(cost),
      categoryId,
      isSeasonal,
      description: description.trim() || undefined,
      schedule: schedule.from || schedule.days?.length ? schedule : undefined,
      options: groups.map(({ choices, ...g }) => ({
        ...g,
        pick: g.pick && g.pick > 1 ? g.pick : undefined,
        name: g.name.trim(),
        choices: g.listId ? [] : fromDraftChoices(choices),
      })),
    })
    onClose()
  }

  return (
    <Sheet title={initial.id ? `تعديل «${initial.name}»` : 'صنف جديد'} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-green">الاسم</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} h-14 text-lg`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-green">السعر (دينار)</span>
            <MoneyInput value={price} onChange={setPrice} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-green">التكلفة (اختياري)</span>
            <MoneyInput value={cost} onChange={setCost} placeholder="بدون" />
          </label>
        </div>
        <ProfitHint price={toFils(price || 0)} cost={cost.trim() === '' ? undefined : toFils(cost)} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-green">الوصف (اختياري)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثلًا: لاتيه كركم وقرفة وعسل"
            className={inputClass}
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-bold text-green">القسم</span>
            <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} className={inputClass}>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-12 items-center gap-2 rounded-xl bg-white px-4 ring-1 ring-cream-200">
            <input type="checkbox" checked={isSeasonal} onChange={(e) => setIsSeasonal(e.target.checked)} className="size-5 accent-green" />
            <span>صنف موسمي</span>
          </label>
        </div>

        {(isOfferCategory || initial.schedule) && <ScheduleEditor value={schedule} onChange={setSchedule} />}

        {/* الخيارات */}
        <section className="rounded-2xl border border-cream-200 p-3">
          <h3 className="mb-1 font-bold text-green">الخيارات</h3>
          <p className="mb-3 text-xs text-ink/60">
            لما الصنف إله خيارات، الموظف بيختار وحدة من كل مجموعة قبل ما ينضاف. «+ سعر» بينضاف على سعر الصنف، و«+ تكلفة» على
            تكلفته.
          </p>
          <div className="flex flex-col gap-3">
            {groups.map((g, gi) => {
              const list = g.listId ? lists?.find((l) => l.id === g.listId) : undefined
              return (
                <div key={g.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-cream-200">
                  <div className="mb-2 flex gap-2">
                    <input
                      value={g.name}
                      onChange={(e) => updateGroup(gi, { name: e.target.value })}
                      placeholder="اسم المجموعة (مثلًا: النكهة)"
                      className={`${inputClass} flex-1 font-bold`}
                    />
                    <label className="flex shrink-0 items-center gap-1 text-sm text-ink/70">
                      كم واحد
                      <input
                        value={g.pick ?? 1}
                        onChange={(e) => updateGroup(gi, { pick: Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || undefined })}
                        inputMode="numeric"
                        aria-label="كم واحد بيختار"
                        className={`${inputClass} num w-14 text-center`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))}
                      className="h-12 shrink-0 rounded-xl px-3 text-sm text-red-800 active:bg-red-700/10"
                    >
                      شيل المجموعة
                    </button>
                  </div>
                  {g.listId ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 text-sm">
                        قائمة مشتركة: <b className="text-green">{list?.name ?? '؟'}</b>{' '}
                        <span className="text-ink/50">
                          (<span className="num">{list?.choices.length ?? 0}</span> خيار)
                        </span>
                      </span>
                      <label className="flex h-12 items-center gap-2 rounded-xl bg-white px-3 text-sm ring-1 ring-cream-200">
                        <input
                          type="checkbox"
                          checked={!!g.applyDeltas}
                          onChange={(e) => updateGroup(gi, { applyDeltas: e.target.checked })}
                          className="size-5 accent-green"
                        />
                        طبّق فروق الأسعار
                      </label>
                      {list && (
                        <button
                          type="button"
                          onClick={() => setEditingList(list)}
                          className="h-12 rounded-xl bg-green px-4 font-bold text-cream active:bg-green-700"
                        >
                          عدّل القائمة
                        </button>
                      )}
                    </div>
                  ) : (
                    <ChoicesEditor choices={g.choices} onChange={(choices) => updateGroup(gi, { choices })} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGroups((gs) => [...gs, { id: newId(), name: '', required: true, choices: [] }])}
              className="h-12 rounded-xl bg-cream-200 px-4 text-green active:bg-green-100"
            >
              + مجموعة خيارات
            </button>
            {!groups.some((g) => g.name === HOT_COLD.name) && (
              <button
                type="button"
                onClick={() => setGroups((gs) => [...gs, ...toDraft([{ ...HOT_COLD, id: newId() }])])}
                className="h-12 rounded-xl bg-cream-200 px-4 text-green active:bg-green-100"
              >
                + سخن/بارد
              </button>
            )}
            {lists
              ?.filter((l) => !groups.some((g) => g.listId === l.id))
              .map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() =>
                    setGroups((gs) => [...gs, { id: newId(), name: 'النكهة', required: true, choices: [], listId: l.id, applyDeltas: true }])
                  }
                  className="h-12 rounded-xl bg-cream-200 px-4 text-green active:bg-green-100"
                >
                  + {l.name}
                </button>
              ))}
            {!!others?.length && (
              <select
                value=""
                onChange={(e) => {
                  const from = others.find((o) => o.id === Number(e.target.value))
                  if (from) setGroups((gs) => [...gs, ...toDraft(from.options.map((g) => ({ ...g, id: newId() })))])
                }}
                className={`${inputClass} bg-cream-200 text-green`}
              >
                <option value="">انسخ خيارات من صنف…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {error && <p className="text-center font-bold text-red-700">{error}</p>}
        <div className="flex gap-3">
          {initial.id && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-14 shrink-0 rounded-2xl px-5 font-medium text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
            >
              احذف الصنف
            </button>
          )}
          <button type="button" onClick={save} className="h-14 flex-1 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
            حفظ
          </button>
        </div>
      </div>

      {editingList && <ListEditor list={editingList} onClose={() => setEditingList(null)} />}
      {confirmDelete && (
        <Sheet title={`حذف «${initial.name}»؟`} onClose={() => setConfirmDelete(false)}>
          <p className="mb-2 text-ink/70">الصنف رح ينشال من المنيو نهائيًا. مبيعاته القديمة بتضل بالتقارير.</p>
          <p className="mb-4 text-ink/70">إذا بدك توقفه مؤقتًا، استعمل «متوقف» بدل الحذف.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteItem(initial.id!)
                onClose()
              }}
              className="h-14 rounded-xl bg-red-800 font-bold text-cream"
            >
              احذف
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  )
}
