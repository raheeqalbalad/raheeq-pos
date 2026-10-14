import { useState } from 'react'
import type { Guests } from '../db/types'
import Sheet from './Sheet'

const TYPES: { key: keyof Guests; label: string }[] = [
  { key: 'men', label: 'رجال' },
  { key: 'women', label: 'نساء' },
  { key: 'kids', label: 'أطفال' },
]

export const guestsTotal = (g?: Guests) => (g ? g.men + g.women + g.kids : 0)

/** عدّاد سريع للزباين على الطاولة (اختياري: «تخطّي»). */
export default function GuestsSheet({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string
  initial?: Guests
  onSave: (g: Guests | undefined) => void
  onClose: () => void
}) {
  const [g, setG] = useState<Guests>(initial ?? { men: 0, women: 0, kids: 0 })
  const change = (k: keyof Guests, d: number) => setG((x) => ({ ...x, [k]: Math.max(0, Math.min(50, x[k] + d)) }))

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {TYPES.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3 rounded-2xl bg-white/70 p-2 ring-1 ring-cream-200">
            <span className="flex-1 ps-2 text-lg font-bold text-green">{label}</span>
            <div className="flex items-center gap-2" dir="ltr">
              <button
                type="button"
                aria-label={`نقّص ${label}`}
                onClick={() => change(key, -1)}
                className="size-14 rounded-xl bg-cream-200 text-3xl text-green active:bg-green-100"
              >
                −
              </button>
              <span className="num w-10 text-center font-display text-3xl text-green">{g[key]}</span>
              <button
                type="button"
                aria-label={`زيد ${label}`}
                onClick={() => change(key, 1)}
                className="size-14 rounded-xl bg-green text-3xl text-cream active:bg-green-700"
              >
                +
              </button>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <button type="button" onClick={onClose} className="h-14 rounded-2xl bg-cream-200 font-bold text-green">
            تخطّي
          </button>
          <button
            type="button"
            onClick={() => onSave(guestsTotal(g) ? g : undefined)}
            className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600"
          >
            تم <span className="num">({guestsTotal(g)})</span>
          </button>
        </div>
      </div>
    </Sheet>
  )
}
