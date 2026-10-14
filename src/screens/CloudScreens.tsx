import { useEffect, useState } from 'react'
import { deviceMode, type DeviceMode } from '../lib/cloud/device'
import { lastPullAt, linkViewer, refreshViewer, signOutViewer } from '../lib/cloud/pull'
import { cloudError } from '../lib/cloud/client'
import { timeLabelOf } from '../lib/time'
import Logo from '../components/Logo'
import ReportsScreen from './ReportsScreen'

const inputClass = 'h-14 w-full rounded-xl bg-white px-4 text-lg text-ink ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

/** وضع الجهاز (بيتحدّث لما يتغيّر) */
export function useDeviceMode(): DeviceMode | null {
  const [mode, setMode] = useState(deviceMode)
  useEffect(() => {
    const update = () => setMode(deviceMode())
    window.addEventListener('raheeq-cloud-mode', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('raheeq-cloud-mode', update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return mode
}

/** دخول الشريك بالإيميل وكلمة السر (من تلفونه). */
export function PartnerLoginScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await linkViewer(email, password)
    } catch (err) {
      setError(err instanceof Error ? cloudError(err.message) : 'ما زبط')
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto bg-green px-4 py-8 text-cream">
      <Logo />
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-cream p-6 text-ink">
        <h1 className="mb-1 font-display text-2xl text-green">دخول الشريك</h1>
        <p className="mb-5 text-sm text-ink/60">بتشوف التقارير بس. البيانات بتنسحب من السحابة على هالتلفون، وبتنمسح منه لما تطلع.</p>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-bold text-green">الإيميل</span>
          <input
            type="email"
            autoComplete="username"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-bold text-green">كلمة السر</span>
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && <p className="mb-3 text-center font-bold text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-50"
        >
          {busy ? 'لحظة، بنسحب البيانات…' : 'دخول'}
        </button>
        <button type="button" onClick={onBack} className="mt-3 h-12 w-full rounded-2xl text-green ring-1 ring-green/20 active:bg-cream-200">
          رجوع
        </button>
      </form>
    </div>
  )
}

/** تلفون الشريك: التقارير بس، من نسخة السحابة. */
export function ViewerApp() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pulledAt, setPulledAt] = useState(lastPullAt)

  async function refresh() {
    setBusy(true)
    setError('')
    try {
      await refreshViewer()
      setPulledAt(lastPullAt())
    } catch (e) {
      setError(e instanceof Error ? cloudError(e.message) : 'ما زبط')
    } finally {
      setBusy(false)
    }
  }

  // أول ما ينفتح، وكل ما يرجع للتطبيق: بيجيب الجديد
  useEffect(() => {
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-green px-4 py-3 text-cream">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded-lg bg-green-700 px-3 py-1 text-sm">الشريك · تقارير بس</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">
            {error ? <span className="font-bold text-gold">{error}</span> : pulledAt ? <>آخر تحديث <span className="num">{timeLabelOf(pulledAt)}</span></> : ''}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={refresh}
            className="h-12 rounded-xl bg-green-700 px-4 font-medium active:bg-gold active:text-green disabled:opacity-50"
          >
            {busy ? 'بيحدّث…' : 'حدّث'}
          </button>
          <button
            type="button"
            onClick={() => void signOutViewer()}
            className="h-12 rounded-xl border border-gold/50 px-4 text-gold active:bg-gold active:text-green"
          >
            خروج
          </button>
        </div>
      </header>
      <ReportsScreen />
    </div>
  )
}
