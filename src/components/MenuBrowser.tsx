import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Item } from '../db/types'
import { formatJod } from '../lib/money'
import { setItemActive } from '../lib/orders'
import { isAvailable, scheduleParts } from '../lib/offers'

/** الوقت هلق، بيتحدّث كل دقيقة (عشان العروض تتفعّل وتتوقف لحالها) */
function useMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * أقسام المنيو وأصنافها. إذا في onPick الأصناف بتصير أزرار.
 * canToggle: زر «إيقاف أصناف» — بهالوضع الكبسة بتوقف الصنف أو بترجّعه بدل ما تضيفه.
 */
export default function MenuBrowser({
  onPick,
  counts,
  canToggle = false,
}: {
  onPick?: (item: Item) => void
  /** كمية كل صنف بالطلب الحالي (itemId → qty) */
  counts?: Map<number, number>
  canToggle?: boolean
}) {
  const [toggling, setToggling] = useState(false)
  const now = useMinute()
  const categories = useLiveQuery(() => db.categories.orderBy('sort').filter((c) => c.active).toArray(), [])
  const [selected, setSelected] = useState<number | null>(null)
  const categoryId = selected ?? categories?.[0]?.id
  const items = useLiveQuery(
    () => (categoryId ? db.items.where('categoryId').equals(categoryId).sortBy('sort') : []),
    [categoryId],
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-cream-200 px-4 py-3">
        {categories?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelected(c.id!)}
            className={`h-12 shrink-0 rounded-xl px-5 font-medium whitespace-nowrap ${
              c.id === categoryId ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
            }`}
          >
            {c.name}
          </button>
        ))}
        {canToggle && (
          <button
            type="button"
            onClick={() => setToggling((t) => !t)}
            className={`ms-auto h-12 shrink-0 rounded-xl px-4 font-medium whitespace-nowrap ${
              toggling ? 'bg-red-800 text-cream' : 'border border-green/30 text-green active:bg-green-100'
            }`}
          >
            {toggling ? 'خلصت ✓' : 'إيقاف أصناف'}
          </button>
        )}
      </nav>
      {toggling && (
        <div className="shrink-0 bg-red-800/10 px-4 py-2 text-center text-sm font-medium text-red-900">
          اكبس على الصنف عشان توقفه أو ترجّعه. الصنف الموقف ما بينضاف على الطلبات.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {items?.map((item) => {
            const qty = counts?.get(item.id!) ?? 0
            const available = isAvailable(item, now)
            const when = scheduleParts(item.schedule)
            const disabled = toggling ? false : !item.active || !available || !onPick
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => (toggling ? setItemActive(item.id!, !item.active) : onPick?.(item))}
                className={`relative flex min-h-24 flex-col justify-between rounded-2xl bg-white/70 p-4 text-start shadow-sm ring-1 ring-cream-200 ${
                  item.active ? '' : toggling ? 'bg-red-800/10 ring-red-800/40' : 'opacity-40'
                } ${item.active && !available && !toggling ? 'opacity-50' : ''} ${!disabled ? 'active:scale-[0.97] active:bg-gold/40' : ''} ${
                  qty ? 'ring-2 ring-gold' : ''
                } transition-transform`}
              >
                {qty > 0 && (
                  <span className="num absolute -top-2 -left-2 grid size-8 place-items-center rounded-full bg-gold font-bold text-green shadow">
                    {qty}
                  </span>
                )}
                {!item.active && (
                  <span className="absolute top-2 left-2 rounded-md bg-red-800 px-2 py-0.5 text-xs font-bold text-cream">
                    متوقف
                  </span>
                )}
                {item.active && !available && (
                  <span className="absolute top-2 left-2 rounded-md bg-ink/70 px-2 py-0.5 text-xs font-bold text-cream">مش وقته</span>
                )}
                <div>
                  <div className="font-bold text-green">{item.name}</div>
                  {item.description && <div className="mt-0.5 text-xs text-ink/60">{item.description}</div>}
                  {(when.time || when.days) && (
                    <div className="mt-0.5 text-xs font-medium text-green/80">
                      🕘 {when.time && <span className="num">{when.time}</span>}
                      {when.time && when.days && ' · '}
                      {when.days}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <span className="text-xs text-ink/50">{item.options.map((g) => g.name).join(' · ')}</span>
                  <span className="num font-display text-lg text-green">{formatJod(item.price)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
