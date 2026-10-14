import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Order } from '../db/types'
import {
  applyLoyaltyDiscount,
  attachCustomer,
  findCustomer,
  loyaltyDiscountFor,
  loyaltyStatus,
  normalizePhone,
  removeLoyaltyDiscount,
  saveCustomer,
} from '../lib/customers'
import { formatJod } from '../lib/money'

const inputClass = 'h-12 min-w-0 rounded-xl bg-white px-3 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

/** الزبون وكرت الولاء بشاشة الدفع (اختياري). */
export default function CustomerBox({ order, subtotal, paid }: { order: Order; subtotal: number; paid: number }) {
  const customer = useLiveQuery(() => (order.customerId ? db.customers.get(order.customerId) : undefined), [order.customerId])
  const status = useLiveQuery(
    () => (order.customerId ? loyaltyStatus(order.customerId, order.id) : undefined),
    [order.customerId, order.id, order.loyaltyDiscount],
  )
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
    }
  }

  /** بيدوّر على الرقم: إذا موجود بيربطه (وبيكمّل اسمه إذا ناقص)، وإذا جديد بيسجّله. */
  async function register() {
    const p = normalizePhone(phone)
    if (!p) return setError('اكتب رقم موبايل أردني (07...)')
    const found = await findCustomer(p)
    let id = found?.id
    if (found) {
      if (name.trim() && !found.name) await saveCustomer({ ...found, name })
    } else {
      id = await saveCustomer({ phone, name, marketingOptIn: optIn })
    }
    await attachCustomer(order.id!, id)
    setPhone('')
    setName('')
    setOptIn(false)
  }

  // زبون مربوط بالطلب
  if (order.customerId && customer) {
    const s = status?.settings
    const discount = order.loyaltyDiscount ?? 0
    return (
      <section className="rounded-2xl border border-cream-200 p-3">
        <div className="flex items-center gap-2">
          <span className="flex-1">
            <span className="font-bold text-green">{customer.name || 'زبون'}</span>{' '}
            <span className="num text-sm text-ink/60">{customer.phone}</span>
          </span>
          {paid === 0 && (
            <button
              type="button"
              onClick={() => run(() => attachCustomer(order.id!, undefined))}
              className="h-10 rounded-xl px-3 text-sm text-ink/60 ring-1 ring-cream-200 active:bg-cream-200"
            >
              شيل الزبون
            </button>
          )}
        </div>

        {s?.enabled &&
          (discount > 0 ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-green px-3 py-2 text-cream">
              <span>
                خصم ولاء <span className="num font-bold text-gold">−{formatJod(discount)}</span> ✓
              </span>
              {paid === 0 && (
                <button type="button" onClick={() => run(() => removeLoyaltyDiscount(order.id!))} className="h-10 rounded-lg px-3 text-sm ring-1 ring-cream/30">
                  شيل الخصم
                </button>
              )}
            </div>
          ) : status?.eligible ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gold px-3 py-2 text-green">
              <span className="font-bold">
                🎉 مستحق خصم ولاء {s.discountPct}% (<span className="num">−{formatJod(loyaltyDiscountFor(subtotal, s))}</span>)
              </span>
              <button
                type="button"
                onClick={() => run(() => applyLoyaltyDiscount(order.id!))}
                className="h-12 rounded-xl bg-green px-4 font-bold text-cream active:bg-green-700"
              >
                طبّق الخصم
              </button>
            </div>
          ) : (
            status && (
              <p className="mt-2 text-sm text-ink/60">
                كرت الولاء: <span className="num font-bold text-green">{status.progress}</span> من{' '}
                <span className="num">{s.visitsNeeded}</span> زيارات
                {subtotal < s.minOrder && (
                  <>
                    {' '}
                    · الطلب أقل من <span className="num">{formatJod(s.minOrder)}</span> فما بينحسب زيارة
                  </>
                )}
              </p>
            )
          ))}
        {error && <p className="mt-2 text-sm font-bold text-red-700">{error}</p>}
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-cream-200 p-3">
      <h3 className="mb-2 font-bold text-green">
        الزبون <span className="text-sm font-normal text-ink/50">(اختياري، لكرت الولاء)</span>
      </h3>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))}
          inputMode="tel"
          placeholder="رقم التلفون 07..."
          className={`${inputClass} num`}
        />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الزبون (اختياري)" className={inputClass} />
        <button
          type="button"
          disabled={!phone}
          onClick={() => run(register)}
          className="h-12 shrink-0 rounded-xl bg-green px-4 font-bold text-cream active:bg-green-700 disabled:opacity-30"
        >
          سجّل
        </button>
      </div>
      {phone && (
        <label className="mt-2 flex h-10 items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="size-5 accent-green" />
          موافق ينبعتله عروض (للزبون الجديد)
        </label>
      )}
      {error && <p className="mt-2 text-sm font-bold text-red-700">{error}</p>}
    </section>
  )
}
