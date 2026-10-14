import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { CheckMark, ChecklistTask } from '../db/types'
import { timeLabel } from './PaymentsList'

function useNames() {
  return useLiveQuery(async () => new Map((await db.users.toArray()).map((u) => [u.id!, u.name])), [])
}

/** قائمة مهام بكبسة على كل وحدة. المعلّم عليها بيبيّن مين ومتى. */
export function ChecklistInput({
  tasks,
  marks,
  onToggle,
}: {
  tasks: ChecklistTask[]
  marks: CheckMark[]
  onToggle: (task: ChecklistTask) => void
}) {
  const names = useNames()
  const done = tasks.filter((t) => marks.some((m) => m.taskId === t.id)).length
  return (
    <div>
      <p className={`mb-2 text-sm font-bold ${done === tasks.length ? 'text-green' : 'text-ink/60'}`}>
        <span className="num">{done}</span> من <span className="num">{tasks.length}</span>
        {done === tasks.length && ' ✓'}
      </p>
      <ul className="flex flex-col gap-2">
        {tasks.map((t) => {
          const mark = marks.find((m) => m.taskId === t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onToggle(t)}
                aria-pressed={!!mark}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-start ${
                  mark ? 'bg-green text-cream' : 'bg-white text-ink ring-1 ring-cream-200 active:bg-gold/30'
                }`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-lg text-lg font-bold ${mark ? 'bg-gold text-green' : 'ring-2 ring-green/30'}`}
                  aria-hidden
                >
                  {mark ? '✓' : ''}
                </span>
                <span className="flex-1 font-medium">{t.text}</span>
                {mark && (
                  <span className="text-xs opacity-70">
                    {names?.get(mark.by)} · <span className="num">{timeLabel(mark.at)}</span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** عرض بس: مين علّم على شو ومتى (سجل الأيام وبعد التسكير). */
export function ChecklistView({ title, marks }: { title: string; marks: CheckMark[] | undefined }) {
  const names = useNames()
  if (!marks?.length) return null
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-green">{title}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {[...marks]
          .sort((a, b) => a.at - b.at)
          .map((m) => (
            <li key={m.taskId} className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 odd:bg-cream-200/50">
              <span>✓ {m.text}</span>
              <span className="text-xs text-ink/60">
                {names?.get(m.by)} · <span className="num">{timeLabel(m.at)}</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}
