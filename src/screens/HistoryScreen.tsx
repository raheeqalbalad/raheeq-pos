import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Order, Shift } from '../db/types'
import { linesTotal, optionsLabel } from '../lib/orders'
import { formatJod } from '../lib/money'
import PaymentsList, { METHOD_LABEL, timeLabel } from '../components/PaymentsList'
import Sheet from '../components/Sheet'

/** الطلبات اللي تسكّرت بالشيفت الحالي — منها بتصحّح الدفعات بعد الدفع. */
export default function HistoryScreen({ shift }: { shift: Shift }) {
  const [selected, setSelected] = useState<Order | null>(null)
  const rows = useLiveQuery(async () => {
    const orders = (await db.orders.where('closedAt').aboveOrEqual(shift.openedAt).toArray()).reverse()
    const ids = orders.map((o) => o.id!)
    const [lines, payments] = await Promise.all([
      db.orderLines.where('orderId').anyOf(ids).toArray(),
      db.payments.where('orderId').anyOf(ids).toArray(),
    ])
    return orders.map((o) => ({
      order: o,
      total: linesTotal(lines.filter((l) => l.orderId === o.id)),
      methods: [...new Set(payments.filter((p) => p.orderId === o.id).map((p) => METHOD_LABEL[p.method]))],
    }))
  }, [shift.openedAt])

  return (
    <main className="flex-1 overflow-y-auto p-4">
      {rows?.length === 0 && <p className="p-8 text-center text-ink/50">لسا ما في طلبات متسكّرة بهالشيفت</p>}
      <ul className="flex flex-col gap-2">
        {rows?.map(({ order, total, methods }) => (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => setSelected(order)}
              className={`flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white/70 px-4 py-2 text-start ring-1 ring-cream-200 active:bg-gold/30 ${
                order.status === 'void' ? 'opacity-60' : ''
              }`}
            >
              <span className="num w-14 text-sm text-ink/50">{timeLabel(order.closedAt!)}</span>
              <span className="flex-1 font-bold text-green">{order.label}</span>
              {order.status === 'void' ? (
                <span className="rounded-lg bg-red-800 px-2 py-1 text-xs font-bold text-cream">ملغي</span>
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
      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}

function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  const lines = useLiveQuery(() => db.orderLines.where('orderId').equals(order.id!).sortBy('createdAt'), [order.id])
  return (
    <Sheet title={order.label} onClose={onClose}>
      <ul className="mb-4 divide-y divide-cream-200">
        {lines?.map((l) => (
          <li key={l.id} className="flex items-baseline gap-3 py-2">
            <span className="num w-6 text-ink/60">{l.qty}×</span>
            <span className="flex-1">
              <span className="font-bold text-green">{l.nameSnapshot}</span>
              {(l.options.length > 0 || l.note) && (
                <span className="text-sm text-ink/60"> · {[optionsLabel(l.options), l.note].filter(Boolean).join(' · ')}</span>
              )}
            </span>
            <span className="num">{formatJod(l.priceSnapshot * l.qty)}</span>
          </li>
        ))}
      </ul>
      {order.status === 'void' ? (
        <p className="rounded-xl bg-red-800/10 p-3 text-center text-red-900">الطلب ملغي، ودفعاته ما بتنحسب</p>
      ) : (
        <>
          <h3 className="mb-2 font-bold text-green">الدفعات</h3>
          <PaymentsList orderId={order.id!} />
        </>
      )}
    </Sheet>
  )
}
