import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { CafeTable, Order } from '../db/types'
import { orderDue } from '../lib/orders'
import { formatJod } from '../lib/money'
import { guestsTotal } from '../components/GuestsSheet'
import CoalSheet, { useNow } from '../components/CoalSheet'
import { coalDue, getFloorSettings, lastAddedOf } from '../lib/floor'

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
    return orders.map((o) => ({ order: o, total: orderDue(lines.filter((l) => l.orderId === o.id), o) }))
  }, [])

  const settings = useLiveQuery(getFloorSettings, [])
  const now = useNow()
  const [coalFor, setCoalFor] = useState<number | null>(null)
  const dueCoals = (o: Order) => (settings ? (o.coals ?? []).filter((t) => coalDue(t, settings, now)).length : 0)
  const idleMinutes = (o: Order) => Math.floor((now - lastAddedOf(o)) / 60000)
  const isIdle = (o: Order) => !!settings && idleMinutes(o) >= settings.idleMinutes

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
                  const coals = o ? dueCoals(o.order) : 0
                  const idle = o ? isIdle(o.order) : false
                  return (
                    <div key={t.id} className="relative">
                      <button
                        type="button"
                        onClick={() => onOpen({ kind: 'table', table: t, orderId: o?.order.id })}
                        className={`flex h-28 w-full flex-col items-center justify-center rounded-2xl text-center shadow-sm transition-transform active:scale-[0.97] ${
                          !o
                            ? 'bg-white/70 text-green ring-1 ring-cream-200'
                            : coals
                              ? 'bg-red-800 text-cream'
                              : idle
                                ? 'bg-gold text-green'
                                : 'bg-green text-cream'
                        }`}
                      >
                        <span className="font-bold">{t.name}</span>
                        {o ? (
                          <>
                            <span className={`num font-display text-lg ${idle && !coals ? 'text-green' : 'text-gold'}`}>{formatJod(o.total)}</span>
                            <span className="text-xs opacity-70">
                              {minutesSince(o.order.openedAt, now)}
                              {guestsTotal(o.order.guests) > 0 && (
                                <>
                                  {' · '}👥 <span className="num">{guestsTotal(o.order.guests)}</span>
                                </>
                              )}
                            </span>
                            {idle && (
                              <span className="text-xs font-bold">
                                آخر طلب قبل {minutesSince(lastAddedOf(o.order), now)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-ink/40">فاضية</span>
                        )}
                      </button>
                      {o && coals > 0 && (
                        <button
                          type="button"
                          onClick={() => setCoalFor(o.order.id!)}
                          aria-label={`الفحم على ${t.name}`}
                          className="absolute -top-2 -left-2 flex h-11 min-w-11 animate-pulse items-center justify-center gap-0.5 rounded-full bg-gold px-2 text-lg font-bold text-green shadow-md ring-2 ring-red-800"
                        >
                          🔥{coals > 1 && <span className="num text-sm">{coals}</span>}
                        </button>
                      )}
                    </div>
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
      {coalFor !== null && <CoalSheet orderId={coalFor} onClose={() => setCoalFor(null)} />}
    </main>
  )
}
