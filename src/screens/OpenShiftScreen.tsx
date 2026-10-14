import { useEffect, useState } from 'react'
import { lastClosedShift, leftInDrawerOf, openShift } from '../lib/shift'
import { formatJod, toFils } from '../lib/money'
import { useSession } from '../lib/session'
import Header from '../components/Header'
import MoneyInput from '../components/MoneyInput'

/** ما في شيفت مفتوح: لازم ينفتح قبل البيع، مع كاش البداية بالدرج. */
export default function OpenShiftScreen({ onReports }: { onReports?: () => void }) {
  const { user } = useSession()
  const [cash, setCash] = useState('')
  const [lastLeft, setLastLeft] = useState<number>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    lastClosedShift().then((s) => {
      const left = s && leftInDrawerOf(s)
      if (left !== undefined) {
        setLastLeft(left)
        setCash(formatJod(left))
      }
    })
  }, [])

  async function open() {
    setBusy(true)
    await openShift(user!.id!, toFils(cash || 0))
    // الشاشة بتتبدّل لحالها لما الشيفت ينفتح (useLiveQuery بالـ App)
  }

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white/70 p-6 shadow-sm ring-1 ring-cream-200">
          <h1 className="mb-1 font-display text-2xl text-green">فتح الشيفت</h1>
          <p className="mb-5 text-ink/60">قديش في كاش بالدرج هلق؟</p>
          <MoneyInput value={cash} onChange={setCash} autoFocus />
          {lastLeft !== undefined && (
            <p className="mt-2 text-sm text-ink/50">
              الشيفت اللي قبل ترك بالدرج <span className="num">{formatJod(lastLeft)}</span>
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={open}
            className="mt-5 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-50"
          >
            افتح الشيفت
          </button>
          {onReports && (
            <button
              type="button"
              onClick={onReports}
              className="mt-3 h-12 w-full rounded-2xl text-green ring-1 ring-green/20 active:bg-cream-200"
            >
              شوف التقارير بدون ما تفتح شيفت
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
