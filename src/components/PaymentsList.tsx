import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { PaymentMethod } from '../db/types'
import { correctPayment } from '../lib/orders'
import { formatJod } from '../lib/money'
import { useOwnerGate } from '../lib/useOwnerGate'
import { timeLabelOf as timeLabel } from '../lib/time'

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'كاش', cliq: 'كليك' }

export { timeLabelOf as timeLabel } from '../lib/time'

/** دفعات الطلب، مع «تصحيح الدفعة» (كاش ↔ كليك) برمز المالك. */
export default function PaymentsList({ orderId }: { orderId: number }) {
  const { requireOwner, sheet } = useOwnerGate()
  const data = useLiveQuery(async () => {
    const [payments, corrections, users] = await Promise.all([
      db.payments.where('orderId').equals(orderId).sortBy('createdAt'),
      db.paymentCorrections.where('orderId').equals(orderId).sortBy('at'),
      db.users.toArray(),
    ])
    return { payments, corrections, names: new Map(users.map((u) => [u.id!, u.name])) }
  }, [orderId])

  if (!data?.payments.length) return null
  const { payments, corrections, names } = data

  return (
    <div className="flex flex-col gap-2">
      {payments.map((p) => {
        const fixes = corrections.filter((c) => c.paymentId === p.id)
        const other = METHOD_LABEL[p.method === 'cash' ? 'cliq' : 'cash']
        return (
          <div key={p.id} className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-cream-200">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-lg px-2 py-1 text-sm font-bold ${
                  p.method === 'cash' ? 'bg-green text-cream' : 'bg-gold text-green'
                }`}
              >
                {METHOD_LABEL[p.method]}
              </span>
              <span className="num font-display text-lg text-green">{formatJod(p.amount)}</span>
              <span className="flex-1 text-xs text-ink/50">
                <span className="num">{timeLabel(p.createdAt)}</span> · {names.get(p.staffId)}
              </span>
              <button
                type="button"
                onClick={() =>
                  requireOwner(
                    'تصحيح الدفعة',
                    (ownerId) => correctPayment(p, ownerId),
                    <>
                      تحويل <span className="num">{formatJod(p.amount)}</span> من {METHOD_LABEL[p.method]} لـ {other}
                    </>,
                  )
                }
                className="h-12 shrink-0 rounded-xl bg-cream-200 px-3 text-sm font-medium text-green active:bg-green-100"
              >
                ← {other}
              </button>
            </div>
            {fixes.map((c) => (
              <div key={c.id} className="mt-1 text-xs text-ink/60">
                صحّحها {names.get(c.byUserId)} من {METHOD_LABEL[c.from]} لـ {METHOD_LABEL[c.to]} ·{' '}
                <span className="num">{timeLabel(c.at)}</span>
              </div>
            ))}
          </div>
        )
      })}
      {sheet}
    </div>
  )
}
