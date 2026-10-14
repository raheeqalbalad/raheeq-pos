import { useState } from 'react'
import type { OrderLine } from '../db/types'
import { optionsLabel, setLineNote, setLineQty, type LineChangeResult } from '../lib/orders'
import Sheet from './Sheet'

const QUICK_NOTES = ['بدون سكر', 'سكر خفيف', 'سكر زيادة', 'بدون ثلج']

export default function LineSheet({
  line,
  onResult,
  onClose,
}: {
  line: OrderLine
  onResult: (r: LineChangeResult) => void
  onClose: () => void
}) {
  const [note, setNote] = useState(line.note ?? '')

  async function save() {
    await setLineNote(line, note)
    onClose()
  }

  async function remove() {
    onResult(await setLineQty(line, 0))
    onClose()
  }

  return (
    <Sheet title={line.nameSnapshot} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {line.options.length > 0 && <p className="text-ink/60">{optionsLabel(line.options)}</p>}
        <label className="flex flex-col gap-2">
          <span className="font-bold text-green">ملاحظة</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثلًا: بدون سكر"
            className="h-14 rounded-xl bg-white px-4 ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {QUICK_NOTES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNote(n)}
              className="h-12 rounded-xl bg-cream-200 px-4 text-green active:bg-green-100"
            >
              {n}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={remove} className="h-14 rounded-xl bg-red-700/10 font-bold text-red-800 active:bg-red-700/20">
            شيل الصنف
          </button>
          <button type="button" onClick={save} className="h-14 rounded-xl bg-gold font-bold text-green active:bg-gold-600">
            حفظ
          </button>
        </div>
      </div>
    </Sheet>
  )
}
