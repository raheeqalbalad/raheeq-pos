import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Shift } from '../db/types'
import { closeShift, countDrawer, leftInDrawerOf, resetDrawerCount, shiftSummary, withdrawnOf, type ShiftSummary } from '../lib/shift'
import { formatJod, toFils } from '../lib/money'
import { useSession } from '../lib/session'
import { useOwnerGate } from '../lib/useOwnerGate'
import { allChecked, getChecklists, toggleCloseCheck } from '../lib/checklists'
import { ChecklistInput, ChecklistView } from '../components/Checklist'
import ShareSummaryButton from '../components/ShareSummaryButton'
import { timeLabel } from '../components/PaymentsList'
import MoneyInput from '../components/MoneyInput'
import Sheet from '../components/Sheet'
import Header from '../components/Header'

function Row({
  label,
  value,
  strong = false,
  sub = false,
  sign = '',
}: {
  label: string
  value: number
  strong?: boolean
  /** سطر تفصيل تحت سطر (أصغر ومزاح) */
  sub?: boolean
  sign?: string
}) {
  return (
    <div
      className={`flex items-baseline justify-between ${sub ? 'py-1.5 ps-4 text-sm text-ink/70' : 'py-2'} ${strong ? 'font-bold text-green' : ''}`}
    >
      <span>{label}</span>
      <span className={`num ${strong ? 'font-display text-2xl' : sub ? '' : 'text-lg'}`}>
        {sign}
        {formatJod(value)}
      </span>
    </div>
  )
}

function useStaffNames(ids: number[] | undefined) {
  return useLiveQuery(async () => (await db.users.bulkGet(ids ?? [])).map((u) => u?.name).filter(Boolean).join('، '), [
    ids?.join(','),
  ])
}

/** ملخّص الأرقام: المبيعات والمصاريف والصافي، وحساب الدرج. */
function SummaryCard({ shift, summary }: { shift: Shift; summary: ShiftSummary }) {
  const names = useStaffNames(summary.staffIds)
  const opener = useLiveQuery(() => db.users.get(shift.staffId), [shift.staffId])
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
        <h2 className="mb-2 font-display text-xl text-green">المبيعات</h2>
        <div className="divide-y divide-cream-200">
          <Row label="كاش" value={summary.cash} />
          <Row label="كليك" value={summary.cliq} />
          {summary.cliqSplit.map((r) => (
            <Row key={`${r.isStaff}${r.name}`} sub label={r.isStaff ? `${r.name} (على حساب الموظف)` : r.name} value={r.amount} />
          ))}
          <Row label="مجموع المبيعات" value={summary.sales} strong />
          {summary.loyalty > 0 && <Row label="خصم ولاء (منقوص من المبيعات)" value={summary.loyalty} sign="−" />}
          {summary.manual > 0 && <Row label="خصومات يدوية (منقوصة من المبيعات)" value={summary.manual} sign="−" />}
          <Row label="مصاريف الدرج" value={summary.expenses} sign="−" />
          {summary.outside > 0 && <Row label="مصاريف من برا الدرج" value={summary.outside} sign="−" />}
          <Row label="الصافي" value={summary.net} strong />
        </div>
        <p className="mt-3 text-sm text-ink/60">
          <span className="num">{summary.paidOrders}</span> طلب مدفوع
          {summary.voidOrders > 0 && (
            <>
              {' '}
              · <span className="num">{summary.voidOrders}</span> ملغي
            </>
          )}
        </p>
      </section>
      <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
        <h2 className="mb-2 font-display text-xl text-green">الدرج</h2>
        <div className="divide-y divide-cream-200">
          <Row label="كاش البداية" value={shift.openingCash} />
          <Row label="مبيعات كاش" value={summary.cash} sign="+" />
          {summary.cliqStaff > 0 && <Row label="كليك على حساب الموظف (بيتحط كاش بالدرج)" value={summary.cliqStaff} sign="+" />}
          <Row label="مصاريف الدرج" value={summary.expenses} sign="−" />
          <Row label="المفروض بالدرج" value={summary.expectedCash} strong />
        </div>
        <p className="mt-3 text-sm text-ink/60">
          فتحه {opener?.name} الساعة <span className="num">{timeLabel(shift.openedAt)}</span>
          {names && <> · باعوا: {names}</>}
        </p>
      </section>
    </div>
  )
}

/** المعدود والمفروض والفرق (زيادة بالأخضر، نقص بالأحمر). */
function CountResult({ counted, expected }: { counted: number; expected: number }) {
  const diff = counted - expected
  const diffClass = diff === 0 ? 'bg-green text-cream' : diff > 0 ? 'bg-emerald-700/15 text-emerald-900' : 'bg-red-800/15 text-red-900'
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-2xl bg-cream-200 p-3">
        <div className="text-sm text-ink/60">المعدود</div>
        <div className="num font-display text-2xl text-green">{formatJod(counted)}</div>
      </div>
      <div className="rounded-2xl bg-cream-200 p-3">
        <div className="text-sm text-ink/60">المفروض</div>
        <div className="num font-display text-2xl text-green">{formatJod(expected)}</div>
      </div>
      <div className={`rounded-2xl p-3 ${diffClass}`}>
        <div className="text-sm font-bold">{diff === 0 ? 'الدرج مضبوط ✓' : diff > 0 ? 'زيادة ▲' : 'نقص ▼'}</div>
        <div className="num font-display text-2xl">
          {diff > 0 ? '+' : diff < 0 ? '−' : ''}
          {formatJod(Math.abs(diff))}
        </div>
      </div>
    </div>
  )
}

const DEFAULT_LEFT = '10.00'

function WithdrawRow({ left, withdrawn }: { left: number; withdrawn: number }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
      <div className="rounded-xl bg-cream-200 p-3">
        <div className="text-sm text-ink/60">بيضل بالدرج</div>
        <div className="num font-display text-2xl text-green">{formatJod(left)}</div>
      </div>
      <div className="rounded-xl bg-green p-3 text-cream">
        <div className="text-sm opacity-70">المسحوب</div>
        <div className="num font-display text-2xl text-gold">{formatJod(withdrawn)}</div>
      </div>
    </div>
  )
}

function OpenOrdersWarning() {
  const openOrders = useLiveQuery(() => db.orders.where('status').equals('open').toArray(), [])
  if (!openOrders?.length) return null
  return (
    <div className="rounded-2xl bg-gold/40 px-5 py-3 text-ink">
      في <span className="num font-bold">{openOrders.length}</span> طلب لسا مفتوح ({openOrders.map((o) => o.label).join('، ')}). إذا سكّرت
      هلق، رح يضلّوا مفتوحين ودفعهم بينحسب على الشيفت الجاي.
    </div>
  )
}

/**
 * تسكير الشيفت:
 * ٠. مهام التسكير (إذا المالك كاتب مهام): لازم يعلّم عليها كلها.
 * ١. العدّ الأعمى: الموظف بيكتب كم عدّ وبيأكّد، بدون ما يشوف المفروض. الرقم بينحفظ على الشيفت.
 * ٢. النتيجة: المعدود والمفروض والفرق، وبعدين كم تركت للشيفت الجاي والمسحوب.
 */
export default function CloseShiftScreen({ shift, onClosed }: { shift: Shift; onClosed: (id: number) => void }) {
  const { user } = useSession()
  const tasks = useLiveQuery(async () => (await getChecklists()).close, [])
  if (!tasks) return null
  const checked = allChecked(tasks, shift.closeChecks)
  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <OpenOrdersWarning />
        {tasks.length > 0 && (
          <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
            <h2 className="mb-1 font-display text-xl text-green">مهام التسكير</h2>
            {!checked && <p className="mb-3 text-sm text-ink/60">علّم على كل مهمة بعد ما تخلّصها، وبعدين بتعدّ الدرج.</p>}
            <ChecklistInput tasks={tasks} marks={shift.closeChecks ?? []} onToggle={(t) => toggleCloseCheck(shift.id!, t, user!.id!)} />
          </section>
        )}
        {!checked ? null : shift.countedCash === undefined ? <BlindCount shift={shift} /> : <AfterCount shift={shift} onClosed={onClosed} />}
      </div>
    </main>
  )
}

function BlindCount({ shift }: { shift: Shift }) {
  const { user } = useSession()
  const [counted, setCounted] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const countedFils = toFils(counted || 0)

  async function confirm() {
    setError('')
    try {
      await countDrawer(shift.id!, countedFils, user!.id!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
      setConfirming(false)
    }
  }

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">عدّ الدرج</h2>
      <p className="mb-3 text-ink/60">عدّ الكاش اللي بالدرج واكتبه هون. رقم «المفروض» والفرق بيبيّنوا بعد ما تأكّد العدّ.</p>
      <MoneyInput value={counted} onChange={setCounted} />
      {error && <p className="mt-2 font-bold text-red-700">{error}</p>}
      <button
        type="button"
        disabled={counted === ''}
        onClick={() => setConfirming(true)}
        className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
      >
        أكّد العدّ
      </button>

      {confirming && (
        <Sheet title="متأكد من العدّ؟" onClose={() => setConfirming(false)}>
          <p className="mb-2 text-center">
            عدّيت بالدرج <span className="num font-display text-3xl text-green">{formatJod(countedFils)}</span>
          </p>
          <p className="mb-4 text-center text-sm text-ink/60">بعد التأكيد ما بتقدر تغيّر الرقم، وبيبيّن الفرق باسمك.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirming(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع، بعدّ مرة تانية
            </button>
            <button type="button" onClick={confirm} className="h-14 rounded-xl bg-green font-bold text-cream">
              تأكيد
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

function AfterCount({ shift, onClosed }: { shift: Shift; onClosed: (id: number) => void }) {
  const { user } = useSession()
  const { requireOwner, sheet } = useOwnerGate()
  const [left, setLeft] = useState(DEFAULT_LEFT)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const summary = useLiveQuery(() => shiftSummary(shift), [shift])
  // بيع أو مصروف بعد العدّ: الرقم المعدود صار قديم
  const changedAfter = useLiveQuery(async () => {
    const at = shift.countedAt ?? 0
    const [payments, expenses] = await Promise.all([
      db.payments.where('shiftId').equals(shift.id!).filter((p) => p.createdAt > at).count(),
      db.expenses.where('shiftId').equals(shift.id!).filter((e) => e.createdAt > at).count(),
    ])
    return payments + expenses > 0
  }, [shift.id, shift.countedAt])

  if (!summary) return null
  const countedFils = shift.countedCash!
  const leftFils = toFils(left || 0)
  const leftValid = left !== '' && leftFils <= countedFils
  const withdrawn = countedFils - leftFils

  async function close() {
    setError('')
    try {
      await closeShift(shift.id!, user!.id!, leftFils)
      onClosed(shift.id!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
      setConfirming(false)
    }
  }

  function recount() {
    if (changedAfter) resetDrawerCount(shift.id!, user!.id!, 'صار بيع أو مصروف بعد العدّ')
    else
      requireOwner(
        'عدّ الدرج من جديد',
        (ownerId) => resetDrawerCount(shift.id!, user!.id!, 'بموافقة المالك', ownerId === user!.id ? undefined : ownerId),
        <>الموظف شاف المفروض، فالعدّ من جديد بده موافقة المالك.</>,
      )
  }

  return (
    <>
      <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
        <h2 className="mb-3 font-display text-xl text-green">نتيجة العدّ</h2>
        <CountResult counted={countedFils} expected={summary.expectedCash} />
        {changedAfter && (
          <p className="mt-3 rounded-xl bg-gold/40 px-4 py-2 font-bold text-ink">
            صار بيع أو مصروف بعد ما عدّيت، فالفرق مش دقيق. عدّ الدرج من جديد.
          </p>
        )}
        <button
          type="button"
          onClick={recount}
          className="mt-3 h-12 rounded-xl px-4 text-sm text-ink/70 ring-1 ring-cream-200 active:bg-cream-200"
        >
          عدّ من جديد{changedAfter ? '' : ' (بده رمز المالك)'}
        </button>

        <label className="mt-5 block">
          <span className="mb-1 block font-display text-xl text-green">كم تركت بالدرج للشيفت الجاي؟</span>
          <span className="mb-2 block text-ink/60">الشيفت الجاي بيفتح بهاد المبلغ، والباقي بينحسب مسحوب.</span>
          <MoneyInput value={left} onChange={setLeft} />
        </label>
        {leftValid ? (
          <WithdrawRow left={leftFils} withdrawn={withdrawn} />
        ) : (
          <p className="mt-2 font-bold text-red-700">{left === '' ? 'اكتب كم تركت (حتى لو صفر)' : 'المتروك ما بصير يكون أكثر من المعدود'}</p>
        )}
        {error && <p className="mt-2 font-bold text-red-700">{error}</p>}
        <button
          type="button"
          disabled={!leftValid}
          onClick={() => setConfirming(true)}
          className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
        >
          سكّر الشيفت
        </button>
      </section>

      <SummaryCard shift={shift} summary={summary} />

      {confirming && (
        <Sheet title="تسكير الشيفت؟" onClose={() => setConfirming(false)}>
          <p className="mb-4 text-ink/70">
            الكاش المعدود <span className="num font-bold">{formatJod(countedFils)}</span>، متروك للشيفت الجاي{' '}
            <span className="num font-bold">{formatJod(leftFils)}</span>، ومسحوب <span className="num font-bold">{formatJod(withdrawn)}</span>.
            بعد التسكير ما بتقدر تبيع لحد ما ينفتح شيفت جديد.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirming(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button type="button" onClick={close} className="h-14 rounded-xl bg-green font-bold text-cream">
              سكّر
            </button>
          </div>
        </Sheet>
      )}
      {sheet}
    </>
  )
}

/** بعد التسكير مباشرة: الملخّص النهائي، وبعدين خروج. */
export function ClosedShiftScreen({ shiftId, onDone }: { shiftId: number; onDone: () => void }) {
  const data = useLiveQuery(async () => {
    const shift = await db.shifts.get(shiftId)
    return shift ? { shift, summary: await shiftSummary(shift) } : undefined
  }, [shiftId])

  if (!data) return null
  const { shift, summary } = data
  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <h1 className="font-display text-2xl text-green">
            تسكّر الشيفت <span className="num text-lg text-ink/50">{timeLabel(shift.openedAt)} – {timeLabel(shift.closedAt!)}</span>
          </h1>
          <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
            <h2 className="mb-3 font-display text-xl text-green">تسليم الدرج</h2>
            <CountResult counted={shift.countedCash ?? 0} expected={summary.expectedCash} />
            <WithdrawRow left={leftInDrawerOf(shift) ?? 0} withdrawn={withdrawnOf(shift) ?? 0} />
          </section>
          {!!(shift.openChecks?.length || shift.closeChecks?.length) && (
            <section className="grid gap-4 rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200 md:grid-cols-2">
              <ChecklistView title="مهام الفتح" marks={shift.openChecks} />
              <ChecklistView title="مهام التسكير" marks={shift.closeChecks} />
            </section>
          )}
          <SummaryCard shift={shift} summary={summary} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ShareSummaryButton shifts={[shift]} />
            <button
              type="button"
              onClick={onDone}
              className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600"
            >
              تمام، خروج
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
