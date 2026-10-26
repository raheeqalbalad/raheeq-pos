import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Expense, Order, OrderLine, Shift } from '../db/types'
import { allShifts, buildReport, dayLabel, receivedStatus, type DayRow } from '../lib/reports'
import { ownerEdit } from '../lib/ownerEdits'
import { expenseSource } from '../lib/shift'
import { orderDue, optionsLabel } from '../lib/orders'
import { formatJod, toFils } from '../lib/money'
import { timeLabelOf } from '../lib/time'
import { useSession } from '../lib/session'
import Sheet from '../components/Sheet'
import MoneyInput from '../components/MoneyInput'
import PaymentsList, { METHOD_LABEL } from '../components/PaymentsList'
import { ChecklistView } from '../components/Checklist'
import { useRemote } from '../lib/cloud/useDeviceMode'
import { afterMidnightNote, businessDayOf } from '../lib/businessDay'
import DeleteOrderButton from '../components/DeleteOrderButton'

type Mode = 'day' | 'range'

const dateInput = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** سجل الأيام للمالك: كل طلبات ودفعات ومصاريف يوم شغل (أو فترة)، مع التعديل وسجل التعديلات. */
export default function DayLogScreen() {
  const shifts = useLiveQuery(allShifts, [])
  const [mode, setMode] = useState<Mode>('day')
  const [dayId, setDayId] = useState<number>()
  const today = dateInput(Date.now())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)

  if (!shifts) return null
  if (!shifts.length) return <p className="p-10 text-center text-ink/50">لسا ما في أيام شغل.</p>

  const selectedDay = dayId ?? shifts[0].id
  const chosen =
    mode === 'day'
      ? shifts.filter((s) => s.id === selectedDay)
      : shifts.filter((s) => {
          const d = dateInput(s.openedAt)
          return d >= from && d <= to
        })

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['day', 'يوم شغل'],
              ['range', 'فترة'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-12 rounded-xl px-5 font-medium ${
                mode === m ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
              }`}
            >
              {label}
            </button>
          ))}
          {mode === 'day' ? (
            <select
              value={selectedDay}
              onChange={(e) => setDayId(Number(e.target.value))}
              className="h-12 min-w-0 flex-1 rounded-xl bg-white px-3 ring-1 ring-cream-200"
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {dayLabel(s.openedAt)} · {`⁦${timeLabelOf(s.openedAt)}–${s.closedAt ? timeLabelOf(s.closedAt) : 'مفتوح'}⁩`}
                  {afterMidnightNote(s) && ` · ${afterMidnightNote(s)}`}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                من
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 rounded-xl bg-white px-3 ring-1 ring-cream-200" />
              </label>
              <label className="flex items-center gap-2">
                لـ
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 rounded-xl bg-white px-3 ring-1 ring-cream-200" />
              </label>
              <span className="text-sm text-ink/50">
                <span className="num">{chosen.length}</span> يوم شغل
              </span>
            </div>
          )}
        </div>

        {chosen.length ? <DayLog shifts={chosen} /> : <p className="p-8 text-center text-ink/50">ما في أيام شغل بهالفترة</p>}
      </div>
    </main>
  )
}

function DayLog({ shifts }: { shifts: Shift[] }) {
  const key = shifts.map((s) => s.id).join(',')
  const data = useLiveQuery(async () => {
    const ids = shifts.map((s) => s.id!)
    const now = Date.now()
    const inShift = (ts: number) => shifts.some((s) => ts >= s.openedAt && ts <= (s.closedAt ?? now))
    const from = Math.min(...shifts.map((s) => s.openedAt))
    const to = Math.max(...shifts.map((s) => s.closedAt ?? now))
    const [report, closed, expenses, audit, users] = await Promise.all([
      buildReport(shifts),
      db.orders.where('closedAt').between(from, to, true, true).toArray(),
      db.expenses.where('shiftId').anyOf(ids).sortBy('createdAt'),
      db.auditLog.where('shiftId').anyOf(ids).toArray(),
      db.users.toArray(),
    ])
    const orders = closed.filter((o) => inShift(o.closedAt!)).sort((a, b) => a.closedAt! - b.closedAt!)
    const orderIds = orders.map((o) => o.id!)
    const [lines, payments] = await Promise.all([
      db.orderLines.where('orderId').anyOf(orderIds).toArray(),
      db.payments.where('orderId').anyOf(orderIds).toArray(),
    ])
    const edited = new Set(audit.map((a) => a.orderId).filter(Boolean))
    const editedExpenses = new Set(audit.map((a) => a.expenseId).filter(Boolean))
    return {
      totals: report.totals,
      days: report.days,
      rows: orders.map((o) => ({
        order: o,
        total: orderDue(lines.filter((l) => l.orderId === o.id), o),
        methods: [...new Set(payments.filter((p) => p.orderId === o.id).map((p) => METHOD_LABEL[p.method]))],
        edited: edited.has(o.id),
      })),
      expenses: expenses.map((e) => ({ ...e, edited: editedExpenses.has(e.id) })),
      audit: audit.sort((a, b) => b.at - a.at),
      names: new Map(users.map((u) => [u.id!, u.name])),
    }
  }, [key, shifts.map((s) => `${s.closedAt ?? ''}${JSON.stringify(s.received ?? '')}`).join(',')])

  const [selected, setSelected] = useState<Order | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const remote = useRemote()
  if (!data) return null
  const t = data.totals
  const multi = shifts.length > 1

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            ['الدخل', t.sales],
            ['كاش', t.cash],
            ['كليك', t.cliq],
            ['المصاريف', t.expenses + t.outside],
            ['الصافي', t.net],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-2xl bg-white/70 p-3 ring-1 ring-cream-200">
            <div className="text-sm text-ink/60">{label}</div>
            <div className="num font-display text-xl text-green">{formatJod(v)}</div>
          </div>
        ))}
      </div>

      {!multi && data.days[0] && <ReceivedCard day={data.days[0]} names={data.names} />}

      {!multi && !!(shifts[0].openChecks?.length || shifts[0].closeChecks?.length) && (
        <section className="grid gap-4 rounded-3xl bg-white/70 p-4 ring-1 ring-cream-200 md:grid-cols-2">
          <ChecklistView title="مهام الفتح" marks={shifts[0].openChecks} />
          <ChecklistView title="مهام التسكير" marks={shifts[0].closeChecks} />
        </section>
      )}

      <section className="rounded-3xl bg-white/70 p-4 ring-1 ring-cream-200">
        <h2 className="mb-3 font-display text-xl text-green">
          الطلبات <span className="num text-base text-ink/50">({data.rows.length})</span>
        </h2>
        {!data.rows.length && <p className="text-ink/50">ما في طلبات</p>}
        <ul className="flex flex-col gap-1.5">
          {data.rows.map(({ order, total, methods, edited }) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => setSelected(order)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-start ring-1 ring-cream-200 active:bg-gold/30 ${
                  order.status === 'void' ? 'opacity-60' : ''
                }`}
              >
                <span className="w-24 shrink-0 text-xs text-ink/50">
                  {multi && <span className="block">{dayLabel(businessDayOf(shifts, order.closedAt!))}</span>}
                  <span className="num">{timeLabelOf(order.closedAt!)}</span>
                </span>
                <span className="flex-1 font-bold text-green">
                  {order.label}
                  <span className="ms-2 text-xs font-normal text-ink/50">{data.names.get(order.staffId)}</span>
                </span>
                {edited && <span className="rounded-md bg-gold/60 px-2 py-0.5 text-xs font-bold text-green">معدّل</span>}
                {order.status === 'void' ? (
                  <span className="rounded-md bg-red-800 px-2 py-0.5 text-xs font-bold text-cream">ملغي</span>
                ) : (
                  <span className="text-sm text-ink/60">{methods.join(' + ')}</span>
                )}
                <span className={`num font-display text-lg text-green ${order.status === 'void' ? 'line-through' : ''}`}>
                  {formatJod(total)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl bg-white/70 p-4 ring-1 ring-cream-200">
        <h2 className="mb-3 font-display text-xl text-green">المصاريف</h2>
        {!data.expenses.length && <p className="text-ink/50">ما في مصاريف</p>}
        <ul className="flex flex-col gap-1.5">
          {data.expenses.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setEditingExpense(e)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-start ring-1 ring-cream-200 active:bg-gold/30"
              >
                <span className="w-24 shrink-0 text-xs text-ink/50">
                  {multi && <span className="block">{dayLabel(shifts.find((s) => s.id === e.shiftId)?.openedAt ?? e.createdAt)}</span>}
                  <span className="num">{timeLabelOf(e.createdAt)}</span>
                </span>
                <span className="flex-1">
                  <span className="font-bold text-green">{e.reason}</span>
                  <span className="text-xs text-ink/50"> · {data.names.get(e.staffId)}</span>
                </span>
                {e.edited && <span className="rounded-md bg-gold/60 px-2 py-0.5 text-xs font-bold text-green">معدّل</span>}
                {expenseSource(e) === 'outside' && (
                  <span className="rounded-md bg-gold/60 px-2 py-0.5 text-xs font-bold text-green">من برا الدرج</span>
                )}
                <span className="num font-display text-lg text-green">{formatJod(e.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl bg-white/70 p-4 ring-1 ring-cream-200">
        <h2 className="mb-1 font-display text-xl text-green">سجل التعديلات</h2>
        {remote && (
          <p className="mb-3 text-sm text-ink/60">تعديلك بيبيّن عندك هلق، وبيوصل التابلت أول ما يتّصل (والأرقام والدرج بينحسبوا من جديد هناك).</p>
        )}
        {!data.audit.length && <p className="text-ink/50">ما في تعديلات على هالأيام</p>}
        <ul className="flex flex-col divide-y divide-cream-200">
          {data.audit.map((a) => (
            <li key={a.id} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="w-28 shrink-0 text-xs text-ink/50">
                {dayLabel(shifts.find((s) => s.id === a.shiftId)?.openedAt ?? a.at)} <span className="num">{timeLabelOf(a.at)}</span>
              </span>
              <span className="flex-1">
                {a.summary}
                {a.remote && <span className="ms-2 rounded-md bg-cream-200 px-1.5 py-0.5 text-xs text-green">من بعيد</span>}
                {a.preview && <span className="ms-1 text-xs text-ink/50">⏳ بيوصل التابلت</span>}
              </span>
              <span className="shrink-0 text-xs font-bold text-green">{data.names.get(a.byUserId)}</span>
            </li>
          ))}
        </ul>
      </section>

      {selected && <OrderEditor order={selected} onClose={() => setSelected(null)} />}
      {editingExpense && <ExpenseEditor expense={editingExpense} onClose={() => setEditingExpense(null)} />}
    </>
  )
}

/** استلام مصاري اليوم: الكاش اللي انسحب من الدرج، وتحويل الكليك اللي على حساب الموظف. للمالك بس. */
function ReceivedCard({ day, names }: { day: DayRow; names: Map<number, string> }) {
  const { user } = useSession()
  const [error, setError] = useState('')
  const status = receivedStatus(day)
  const shift = day.shift
  if (status.state === 'open')
    return <p className="rounded-2xl bg-cream-200 px-4 py-3 text-sm text-ink/70">الشيفت لسا مفتوح: استلام مصاري اليوم بتعلّمه بعد التسكير.</p>

  const rows = [
    { kind: 'cash' as const, label: 'الكاش المسحوب من الدرج', amount: Math.max(0, day.withdrawn ?? 0), done: 'استلمت ✓', todo: 'استلمته' },
    { kind: 'cliq' as const, label: `كليك لازم يحوّله ${names.get(shift.staffId) ?? 'الموظف'}`, amount: day.cliqTransfer, done: 'وصلني ✓', todo: 'وصلني' },
  ].filter((r) => r.amount > 0)

  async function toggle(kind: 'cash' | 'cliq', received: boolean) {
    setError('')
    try {
      await ownerEdit({ op: 'day-received', shiftId: shift.id!, kind, received }, user!.id!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
    }
  }

  return (
    <section
      className={`rounded-3xl p-4 ring-1 ${status.state === 'done' ? 'bg-green/10 ring-green/20' : status.state === 'none' ? 'bg-white/70 ring-cream-200' : 'bg-red-800/10 ring-red-800/20'}`}
    >
      <h2 className="mb-2 font-display text-xl text-green">
        استلام مصاري اليوم {status.state === 'done' && '✓'}
      </h2>
      {!rows.length && <p className="text-sm text-ink/60">ما في مصاري للاستلام بهاليوم (ما انسحب كاش وما في كليك لازم يتحوّل).</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const mark = shift.received?.[r.kind]
          return (
            <li key={r.kind} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-cream-200">
              <span className="flex-1">
                <span className="font-bold text-green">{r.label}</span>
                {mark && (
                  <span className="block text-xs text-ink/50">
                    علّمه {names.get(mark.by)} · {dayLabel(mark.at)} <span className="num">{timeLabelOf(mark.at)}</span>
                  </span>
                )}
              </span>
              <span className="num font-display text-lg text-green">{formatJod(r.amount)}</span>
              <button
                type="button"
                onClick={() => toggle(r.kind, !mark)}
                className={`h-12 shrink-0 rounded-xl px-4 font-bold ${mark ? 'bg-green text-cream' : 'bg-gold text-green active:bg-gold-600'}`}
              >
                {mark ? r.done : r.todo}
              </button>
            </li>
          )
        })}
      </ul>
      {rows.some((r) => shift.received?.[r.kind]) && <p className="mt-2 text-xs text-ink/50">كبسة على «✓» بتشيل العلامة إذا علّمت بالغلط.</p>}
      {error && <p className="mt-2 text-center font-bold text-red-700">{error}</p>}
    </section>
  )
}

function Confirm({ title, text, action, onDone }: { title: string; text: string; action: () => Promise<void>; onDone: () => void }) {
  const [error, setError] = useState('')
  return (
    <Sheet title={title} onClose={onDone}>
      <p className="mb-4 text-ink/70">{text}</p>
      {error && <p className="mb-3 text-center font-bold text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onDone} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
          رجوع
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await action()
              onDone()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'ما زبط')
            }
          }}
          className="h-14 rounded-xl bg-red-800 font-bold text-cream"
        >
          أكّد
        </button>
      </div>
    </Sheet>
  )
}

function OrderEditor({ order: initial, onClose }: { order: Order; onClose: () => void }) {
  const { user } = useSession()
  const order = useLiveQuery(() => db.orders.get(initial.id!), [initial.id]) ?? initial
  const lines = useLiveQuery(() => db.orderLines.where('orderId').equals(initial.id!).sortBy('createdAt'), [initial.id])
  const allShiftsList = useLiveQuery(() => db.shifts.toArray(), [])
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: () => Promise<void> } | null>(null)
  // من بعيد: التعديل بينبعت للتابلت (الحذف النهائي من التابلت بس)
  const remote = useRemote()
  const isVoid = order.status === 'void'
  const paidNote = order.status === 'paid' ? ' الطلب مدفوع، فالدفعة بتنقص بنفس المبلغ (والدخل والدرج بيتحدّثوا).' : ''

  const removeLine = (l: OrderLine, units: number) =>
    setConfirm({
      title: units === l.qty ? `شيل «${l.nameSnapshot}»؟` : `نقّص «${l.nameSnapshot}»؟`,
      text: `رح ينشال ${units}× ${l.nameSnapshot} (${formatJod(units * l.priceSnapshot)}) من ${order.label}.${paidNote}`,
      action: () => ownerEdit({ op: 'line-remove', lineId: l.id!, units }, user!.id!),
    })

  return (
    <Sheet title={order.label} onClose={onClose} wide>
      <p className="mb-3 text-sm text-ink/60">
        {dayLabel(businessDayOf(allShiftsList ?? [], order.closedAt ?? order.openedAt))} · فتح <span className="num">{timeLabelOf(order.openedAt)}</span>
        {order.closedAt && (
          <>
            {' '}
            · تسكّر <span className="num">{timeLabelOf(order.closedAt)}</span>
          </>
        )}
        {isVoid && <span className="ms-2 rounded-md bg-red-800 px-2 py-0.5 text-xs font-bold text-cream">ملغي</span>}
      </p>

      <ul className="mb-4 divide-y divide-cream-200">
        {lines?.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2">
            <span className="num w-8 text-ink/60">{l.qty}×</span>
            <span className="flex-1">
              <span className="font-bold text-green">{l.nameSnapshot}</span>
              {(l.options.length > 0 || l.note) && (
                <span className="text-sm text-ink/60"> · {[optionsLabel(l.options), l.note].filter(Boolean).join(' · ')}</span>
              )}
            </span>
            <span className="num">{formatJod(l.priceSnapshot * l.qty)}</span>
            {!isVoid && (
              <span className="flex gap-1">
                {l.qty > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(l, 1)}
                    className="h-12 rounded-xl bg-cream-200 px-3 text-green active:bg-green-100"
                  >
                    −1
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeLine(l, l.qty)}
                  className="h-12 rounded-xl px-3 text-sm text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
                >
                  شيل
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!!order.loyaltyDiscount && (
        <p className="-mt-2 mb-4 flex justify-between border-t border-cream-200 pt-2 font-bold text-green">
          <span>خصم ولاء</span>
          <span className="num">−{formatJod(order.loyaltyDiscount)}</span>
        </p>
      )}
      {order.manualDiscount && (
        <p className="-mt-2 mb-4 flex justify-between border-t border-cream-200 pt-2 font-bold text-green">
          <span>خصم ({order.manualDiscount.reason})</span>
          <span className="num">−{formatJod(order.manualDiscount.amount)}</span>
        </p>
      )}

      {isVoid ? (
        <p className="rounded-xl bg-red-800/10 p-3 text-center text-red-900">الطلب ملغي، ودفعاته ما بتنحسب بالدخل</p>
      ) : (
        <>
          <h3 className="mb-2 font-bold text-green">الدفعات</h3>
          <PaymentsList orderId={order.id!} />
          <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: `إلغاء ${order.label}؟`,
                  text: 'الطلب بيضل بيومه بس ما بينحسب بالمبيعات، ودفعاته بتطلع من الدخل والدرج.',
                  action: () => ownerEdit({ op: 'order-void', orderId: order.id! }, user!.id!),
                })
              }
              className="mt-4 h-12 w-full rounded-xl font-medium text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
            >
              إلغاء الطلب
            </button>
        </>
      )}

      {!remote && (
        <div className="mt-4 border-t border-cream-200 pt-2">
          <DeleteOrderButton order={order} total={(lines ?? []).reduce((s, l) => s + l.qty * l.priceSnapshot, 0)} onDeleted={onClose} />
        </div>
      )}

      {confirm && <Confirm {...confirm} onDone={() => setConfirm(null)} />}
    </Sheet>
  )
}

function ExpenseEditor({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { user } = useSession()
  const [amount, setAmount] = useState(formatJod(expense.amount))
  const [reason, setReason] = useState(expense.reason)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    try {
      await ownerEdit({ op: 'expense-edit', expenseId: expense.id!, amount: toFils(amount || 0), reason }, user!.id!)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
    }
  }

  return (
    <Sheet title="تعديل مصروف" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">المبلغ</span>
          <MoneyInput value={amount} onChange={setAmount} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">السبب</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-14 rounded-xl bg-white px-4 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
          />
        </label>
        {error && <p className="text-center font-bold text-red-700">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="h-14 shrink-0 rounded-2xl px-5 font-medium text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
          >
            احذف
          </button>
          <button type="button" onClick={save} className="h-14 flex-1 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
            حفظ
          </button>
        </div>
      </div>
      {confirmDelete && (
        <Confirm
          title="حذف المصروف؟"
          text={`«${expense.reason}» ${formatJod(expense.amount)} رح ينحذف، والحذف بينحفظ بسجل التعديلات.`}
          action={() => ownerEdit({ op: 'expense-delete', expenseId: expense.id! }, user!.id!)}
          onDone={() => {
            setConfirmDelete(false)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}
