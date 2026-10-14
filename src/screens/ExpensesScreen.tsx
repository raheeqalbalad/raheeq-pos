import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { ExpenseSource, Shift } from '../db/types'
import { addExpense, expenseSource } from '../lib/shift'
import { deleteExpenseAudited } from '../lib/audit'
import { formatJod, toFils } from '../lib/money'
import { useSession } from '../lib/session'
import { useOwnerGate } from '../lib/useOwnerGate'
import { timeLabel } from '../components/PaymentsList'
import MoneyInput from '../components/MoneyInput'

const QUICK_REASONS = ['ثلج', 'حليب', 'فحم', 'أغراض', 'مي', 'تنظيف']

export default function ExpensesScreen({ shift }: { shift: Shift }) {
  const { user } = useSession()
  const { requireOwner, sheet } = useOwnerGate()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  // «من برا الدرج» للمالك بس
  const owner = user?.role === 'owner'
  const [source, setSource] = useState<ExpenseSource>('drawer')

  const data = useLiveQuery(async () => {
    const [expenses, users] = await Promise.all([
      db.expenses.where('shiftId').equals(shift.id!).reverse().sortBy('createdAt'),
      db.users.toArray(),
    ])
    return { expenses, names: new Map(users.map((u) => [u.id!, u.name])) }
  }, [shift.id])

  const fils = toFils(amount || 0)
  const valid = fils > 0 && reason.trim().length > 0
  const drawerTotal = (data?.expenses ?? []).filter((e) => expenseSource(e) === 'drawer').reduce((s, e) => s + e.amount, 0)
  const outsideTotal = (data?.expenses ?? []).filter((e) => expenseSource(e) === 'outside').reduce((s, e) => s + e.amount, 0)

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    try {
      await addExpense(fils, reason, user!.id!, owner ? source : 'drawer')
      setAmount('')
      setReason('')
      setSource('drawer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <section className="rounded-3xl bg-white/70 p-4 ring-1 ring-cream-200">
          <h2 className="mb-3 font-display text-xl text-green">{source === 'outside' ? 'مصروف من برا الدرج' : 'مصروف من الدرج'}</h2>
          {owner && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  ['drawer', 'من الدرج'],
                  ['outside', 'من برا الدرج'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSource(v)}
                  className={`h-12 rounded-xl font-medium ${
                    source === v ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {source === 'outside' && (
            <p className="mb-3 text-sm text-ink/60">بيدخل بالتقارير والإكسل، بس ما بينخصم من الكاش المتوقع بالدرج.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <MoneyInput value={amount} onChange={setAmount} placeholder="المبلغ" />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="على شو؟"
              className="h-14 min-w-0 rounded-xl bg-white px-4 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`h-12 rounded-xl px-4 ${
                  reason === r ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={save}
            className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
          >
            سجّل المصروف
          </button>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-green">مصاريف الشيفت</h2>
            <span className="text-sm text-ink/60">
              من الدرج <span className="num font-display text-2xl text-green">{formatJod(drawerTotal)}</span>
              {outsideTotal > 0 && (
                <>
                  {' · '}من برا <span className="num font-display text-xl text-green">{formatJod(outsideTotal)}</span>
                </>
              )}
            </span>
          </div>
          {data?.expenses.length === 0 && <p className="p-6 text-center text-ink/50">ما في مصاريف لسا</p>}
          <ul className="flex flex-col gap-2">
            {data?.expenses.map((e) => (
              <li key={e.id} className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/70 px-4 py-2 ring-1 ring-cream-200">
                <span className="num w-12 text-sm text-ink/50">{timeLabel(e.createdAt)}</span>
                <span className="flex-1">
                  <span className="font-bold text-green">{e.reason}</span>
                  <span className="text-sm text-ink/50"> · {data.names.get(e.staffId)}</span>
                  {expenseSource(e) === 'outside' && (
                    <span className="ms-2 rounded-md bg-gold/60 px-2 py-0.5 text-xs font-bold text-green">من برا الدرج</span>
                  )}
                </span>
                <span className="num font-display text-lg text-green">{formatJod(e.amount)}</span>
                <button
                  type="button"
                  aria-label="احذف"
                  onClick={() =>
                    requireOwner('حذف مصروف', (ownerId) => deleteExpenseAudited(e, ownerId), <>{e.reason} · <span className="num">{formatJod(e.amount)}</span></>)
                  }
                  className="size-12 rounded-xl text-red-800 active:bg-red-700/10"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {sheet}
    </main>
  )
}
