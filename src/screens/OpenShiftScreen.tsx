import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { lastClosedShift, leftInDrawerOf, openShift } from '../lib/shift'
import { formatJod, toFils } from '../lib/money'
import { useSession } from '../lib/session'
import Header from '../components/Header'
import MoneyInput from '../components/MoneyInput'
import { ChecklistInput } from '../components/Checklist'
import { allChecked, getChecklists } from '../lib/checklists'
import type { CheckMark, ChecklistTask } from '../db/types'

/** ما في شيفت مفتوح: لازم ينفتح قبل البيع، مع كاش البداية بالدرج. */
export default function OpenShiftScreen({ onReports }: { onReports?: () => void }) {
  const { user } = useSession()
  const [cash, setCash] = useState('')
  const [lastLeft, setLastLeft] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const tasks = useLiveQuery(async () => (await getChecklists()).open, [])
  const [marks, setMarks] = useState<CheckMark[]>([])
  const ready = !!tasks && allChecked(tasks, marks)

  function toggle(task: ChecklistTask) {
    setMarks((ms) =>
      ms.some((m) => m.taskId === task.id)
        ? ms.filter((m) => m.taskId !== task.id)
        : [...ms, { taskId: task.id, text: task.text, by: user!.id!, at: Date.now() }],
    )
  }

  useEffect(() => {
    lastClosedShift().then((s) => {
      const left = s && leftInDrawerOf(s)
      if (left !== undefined) {
        setLastLeft(left)
        setCash(formatJod(left))
      }
    })
  }, [])

  async function open() {
    setBusy(true)
    setError('')
    try {
      await openShift(user!.id!, toFils(cash || 0), marks.filter((m) => tasks?.some((t) => t.id === m.taskId)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
      setBusy(false)
    }
    // الشاشة بتتبدّل لحالها لما الشيفت ينفتح (useLiveQuery بالـ App)
  }

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="flex flex-1 items-start justify-center overflow-y-auto p-4 sm:items-center">
        <div
          className={`grid w-full gap-6 rounded-3xl bg-white/70 p-6 shadow-sm ring-1 ring-cream-200 ${
            tasks?.length ? 'max-w-3xl md:grid-cols-2' : 'max-w-sm'
          }`}
        >
          {!!tasks?.length && (
            <section>
              <h2 className="mb-1 font-display text-xl text-green">مهام الفتح</h2>
              <p className="mb-3 text-sm text-ink/60">علّم على كل مهمة بعد ما تخلّصها.</p>
              <ChecklistInput tasks={tasks} marks={marks} onToggle={toggle} />
            </section>
          )}
          <div>
            <h1 className="mb-1 font-display text-2xl text-green">فتح الشيفت</h1>
            <p className="mb-5 text-ink/60">قديش في كاش بالدرج هلق؟</p>
            <MoneyInput value={cash} onChange={setCash} autoFocus />
            {lastLeft !== undefined && (
              <p className="mt-2 text-sm text-ink/50">
                الشيفت اللي قبل ترك بالدرج <span className="num">{formatJod(lastLeft)}</span>
              </p>
            )}
            {error && <p className="mt-3 font-bold text-red-700">{error}</p>}
            {!ready && tasks && <p className="mt-3 text-sm font-bold text-red-800">علّم على كل مهام الفتح عشان تفتح الشيفت</p>}
            <button
              type="button"
              disabled={busy || !ready}
              onClick={open}
              className="mt-5 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-50"
            >
              افتح الشيفت
            </button>
            {onReports && (
              <button
                type="button"
                onClick={onReports}
                className="mt-3 h-12 w-full rounded-2xl text-green ring-1 ring-green/20 active:bg-cream-200"
              >
                شوف التقارير بدون ما تفتح شيفت
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
