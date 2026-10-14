import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cliqChoices } from '../lib/cliq'
import { getOpenShift } from '../lib/shift'
import type { Order, OrderLine, PaymentMethod } from '../db/types'
import type { CliqChoice } from '../lib/cliq'
import DiscountSheet from './DiscountSheet'
import { optionsLabel } from '../lib/orders'
import CustomerBox from './CustomerBox'
import { addPayment } from '../lib/orders'
import { formatJod, toFils } from '../lib/money'
import { useSession } from '../lib/session'
import Sheet from './Sheet'
import { METHOD_LABEL } from './PaymentsList'

const BILLS = [1, 5, 10, 20, 50]

/** نص المبلغ، مدوّر لفوق لأقرب 0.05 عشان الفكّة. */
const half = (fils: number) => Math.ceil(fils / 2 / 50) * 50

export default function PaySheet({
  orderId,
  order,
  lines,
  label,
  subtotal,
  total,
  paid,
  onPaidFull,
  onClose,
}: {
  orderId: number
  order: Order | undefined
  lines: OrderLine[]
  /** اسم الطاولة أو التيك أواي */
  label: string
  /** مجموع الأصناف قبل الخصومات */
  subtotal: number
  /** المطلوب بعد الخصم */
  total: number
  paid: number
  onPaidFull: () => void
  onClose: () => void
}) {
  const { user } = useSession()
  const remaining = total - paid
  const [amountText, setAmountText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [givenText, setGivenText] = useState('')
  // الكليك على حساب مين (التلقائي من إعدادات المالك)
  const cliq = useLiveQuery(async () => cliqChoices(await getOpenShift()), [])
  const [cliqKey, setCliqKey] = useState<string>()
  const cliqChoice = cliq?.choices.find((c) => c.key === (cliqKey ?? cliq.defaultKey))
  // كل دفعة بتمرق على شاشة تأكيد قبل ما تنسجّل
  const [confirming, setConfirming] = useState<{ method: PaymentMethod; value: number } | null>(null)
  const [discounting, setDiscounting] = useState(false)

  const amount = toFils(amountText || 0)
  const amountValid = amount > 0 && amount <= remaining
  // حاسبة الباقي: على مبلغ التقسيم إذا مكتوب، وإلا على كل الباقي
  const due = amountValid ? amount : remaining
  const given = toFils(givenText || 0)
  const change = given - due

  function pay(method: PaymentMethod, value: number) {
    setError('')
    setConfirming({ method, value })
  }

  async function confirmPay(method: PaymentMethod, value: number) {
    if (busy) return
    setConfirming(null)
    setBusy(true)
    setError('')
    try {
      const done = await addPayment(orderId, method, value, user!.id!, cliqChoice && { key: cliqChoice.key, name: cliqChoice.name })
      setAmountText('')
      setGivenText('')
      if (done) onPaidFull()
    } catch (e) {
      setError(e instanceof Error && e.message === 'ما في شيفت مفتوح' ? 'لازم تفتح شيفت أول' : 'ما انسجلت الدفعة، جرّب كمان مرة')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="الدفع" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {order && <CustomerBox order={order} subtotal={subtotal} paid={paid} />}
        {order && paid === 0 && (
          <button
            type="button"
            onClick={() => setDiscounting(true)}
            className="-mt-2 h-12 rounded-xl font-medium text-green ring-1 ring-green/30 active:bg-cream-200"
          >
            {order.manualDiscount ? `خصم ${formatJod(order.manualDiscount.amount)} (${order.manualDiscount.reason}) — تعديل` : 'خصم'}
          </button>
        )}
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/70 p-3">
            <dt className="text-xs text-ink/60">المجموع</dt>
            <dd className="num font-display text-xl text-green">{formatJod(total)}</dd>
          </div>
          <div className="rounded-xl bg-white/70 p-3">
            <dt className="text-xs text-ink/60">مدفوع</dt>
            <dd className="num font-display text-xl text-green">{formatJod(paid)}</dd>
          </div>
          <div className="rounded-xl bg-green p-3 text-cream">
            <dt className="text-xs opacity-70">الباقي</dt>
            <dd className="num font-display text-xl text-gold">{formatJod(remaining)}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          {(['cash', 'cliq'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => pay(m, remaining)}
              className="flex h-20 flex-col items-center justify-center rounded-2xl bg-gold font-bold text-green active:bg-gold-600 disabled:opacity-50"
            >
              <span className="text-lg">{METHOD_LABEL[m]} كامل</span>
              <span className="num text-sm">{formatJod(remaining)}</span>
            </button>
          ))}
        </div>

        {cliq && cliq.choices.length > 0 && (
          <div className="-mt-2">
            <span className="mb-1 block text-sm text-ink/60">الكليك على حساب:</span>
            <div className="flex flex-wrap gap-2">
              {cliq.choices.map((c) => {
                const on = c.key === cliqChoice?.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCliqKey(c.key)}
                    className={`h-12 rounded-xl px-4 font-medium ${
                      on ? (c.isStaff ? 'bg-red-800 text-cream' : 'bg-green text-cream') : 'bg-cream-200 text-green active:bg-green-100'
                    }`}
                  >
                    {c.name}
                    {c.isStaff && <span className="text-xs opacity-80"> (الموظف)</span>}
                  </button>
                )
              })}
            </div>
            {cliqChoice?.isStaff && (
              <p className="mt-1 text-sm font-bold text-red-800">الكليك على حساب الموظف لازم يتسلّم منه بتسكير الشيفت</p>
            )}
          </div>
        )}

        <section className="rounded-2xl border border-cream-200 p-4">
          <h3 className="mb-3 font-bold text-green">
            حاسبة الباقي <span className="text-sm font-normal text-ink/50">(على <span className="num">{formatJod(due)}</span>)</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {BILLS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setGivenText(String(b))}
                className={`num h-12 min-w-14 rounded-xl px-3 text-lg font-bold ${
                  given === b * 1000 ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
                }`}
              >
                {b}
              </button>
            ))}
            <input
              inputMode="decimal"
              placeholder="مع الزبون"
              value={givenText}
              onChange={(e) => setGivenText(e.target.value.replace(/[^\d.]/g, ''))}
              className="num h-12 w-28 min-w-0 flex-1 rounded-xl bg-white px-3 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
            />
          </div>
          {given > 0 && (
            <div
              className={`mt-3 flex items-baseline justify-between rounded-xl px-4 py-3 ${
                change >= 0 ? 'bg-green text-cream' : 'bg-red-700/10 text-red-800'
              }`}
            >
              <span className="font-bold">{change >= 0 ? 'رجّع للزبون' : 'ناقص'}</span>
              <span className={`num font-display text-3xl ${change >= 0 ? 'text-gold' : ''}`}>
                {formatJod(Math.abs(change))}
              </span>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-cream-200 p-4">
          <h3 className="mb-3 font-bold text-green">تقسيم الفاتورة</h3>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              placeholder="المبلغ"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ''))}
              className="num h-14 min-w-0 flex-1 rounded-xl bg-white px-4 text-xl ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
            />
            <button
              type="button"
              onClick={() => setAmountText(formatJod(half(remaining)))}
              className="h-14 shrink-0 rounded-xl bg-cream-200 px-4 font-medium text-green active:bg-green-100"
            >
              النص
            </button>
          </div>
          {amountText && !amountValid && (
            <p className="mt-2 text-sm text-red-700">المبلغ لازم يكون أكبر من صفر ومش أكثر من الباقي</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(['cash', 'cliq'] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!amountValid || busy}
                onClick={() => pay(m, amount)}
                className="h-14 rounded-xl bg-green font-bold text-cream active:bg-green-700 disabled:opacity-30"
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="text-center text-red-700">{error}</p>}
      </div>
      {confirming && order && (
        <ConfirmPay
          label={label}
          lines={lines}
          order={order}
          subtotal={subtotal}
          total={total}
          paid={paid}
          method={confirming.method}
          value={confirming.value}
          cliq={confirming.method === 'cliq' ? cliqChoice : undefined}
          onBack={() => setConfirming(null)}
          onConfirm={() => confirmPay(confirming.method, confirming.value)}
        />
      )}
      {discounting && order && <DiscountSheet order={order} subtotal={subtotal} onClose={() => setDiscounting(false)} />}
    </Sheet>
  )
}

/** تأكيد الدفعة: كل التفاصيل قبل ما تنسجّل، بزرين كبار. */
function ConfirmPay({
  label,
  lines,
  order,
  subtotal,
  total,
  paid,
  method,
  value,
  cliq,
  onBack,
  onConfirm,
}: {
  label: string
  lines: OrderLine[]
  order: Order
  subtotal: number
  total: number
  paid: number
  method: PaymentMethod
  value: number
  cliq?: CliqChoice
  onBack: () => void
  onConfirm: () => void
}) {
  const after = total - paid - value
  const Row = ({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) => (
    <div className={`flex items-baseline justify-between py-1 ${strong ? 'text-lg font-bold text-green' : ''}`}>
      <span>{k}</span>
      <span className="num">{v}</span>
    </div>
  )
  return (
    <Sheet title={`تأكيد الدفع — ${label}`} onClose={onBack}>
      <ul className="mb-3 max-h-48 divide-y divide-cream-200 overflow-y-auto rounded-xl bg-white/70 px-3 ring-1 ring-cream-200">
        {lines.map((l) => (
          <li key={l.id} className="flex items-baseline gap-2 py-1.5 text-sm">
            <span className="num w-7 text-ink/60">{l.qty}×</span>
            <span className="flex-1">
              {l.nameSnapshot}
              {l.options.length > 0 && <span className="text-ink/50"> · {optionsLabel(l.options)}</span>}
            </span>
            <span className="num">{formatJod(l.qty * l.priceSnapshot)}</span>
          </li>
        ))}
      </ul>
      <div className="divide-y divide-cream-200">
        <Row k="المجموع" v={formatJod(subtotal)} />
        {!!order.loyaltyDiscount && <Row k="خصم ولاء" v={`−${formatJod(order.loyaltyDiscount)}`} />}
        {order.manualDiscount && <Row k={`خصم (${order.manualDiscount.reason})`} v={`−${formatJod(order.manualDiscount.amount)}`} />}
        {paid > 0 && <Row k="مدفوع قبل" v={`−${formatJod(paid)}`} />}
        <Row k="المطلوب دفعه هلق" v={formatJod(value)} strong />
        {after > 0 && <Row k="بيضل بعدها" v={formatJod(after)} />}
      </div>
      <div className={`mt-3 rounded-xl px-4 py-3 text-center text-lg font-bold ${method === 'cash' ? 'bg-green text-cream' : cliq?.isStaff ? 'bg-red-800 text-cream' : 'bg-gold text-green'}`}>
        {METHOD_LABEL[method]}
        {method === 'cliq' && cliq && <> — على حساب {cliq.name}{cliq.isStaff ? ' (الموظف، لازم يتسلّم)' : ''}</>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onBack} className="h-16 rounded-2xl bg-cream-200 text-lg font-bold text-green active:bg-green-100">
          رجوع
        </button>
        <button type="button" onClick={onConfirm} className="h-16 rounded-2xl bg-gold text-xl font-bold text-green active:bg-gold-600">
          تأكيد
        </button>
      </div>
    </Sheet>
  )
}
