import { useLiveQuery } from 'dexie-react-hooks'
import type { Shift } from '../db/types'
import { openWhatsApp, summaryText } from '../lib/shareSummary'

/** «شارك ملخص اليوم» بواتساب. الرسالة بتتجهّز مسبقًا وبتتحدّث مع البيانات. */
export default function ShareSummaryButton({ shifts, label = 'شارك ملخص اليوم', className = '' }: { shifts: Shift[]; label?: string; className?: string }) {
  const key = shifts.map((s) => `${s.id}:${s.closedAt ?? ''}`).join(',')
  const text = useLiveQuery(() => (shifts.length ? summaryText(shifts) : ''), [key])
  return (
    <button
      type="button"
      disabled={!text}
      onClick={() => text && openWhatsApp(text)}
      className={`flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#1F8A5E] px-5 text-lg font-bold text-white active:bg-[#18704C] disabled:opacity-40 ${className}`}
    >
      <span aria-hidden>💬</span> {label}
    </button>
  )
}
