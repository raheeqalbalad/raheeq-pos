import { useState } from 'react'
import type { Order, PaymentMethod } from '../db/types'
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
  subtotal,
  total,
  paid,
  onPaidFull,
  onClose,
}: {
  orderId: number
  order: Order | undefined
  /** مجموع الأصناف قبل خصم الولاء */
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

  const amount = toFils(amountText || 0)
  const amountValid = amount > 0 && amount <= remaining
  // حاسبة الباقي: على مبلغ التقسيم إذا مكتوب، وإلا على كل الباقي
  const due = amountValid ? amount : remaining
  const given = toFils(givenText || 0)
  const change = given - due

  async function pay(method: PaymentMethod, value: number) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const done = await addPayment(orderId, method, value, user!.id!)
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
    </Sheet>
  )
}
