import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { changeCoal, coalDue, coalMinutesOf, getFloorSettings } from '../lib/floor'
import Sheet from './Sheet'

/** الوقت هلق، بيتحدّث كل نص دقيقة */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** أراجيل الطلب ومؤقت فحم كل وحدة، مع «غيّرت الفحم». */
export default function CoalSheet({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const order = useLiveQuery(() => db.orders.get(orderId), [orderId])
  const settings = useLiveQuery(getFloorSettings, [])
  const now = useNow(15_000)
  if (!order || !settings) return null
  const coals = order.coals ?? []

  return (
    <Sheet title={`فحم ${order.label}`} onClose={onClose}>
      {!coals.length && <p className="text-center text-ink/50">ما في أراجيل على هالطلب</p>}
      <ul className="flex flex-col gap-2">
        {coals.map((t, i) => {
          const due = coalDue(t, settings, now)
          return (
            <li
              key={t.id}
              className={`flex items-center gap-3 rounded-2xl p-3 ${due ? 'bg-red-800/15 ring-2 ring-red-800/40' : 'bg-white/70 ring-1 ring-cream-200'}`}
            >
              <span className="text-2xl" aria-hidden>
                {due ? '🔥' : '💨'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-green">
                  أرجيلة <span className="num">{i + 1}</span> · {t.label}
                </span>
                <span className={`text-sm ${due ? 'font-bold text-red-900' : 'text-ink/60'}`}>
                  {t.changes ? 'آخر فحم' : 'انضافت'} قبل <span className="num">{coalMinutesOf(t, now)}</span> د
                  {due && ' — لازم يتغيّر'}
                  {t.changes > 0 && (
                    <span className="font-normal text-ink/50">
                      {' '}
                      · تغيّر {t.changes === 1 ? 'مرة' : <><span className="num">{t.changes}</span> مرات</>}
                    </span>
                  )}
                </span>
              </span>
              <button
                type="button"
                onClick={() => changeCoal(orderId, t.id)}
                className={`h-14 shrink-0 rounded-xl px-4 font-bold ${due ? 'bg-gold text-green active:bg-gold-600' : 'bg-cream-200 text-green active:bg-green-100'}`}
              >
                غيّرت الفحم
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-ink/50">
        الفحم بيتغيّر كل <span className="num">{settings.coalMinutes}</span> دقيقة (من «الإعدادات»). «تغيير راس» بيصفّر الأرجيلة الأقدم لحاله.
      </p>
    </Sheet>
  )
}
