import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { User } from '../db/types'
import { viewerRole } from '../lib/cloud/device'
import { lastPullAt, linkViewer, refreshViewer, signOutViewer } from '../lib/cloud/pull'
import { cloudError } from '../lib/cloud/client'
import { remoteEdits } from '../lib/cloud/remote'
import { RemoteSession } from '../lib/session'
import Logo from '../components/Logo'
import Sheet from '../components/Sheet'
import ScreenNav, { type View } from '../components/ScreenNav'
import ReportsScreen from './ReportsScreen'
import DayLogScreen from './DayLogScreen'
import CustomersScreen from './CustomersScreen'
import InventoryScreen from './InventoryScreen'
import MenuEditorScreen from './MenuEditorScreen'
import SettingsScreen from './SettingsScreen'

const inputClass = 'h-14 w-full rounded-xl bg-white px-4 text-lg text-ink ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

const REFRESH_MS = 30_000

/** الدخول بالإيميل وكلمة السر (من تلفون أو لابتوب). */
export function EmailLoginScreen({ onBack }: { onBack: () => void }) {
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
        <h1 className="mb-1 font-display text-2xl text-green">دخول بالإيميل</h1>
        <p className="mb-5 text-sm text-ink/60">للمتابعة من بعيد. البيانات بتنسحب من السحابة على هالجهاز، وبتنمسح منه لما تطلع.</p>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-bold text-green">الإيميل</span>
          <input type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
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

/** "قبل 12 ثانية" / "قبل 3 د" */
function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  return s < 60 ? { n: s, unit: 'ثانية' } : { n: Math.floor(s / 60), unit: 'د' }
}

/** تحديث لحاله كل 30 ثانية (وأول ما يرجع للشاشة)، بدون websocket. */
function useAutoRefresh() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pulledAt, setPulledAt] = useState(lastPullAt)
  const [now, setNow] = useState(() => Date.now())
  const running = useRef(false)

  async function refresh() {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await refreshViewer()
      setPulledAt(lastPullAt())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? cloudError(e.message) : 'ما زبط')
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
    const every = setInterval(() => document.visibilityState === 'visible' && void refresh(), REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      clearInterval(every)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [])

  return { busy, error, pulledAt, now, refresh }
}

function RemoteHeader({ label, onLogout, live }: { label: string; onLogout: () => void; live: ReturnType<typeof useAutoRefresh> }) {
  const edits = useSyncExternalStore(remoteEdits.subscribe, remoteEdits.get)
  const since = live.pulledAt ? ago(live.pulledAt, live.now) : null
  const pendingEdits = edits.queued + edits.waiting
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-green px-4 py-3 text-cream">
      <div className="flex items-center gap-3">
        <Logo />
        <span className="rounded-lg bg-green-700 px-3 py-1 text-sm">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-end text-xs leading-tight">
          {live.error ? (
            <span className="font-bold text-gold">{live.error}</span>
          ) : since ? (
            <span className="opacity-80">
              آخر تحديث قبل <span className="num">{since.n}</span> {since.unit}
            </span>
          ) : (
            <span className="opacity-80">بيحدّث…</span>
          )}
          {edits.error && <div className="font-bold text-gold">{edits.error}</div>}
          {pendingEdits > 0 && (
            <div className="font-bold text-gold">
              ⏳ <span className="num">{pendingEdits}</span> {edits.queued ? 'تعديل مستني نت' : 'تعديل بيوصل التابلت'}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={live.busy}
          onClick={() => void live.refresh()}
          className="h-12 rounded-xl bg-green-700 px-4 font-medium active:bg-gold active:text-green disabled:opacity-50"
        >
          {live.busy ? '…' : 'حدّث'}
        </button>
        <button type="button" onClick={onLogout} className="h-12 rounded-xl border border-gold/50 px-4 text-gold active:bg-gold active:text-green">
          خروج
        </button>
      </div>
    </header>
  )
}

/** خروج: إذا في تعديلات لسا ما انبعتت، بيسأل أول. */
function useLogout() {
  const edits = useSyncExternalStore(remoteEdits.subscribe, remoteEdits.get)
  const [asking, setAsking] = useState(false)
  const out = () => void signOutViewer()
  const logout = () => (edits.queued ? setAsking(true) : out())
  const sheet = asking && (
    <Sheet title="في تعديلات لسا ما انبعتت" onClose={() => setAsking(false)}>
      <p className="mb-4 text-ink/80">
        في <span className="num font-bold">{edits.queued}</span> تعديل لسا ما وصل السحابة (ما في نت). إذا طلعت هلق، بيضيعوا.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setAsking(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
          رجوع
        </button>
        <button type="button" onClick={out} className="h-14 rounded-xl bg-red-800 font-bold text-cream">
          اطلع ع كل حال
        </button>
      </div>
    </Sheet>
  )
  return { logout, sheet }
}

const OWNER_VIEWS: View[] = ['reports', 'daylog', 'customers', 'stock', 'menu', 'settings']

/** المالك من بعيد: كل التقارير والسجل والزباين والمخزون، وتعديل المنيو والإعدادات. البيع على التابلت بس. */
function RemoteOwnerApp() {
  const live = useAutoRefresh()
  const { logout, sheet } = useLogout()
  const [view, setView] = useState<View>('reports')
  const owner = useLiveQuery(async () => (await db.users.toArray()).find((u) => u.role === 'owner' && u.active) ?? null, [])
  if (owner === undefined) return null
  const user: User = owner ?? { id: 0, name: 'المالك', role: 'owner', pin: '', active: true }

  return (
    <RemoteSession user={user} onLogout={logout}>
      <div className="flex h-full flex-col">
        <RemoteHeader label="المالك · من بعيد" onLogout={logout} live={live} />
        <ScreenNav view={view} onChange={setView} only={OWNER_VIEWS} />
        {view === 'reports' && <ReportsScreen />}
        {view === 'daylog' && <DayLogScreen />}
        {view === 'customers' && <CustomersScreen />}
        {view === 'stock' && <InventoryScreen />}
        {view === 'menu' && <MenuEditorScreen />}
        {view === 'settings' && <SettingsScreen />}
      </div>
      {sheet}
    </RemoteSession>
  )
}

/** حساب تقارير بس (من بعيد). */
function RemoteReportsApp() {
  const live = useAutoRefresh()
  const { logout, sheet } = useLogout()
  return (
    <div className="flex h-full flex-col">
      <RemoteHeader label="تقارير" onLogout={logout} live={live} />
      <ReportsScreen />
      {sheet}
    </div>
  )
}

/** الجهاز داخل بالإيميل */
export function ViewerApp() {
  return viewerRole() === 'owner' ? <RemoteOwnerApp /> : <RemoteReportsApp />
}
