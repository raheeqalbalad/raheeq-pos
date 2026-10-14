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
import { applyManualDiscount, FINAL_AMOUNT_REASON } from '../lib/discounts'
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
  // المبلغ اللي بيدفعه الزبون: أقل من الباقي = خصم، أكثر (كاش) = رجّع له
  const [finalText, setFinalText] = useState('')
  const [amountText, setAmountText] = useState('')
  const [splitOpen, setSplitOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // الكليك على حساب مين (التلقائي من إعدادات المالك)
  const cliq = useLiveQuery(async () => cliqChoices(await getOpenShift()), [])
  const [cliqKey, setCliqKey] = useState<string>()
  const cliqChoice = cliq?.choices.find((c) => c.key === (cliqKey ?? cliq.defaultKey))
  // كل دفعة بتمرق على شاشة تأكيد قبل ما تنسجّل
  const [confirming, setConfirming] = useState<Pending | null>(null)
  const [discounting, setDiscounting] = useState(false)

  const final = toFils(finalText || 0)
  const typed = finalText !== '' && final > 0
  const discount = typed && final < remaining ? remaining - final : 0
  const change = typed && final > remaining ? final - remaining : 0
  const payValue = typed ? Math.min(final, remaining) : remaining
  const pct = discount && remaining ? (discount / remaining) * 100 : 0

  const amount = toFils(amountText || 0)
  const amountValid = amount > 0 && amount <= remaining

  async function confirmPay({ method, value, discount }: Pending) {
    if (busy) return
    setConfirming(null)
    setBusy(true)
    setError('')
    try {
      // الخصم بالمبلغ النهائي بينسجّل كخصم يدوي (فوق أي خصم يدوي قبله) قبل الدفعة
      if (discount > 0)
        await applyManualDiscount(orderId, { amount: (order?.manualDiscount?.amount ?? 0) + discount, reason: FINAL_AMOUNT_REASON }, user!.id!)
      const done = await addPayment(orderId, method, value, user!.id!, cliqChoice && { key: cliqChoice.key, name: cliqChoice.name })
      setFinalText('')
      setAmountText('')
      if (done) onPaidFull()
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'ما في شيفت مفتوح'
          ? 'لازم تفتح شيفت أول'
          : e instanceof Error && e.message.includes('الخصم')
            ? e.message
            : 'ما انسجلت الدفعة، جرّب كمان مرة',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="الدفع" onClose={onClose}>
      <div className="flex flex-col gap-4">
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
            <dt className="text-xs opacity-70">الحساب</dt>
            <dd className="num font-display text-xl text-gold">{formatJod(remaining)}</dd>
          </div>
        </dl>

        {/* المبلغ اللي بيدفعه الزبون: الأساس */}
        <section className="rounded-2xl bg-white/70 p-4 ring-2 ring-gold">
          <label htmlFor="final-amount" className="mb-2 block text-lg font-bold text-green">
            المبلغ اللي بيدفعه الزبون
          </label>
          <div className="flex gap-2">
            <input
              id="final-amount"
              inputMode="decimal"
              placeholder={formatJod(remaining)}
              value={finalText}
              onChange={(e) => setFinalText(e.target.value.replace(/[^\d.]/g, ''))}
              className="num h-16 min-w-0 flex-1 rounded-xl bg-white px-4 text-3xl ring-1 ring-cream-200 outline-none placeholder:text-ink/30 focus:ring-2 focus:ring-green"
            />
            {order && paid === 0 && (
              <button
                type="button"
                onClick={() => setDiscounting(true)}
                className="h-16 shrink-0 rounded-xl px-4 font-bold text-green ring-1 ring-green/30 active:bg-cream-200"
              >
                خصم ٪
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {BILLS.filter((b) => b * 1000 >= remaining).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setFinalText(String(b))}
                className={`num h-11 min-w-12 rounded-xl px-3 font-bold ${final === b * 1000 ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'}`}
              >
                {b}
              </button>
            ))}
            {finalText && (
              <button type="button" onClick={() => setFinalText('')} className="h-11 rounded-xl px-3 text-sm text-ink/60 active:bg-cream-200">
                امسح
              </button>
            )}
          </div>
          {discount > 0 && (
            <p className="mt-3 flex items-baseline justify-between rounded-xl bg-gold/40 px-4 py-2 font-bold text-green">
              <span>
                خصم <span className="num">{formatJod(discount)}</span> (<span className="num">{pct.toFixed(1)}%</span>)
              </span>
              <span className="text-sm font-normal">بينسجّل باسمك</span>
            </p>
          )}
          {change > 0 && (
            <p className="mt-3 flex items-baseline justify-between rounded-xl bg-green px-4 py-2 text-cream">
              <span className="font-bold">رجّع للزبون (كاش)</span>
              <span className="num font-display text-2xl text-gold">{formatJod(change)}</span>
            </p>
          )}
          {order?.manualDiscount && discount === 0 && (
            <p className="mt-2 text-sm text-ink/60">
              عليه خصم <span className="num">{formatJod(order.manualDiscount.amount)}</span> ({order.manualDiscount.reason})
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          {(['cash', 'cliq'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy || (m === 'cliq' && change > 0)}
              onClick={() => {
                setError('')
                setConfirming({ method: m, value: payValue, discount, change: m === 'cash' ? change : 0 })
              }}
              className="flex h-20 flex-col items-center justify-center rounded-2xl bg-gold font-bold text-green active:bg-gold-600 disabled:opacity-40"
            >
              <span className="text-xl">{METHOD_LABEL[m]}</span>
              <span className="num">{formatJod(payValue)}</span>
            </button>
          ))}
        </div>

        {cliq && cliq.choices.length > 0 && (
          <div className="-mt-1">
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
              <p className="mt-1 text-sm font-bold text-red-800">الكليك على حساب الموظف: بتسكير الشيفت بيحط مقابله كاش بالدرج أو بيحوّله لصاحب المحل</p>
            )}
          </div>
        )}

        {error && <p className="text-center font-bold text-red-700">{error}</p>}

        {order && <CustomerBox order={order} subtotal={subtotal} paid={paid} />}

        {splitOpen ? (
          <section className="rounded-2xl border border-cream-200 p-4">
            <h3 className="mb-3 font-bold text-green">تقسيم الفاتورة (كل واحد بيدفع جزء)</h3>
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
            {amountText && !amountValid && <p className="mt-2 text-sm text-red-700">المبلغ لازم يكون أكبر من صفر ومش أكثر من الحساب</p>}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(['cash', 'cliq'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!amountValid || busy}
                  onClick={() => setConfirming({ method: m, value: amount, discount: 0, change: 0 })}
                  className="h-14 rounded-xl bg-green font-bold text-cream active:bg-green-700 disabled:opacity-30"
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setSplitOpen(true)}
            className="h-12 rounded-xl text-sm text-green ring-1 ring-green/20 active:bg-cream-200"
          >
            تقسيم الفاتورة على أكثر من دفعة
          </button>
        )}
      </div>
      {confirming && order && (
        <ConfirmPay
          label={label}
          lines={lines}
          order={order}
          subtotal={subtotal}
          total={total}
          paid={paid}
          pending={confirming}
          cliq={confirming.method === 'cliq' ? cliqChoice : undefined}
          onBack={() => setConfirming(null)}
          onConfirm={() => confirmPay(confirming)}
        />
      )}
      {discounting && order && <DiscountSheet order={order} subtotal={subtotal} onClose={() => setDiscounting(false)} />}
    </Sheet>
  )
}

interface Pending {
  method: PaymentMethod
  /** المبلغ اللي بينسجّل كدفعة */
  value: number
  /** خصم بالمبلغ النهائي (بينسجّل مع الدفعة) */
  discount: number
  /** الباقي للزبون (كاش) */
  change: number
}

/** تأكيد الدفعة: كل التفاصيل قبل ما تنسجّل، بزرين كبار. */
function ConfirmPay({
  label,
  lines,
  order,
  subtotal,
  total,
  paid,
  pending: { method, value, discount, change },
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
  pending: Pending
  cliq?: CliqChoice
  onBack: () => void
  onConfirm: () => void
}) {
  const after = total - discount - paid - value
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
        {discount > 0 && <Row k={`خصم ${FINAL_AMOUNT_REASON}`} v={`−${formatJod(discount)}`} />}
        <Row k="المطلوب دفعه هلق" v={formatJod(value)} strong />
        {after > 0 && <Row k="بيضل بعدها" v={formatJod(after)} />}
      </div>
      {change > 0 && (
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-cream-200 px-4 py-2 font-bold text-green">
          <span>
            الزبون عطى <span className="num">{formatJod(value + change)}</span> · رجّع له
          </span>
          <span className="num font-display text-2xl">{formatJod(change)}</span>
        </div>
      )}
      <div className={`mt-3 rounded-xl px-4 py-3 text-center text-lg font-bold ${method === 'cash' ? 'bg-green text-cream' : cliq?.isStaff ? 'bg-red-800 text-cream' : 'bg-gold text-green'}`}>
        {METHOD_LABEL[method]}
        {method === 'cliq' && cliq && <> — على حساب {cliq.name}{cliq.isStaff ? ' (الموظف)' : ''}</>}
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
