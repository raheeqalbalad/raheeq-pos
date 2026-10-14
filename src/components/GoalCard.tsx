import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getGoal, goalProgress, saveMonthSaving } from '../lib/goal'
import { formatJod, toFils } from '../lib/money'
import { monthKey, monthLabel } from '../lib/reports'
import MoneyInput from './MoneyInput'
import Sheet from './Sheet'

/** عدّاد هدف التوفير (للمالك والشريك). المالك بس بيسجّل التوفير. */
export default function GoalCard({ canEdit }: { canEdit: boolean }) {
  const goal = useLiveQuery(getGoal, [])
  const [editing, setEditing] = useState<string | null>(null)
  if (!goal) return null
  const p = goalProgress(goal)
  const current = monthKey(Date.now())
  const pace = p.saved - p.plannedByNow

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl text-green">هدف التوفير</h2>
        <span className="text-sm text-ink/60">
          {monthLabel(goal.start)} – {monthLabel(p.end)} (<span className="num">{goal.months}</span> شهور)
        </span>
      </div>

      <p className="mb-2">
        وفّرنا <span className="num font-display text-3xl text-green">{formatJod(p.saved)}</span> من{' '}
        <span className="num font-bold">{formatJod(goal.target)}</span>{' '}
        <span className="num text-ink/60">({Math.floor(p.ratio * 100)}%)</span>
      </p>
      <div
        className="h-5 overflow-hidden rounded-full bg-cream-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(p.ratio * 100)}
        aria-label="التقدّم نحو الهدف"
      >
        <div className="h-full rounded-full bg-green transition-[width]" style={{ width: `${p.ratio * 100}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-cream-200/60 p-3 text-center">
          <div className="text-xs text-ink/60">وفّرنا</div>
          <div className="num font-display text-xl text-green">{formatJod(p.saved)}</div>
        </div>
        <div className="rounded-xl bg-cream-200/60 p-3 text-center">
          <div className="text-xs text-ink/60">ضايل</div>
          <div className="num font-display text-xl text-green">{formatJod(p.remaining)}</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${p.done ? 'bg-green text-cream' : p.overdue ? 'bg-red-800/15 text-red-900' : 'bg-gold/50'}`}>
          {p.done ? (
            <div className="font-display text-xl">وصلنا الهدف 🎉</div>
          ) : p.overdue ? (
            <>
              <div className="text-xs">المدة خلصت</div>
              <div className="font-bold">ضايل {formatJod(p.remaining)}</div>
            </>
          ) : (
            <>
              <div className="text-xs text-ink/70">
                لازم نوفّر بالشهر (لـ <span className="num">{p.monthsLeft}</span> شهور)
              </div>
              <div className="num font-display text-xl text-green">{formatJod(p.perMonth)}</div>
            </>
          )}
        </div>
      </div>

      {p.plannedByNow > 0 && !p.done && (
        <p className={`mt-3 text-sm font-bold ${pace >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
          {pace >= 0 ? 'قدّام الخطة' : 'ورا الخطة'} بـ <span className="num">{formatJod(Math.abs(pace))}</span>
          <span className="font-normal text-ink/60">
            {' '}
            (المفروض لآخر الشهر الماضي <span className="num">{formatJod(p.plannedByNow)}</span>)
          </span>
        </p>
      )}

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {p.months.map((m) => {
          const amount = goal.savings[m]
          const editable = canEdit && m <= current
          return (
            <li key={m}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => setEditing(m)}
                className={`flex min-h-14 w-full flex-col items-center justify-center rounded-xl px-2 py-1 text-sm ring-1 ${
                  m === current ? 'ring-2 ring-gold' : 'ring-cream-200'
                } ${amount !== undefined ? 'bg-green-100' : 'bg-white/60'} ${editable ? 'active:bg-gold/40' : ''} disabled:cursor-default`}
              >
                <span className="text-ink/70">{monthLabel(m)}</span>
                {amount !== undefined ? (
                  <span className="num font-bold text-green">{formatJod(amount)}</span>
                ) : (
                  <span className="font-bold text-green">{editable ? '+ سجّل' : '—'}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {canEdit && <p className="mt-2 text-xs text-ink/50">اكبس على الشهر عشان تسجّل كم وفّرنا فعليًا. الهدف والمدة والبداية من «الإعدادات».</p>}

      {editing && <SavingSheet month={editing} initial={goal.savings[editing]} onClose={() => setEditing(null)} />}
    </section>
  )
}

function SavingSheet({ month, initial, onClose }: { month: string; initial?: number; onClose: () => void }) {
  const [amount, setAmount] = useState(initial !== undefined ? formatJod(initial) : '')
  return (
    <Sheet title={`كم وفّرنا بـ${monthLabel(month)}؟`} onClose={onClose}>
      <MoneyInput value={amount} onChange={setAmount} autoFocus />
      <div className="mt-4 flex gap-3">
        {initial !== undefined && (
          <button
            type="button"
            onClick={async () => {
              await saveMonthSaving(month, undefined)
              onClose()
            }}
            className="h-14 shrink-0 rounded-2xl px-4 font-medium text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
          >
            امسح
          </button>
        )}
        <button
          type="button"
          disabled={amount === ''}
          onClick={async () => {
            await saveMonthSaving(month, toFils(amount))
            onClose()
          }}
          className="h-14 flex-1 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
        >
          حفظ
        </button>
      </div>
    </Sheet>
  )
}
