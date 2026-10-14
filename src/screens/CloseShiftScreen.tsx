import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Shift } from '../db/types'
import { closeShift, leftInDrawerOf, shiftSummary, withdrawnOf, type ShiftSummary } from '../lib/shift'
import { formatJod, toFils } from '../lib/money'
import { useSession } from '../lib/session'
import { timeLabel } from '../components/PaymentsList'
import MoneyInput from '../components/MoneyInput'
import Sheet from '../components/Sheet'
import Header from '../components/Header'

function Row({ label, value, strong = false, sign = '' }: { label: string; value: number; strong?: boolean; sign?: string }) {
  return (
    <div className={`flex items-baseline justify-between py-2 ${strong ? 'font-bold text-green' : ''}`}>
      <span>{label}</span>
      <span className={`num ${strong ? 'font-display text-2xl' : 'text-lg'}`}>
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
          <Row label="مجموع المبيعات" value={summary.sales} strong />
          {summary.loyalty > 0 && <Row label="خصم ولاء (منقوص من المبيعات)" value={summary.loyalty} sign="−" />}
          {summary.manual > 0 && <Row label="خصومات يدوية (منقوصة من المبيعات)" value={summary.manual} sign="−" />}
          {summary.cliqSplit
            .filter((r) => !r.isStaff)
            .map((r) => (
              <Row key={r.name} label={`  كليك — ${r.name}`} value={r.amount} />
            ))}
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
          <Row label="مصاريف الدرج" value={summary.expenses} sign="−" />
          <Row label="المفروض بالدرج" value={summary.expectedCash} strong />
        </div>
        {summary.cliqStaff > 0 && (
          <div className="mt-3 rounded-xl bg-red-800/10 px-3 py-2 text-red-900">
            {summary.cliqSplit
              .filter((r) => r.isStaff)
              .map((r) => (
                <div key={r.name} className="flex items-baseline justify-between font-bold">
                  <span>كليك على حساب الموظف ({r.name}) — لازم يتسلّم</span>
                  <span className="num">{formatJod(r.amount)}</span>
                </div>
              ))}
          </div>
        )}
        <p className="mt-3 text-sm text-ink/60">
          فتحه {opener?.name} الساعة <span className="num">{timeLabel(shift.openedAt)}</span>
          {names && <> · باعوا: {names}</>}
        </p>
      </section>
    </div>
  )
}

function Difference({ diff }: { diff: number }) {
  return (
    <div
      className={`flex items-baseline justify-between rounded-2xl px-5 py-4 ${
        diff === 0 ? 'bg-green text-cream' : 'bg-red-800/10 text-red-900'
      }`}
    >
      <span className="font-bold">{diff === 0 ? 'الدرج مضبوط ✓' : diff > 0 ? 'زيادة بالدرج' : 'نقص بالدرج'}</span>
      <span className="num font-display text-3xl">{formatJod(Math.abs(diff))}</span>
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

export default function CloseShiftScreen({ shift, onClosed }: { shift: Shift; onClosed: (id: number) => void }) {
  const { user } = useSession()
  const [counted, setCounted] = useState('')
  const [left, setLeft] = useState(DEFAULT_LEFT)
  const [confirming, setConfirming] = useState(false)
  const summary = useLiveQuery(() => shiftSummary(shift), [shift])
  const openOrders = useLiveQuery(() => db.orders.where('status').equals('open').toArray(), [])

  if (!summary) return null
  const countedFils = toFils(counted || 0)
  const diff = countedFils - summary.expectedCash
  const leftFils = toFils(left || 0)
  const leftValid = left !== '' && leftFils <= countedFils
  const withdrawn = countedFils - leftFils

  async function close() {
    if (!leftValid) return
    await closeShift(shift.id!, user!.id!, countedFils, leftFils)
    onClosed(shift.id!)
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <SummaryCard shift={shift} summary={summary} />

        {!!openOrders?.length && (
          <div className="rounded-2xl bg-gold/40 px-5 py-3 text-ink">
            في <span className="num font-bold">{openOrders.length}</span> طلب لسا مفتوح (
            {openOrders.map((o) => o.label).join('، ')}). إذا سكّرت هلق، رح يضلّوا مفتوحين ودفعهم بينحسب على الشيفت الجاي.
          </div>
        )}

        <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
          <h2 className="mb-1 font-display text-xl text-green">عدّ الدرج</h2>
          <p className="mb-3 text-ink/60">عدّ الكاش اللي بالدرج واكتبه هون</p>
          <MoneyInput value={counted} onChange={setCounted} />
          {counted !== '' && (
            <>
              <div className="mt-3">
                <Difference diff={diff} />
              </div>
              <label className="mt-5 block">
                <span className="mb-1 block font-display text-xl text-green">كم تركت بالدرج للشيفت الجاي؟</span>
                <span className="mb-2 block text-ink/60">الشيفت الجاي بيفتح بهاد المبلغ، والباقي بينحسب مسحوب.</span>
                <MoneyInput value={left} onChange={setLeft} />
              </label>
              {leftValid ? (
                <WithdrawRow left={leftFils} withdrawn={withdrawn} />
              ) : (
                <p className="mt-2 font-bold text-red-700">
                  {left === '' ? 'اكتب كم تركت (حتى لو صفر)' : 'المتروك ما بصير يكون أكثر من المعدود'}
                </p>
              )}
            </>
          )}
          <button
            type="button"
            disabled={counted === '' || !leftValid}
            onClick={() => setConfirming(true)}
            className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
          >
            سكّر الشيفت
          </button>
        </section>
      </div>

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
    </main>
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
          <SummaryCard shift={shift} summary={summary} />
          <Difference diff={(shift.countedCash ?? 0) - summary.expectedCash} />
          <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
            <h2 className="mb-2 font-display text-xl text-green">تسليم الدرج</h2>
            <div className="divide-y divide-cream-200">
              <Row label="المعدود" value={shift.countedCash ?? 0} />
              <Row label="تركت للشيفت الجاي" value={leftInDrawerOf(shift) ?? 0} />
              <Row label="المسحوب" value={withdrawnOf(shift) ?? 0} strong />
            </div>
          </section>
          <button
            type="button"
            onClick={onDone}
            className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600"
          >
            تمام، خروج
          </button>
        </div>
      </main>
    </div>
  )
}
