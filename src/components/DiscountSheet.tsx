import { useState } from 'react'
import type { Order } from '../db/types'
import { applyManualDiscount, DISCOUNT_REASONS, FINAL_AMOUNT_REASON, NO_REASON, pctAmount, removeManualDiscount } from '../lib/discounts'
import { formatJod, toFils } from '../lib/money'
import { useSession } from '../lib/session'
import MoneyInput from './MoneyInput'
import Sheet from './Sheet'

const QUICK = [10, 20, 50]
const OTHER = 'غيره'

/**
 * خصم يدوي: نسبة سريعة أو نسبة تانية أو مبلغ ثابت، والسبب اختياري.
 * بيمشي بدون رمز المالك، وبينسجّل مين عطاه ولمين وقديش ومتى.
 */
export default function DiscountSheet({ order, subtotal, onClose }: { order: Order; subtotal: number; onClose: () => void }) {
  const { user } = useSession()
  const existing = order.manualDiscount
  const [mode, setMode] = useState<'pct' | 'amount'>(existing && !existing.pct ? 'amount' : 'pct')
  const [pct, setPct] = useState(existing?.pct ? String(existing.pct) : '')
  const [amountText, setAmountText] = useState(existing && !existing.pct ? formatJod(existing.amount) : '')
  const auto = !existing || existing.reason === NO_REASON || existing.reason === FINAL_AMOUNT_REASON
  const initialReason = auto ? '' : DISCOUNT_REASONS.includes(existing.reason) ? existing.reason : OTHER
  const [reason, setReason] = useState(initialReason)
  const [otherText, setOtherText] = useState(existing && initialReason === OTHER ? existing.reason : '')
  const [error, setError] = useState('')

  const pctNum = Number(pct) || 0
  const amount = mode === 'pct' ? pctAmount(subtotal, pctNum) : toFils(amountText || 0)
  const otherDiscounts = order.loyaltyDiscount ?? 0
  const due = Math.max(0, subtotal - otherDiscounts - amount)
  const finalReason = (reason === OTHER ? otherText.trim() : reason) || NO_REASON

  async function submit() {
    if (!(amount > 0)) return setError('اختار نسبة أو اكتب مبلغ')
    if (amount > subtotal) return setError('الخصم أكبر من الفاتورة')
    setError('')
    try {
      await applyManualDiscount(order.id!, { amount, ...(mode === 'pct' ? { pct: pctNum } : {}), reason: finalReason }, user!.id!)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
    }
  }

  const chip = (on: boolean) => `h-12 rounded-xl px-4 font-medium ${on ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'}`

  return (
    <Sheet title="خصم" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode('pct')} className={chip(mode === 'pct')}>
            نسبة %
          </button>
          <button type="button" onClick={() => setMode('amount')} className={chip(mode === 'amount')}>
            مبلغ ثابت
          </button>
        </div>

        {mode === 'pct' ? (
          <div className="flex flex-wrap items-center gap-2">
            {QUICK.map((p) => (
              <button key={p} type="button" onClick={() => setPct(String(p))} className={`num ${chip(pctNum === p)}`}>
                {p}%
              </button>
            ))}
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              placeholder="نسبة تانية"
              className="num h-12 w-32 rounded-xl bg-white px-3 text-center text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
            />
          </div>
        ) : (
          <MoneyInput value={amountText} onChange={setAmountText} placeholder="المبلغ بالدينار" />
        )}

        <div>
          <span className="mb-1 block font-bold text-green">
            السبب <span className="text-sm font-normal text-ink/50">(اختياري)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {[...DISCOUNT_REASONS, OTHER].map((r) => (
              <button key={r} type="button" onClick={() => setReason(reason === r ? '' : r)} className={chip(reason === r)}>
                {r}
              </button>
            ))}
          </div>
          {reason === OTHER && (
            <input
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="اكتب السبب"
              className="mt-2 h-12 w-full rounded-xl bg-white px-3 ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
            />
          )}
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/70 p-3">
            <dt className="text-xs text-ink/60">المجموع</dt>
            <dd className="num font-display text-xl text-green">{formatJod(subtotal)}</dd>
          </div>
          <div className="rounded-xl bg-white/70 p-3">
            <dt className="text-xs text-ink/60">الخصم</dt>
            <dd className="num font-display text-xl text-green">−{formatJod(amount)}</dd>
          </div>
          <div className="rounded-xl bg-green p-3 text-cream">
            <dt className="text-xs opacity-70">المطلوب</dt>
            <dd className="num font-display text-xl text-gold">{formatJod(due)}</dd>
          </div>
        </dl>
        {otherDiscounts > 0 && (
          <p className="-mt-2 text-xs text-ink/60">
            المطلوب بعد خصم الولاء كمان (<span className="num">{formatJod(otherDiscounts)}</span>)
          </p>
        )}

        {error && <p className="text-center font-bold text-red-700">{error}</p>}
        <div className="flex gap-3">
          {existing && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await removeManualDiscount(order.id!, user!.id!)
                  onClose()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'ما زبط')
                }
              }}
              className="h-14 shrink-0 rounded-2xl px-4 font-medium text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
            >
              شيل الخصم
            </button>
          )}
          <button type="button" onClick={submit} className="h-14 flex-1 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
            طبّق الخصم
          </button>
        </div>
      </div>
    </Sheet>
  )
}
