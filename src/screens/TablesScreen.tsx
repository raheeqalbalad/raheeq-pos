import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { CafeTable, Order } from '../db/types'
import { linesTotal } from '../lib/orders'
import { formatJod } from '../lib/money'

export type OpenRequest =
  | { kind: 'table'; table: CafeTable; orderId?: number }
  | { kind: 'takeaway'; orderId?: number; label?: string }

function minutesSince(ts: number, now: number) {
  const m = Math.max(0, Math.floor((now - ts) / 60000))
  return m < 60 ? `${m} د` : `${Math.floor(m / 60)}س ${m % 60}د`
}

export default function TablesScreen({ onOpen, message }: { onOpen: (r: OpenRequest) => void; message?: string }) {
  const tables = useLiveQuery(() => db.cafeTables.orderBy('sort').toArray(), [])
  const open = useLiveQuery(async () => {
    const orders = await db.orders.where('status').equals('open').toArray()
    const lines = await db.orderLines.where('orderId').anyOf(orders.map((o) => o.id!)).toArray()
    return orders.map((o) => ({ order: o, total: linesTotal(lines.filter((l) => l.orderId === o.id)) }))
  }, [])

  // تحديث الوقت كل دقيقة
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const byTable = new Map<number, { order: Order; total: number }>()
  for (const o of open ?? []) if (o.order.tableId) byTable.set(o.order.tableId, o)
  const takeaways = (open ?? []).filter((o) => o.order.takeaway).sort((a, b) => a.order.openedAt - b.order.openedAt)

  const areas = [
    { key: 'balcony', name: 'البلكونة' },
    { key: 'inside', name: 'جوا' },
  ] as const

  return (
    <main className="flex-1 overflow-y-auto p-4">
        {message && (
          <div className="mb-4 rounded-2xl bg-green px-5 py-3 text-center font-bold text-gold">{message}</div>
        )}

        {areas.map((area) => (
          <section key={area.key} className="mb-6">
            <h2 className="mb-3 font-display text-xl text-green">{area.name}</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {tables
                ?.filter((t) => t.area === area.key)
                .map((t) => {
                  const o = byTable.get(t.id!)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpen({ kind: 'table', table: t, orderId: o?.order.id })}
                      className={`flex h-24 flex-col items-center justify-center rounded-2xl text-center shadow-sm transition-transform active:scale-[0.97] ${
                        o ? 'bg-green text-cream' : 'bg-white/70 text-green ring-1 ring-cream-200'
                      }`}
                    >
                      <span className="font-bold">{t.name}</span>
                      {o ? (
                        <>
                          <span className="num font-display text-lg text-gold">{formatJod(o.total)}</span>
                          <span className="text-xs opacity-70">{minutesSince(o.order.openedAt, now)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-ink/40">فاضية</span>
                      )}
                    </button>
                  )
                })}
            </div>
          </section>
        ))}

        <section>
          <h2 className="mb-3 font-display text-xl text-green">تيك أواي</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <button
              type="button"
              onClick={() => onOpen({ kind: 'takeaway' })}
              className="flex h-24 flex-col items-center justify-center rounded-2xl bg-gold font-bold text-green shadow-sm active:scale-[0.97]"
            >
              <span className="text-2xl">+</span>
              <span>طلب جديد</span>
            </button>
            {takeaways.map(({ order, total }) => (
              <button
                key={order.id}
                type="button"
                onClick={() => onOpen({ kind: 'takeaway', orderId: order.id, label: order.label })}
                className="flex h-24 flex-col items-center justify-center rounded-2xl bg-green text-cream shadow-sm active:scale-[0.97]"
              >
                <span className="font-bold">{order.label}</span>
                <span className="num font-display text-lg text-gold">{formatJod(total)}</span>
                <span className="text-xs opacity-70">{minutesSince(order.openedAt, now)}</span>
              </button>
            ))}
          </div>
        </section>
    </main>
  )
}
