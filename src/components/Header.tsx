import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useDeviceMode } from '../lib/cloud/useDeviceMode'
import { syncState } from '../lib/cloud/sync'
import { ROLE_LABEL, useSession } from '../lib/session'
import Logo from './Logo'

export default function Header({
  title,
  onBack,
  extra,
  backLabel = '→ الطاولات',
}: {
  title?: ReactNode
  onBack?: () => void
  /** أزرار إضافية جنب العنوان */
  extra?: ReactNode
  backLabel?: string
}) {
  const { user, logout } = useSession()
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 bg-green px-4 py-3 text-cream">
      {onBack ? (
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-12 shrink-0 rounded-xl bg-green-700 px-4 font-medium active:bg-gold active:text-green"
          >
            {backLabel}
          </button>
          <h1 className="truncate font-display text-xl">{title}</h1>
          {extra}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          {extra}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-3">
        <SyncBadge />
        <Today />
        <div className="hidden text-left leading-tight sm:block">
          <div className="font-bold">{user!.name}</div>
          <div className="text-xs opacity-70">{ROLE_LABEL[user!.role]}</div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="h-12 rounded-xl border border-gold/50 px-4 text-gold active:bg-gold active:text-green"
        >
          خروج
        </button>
      </div>
    </header>
  )
}

/** على التابلت المربوط: ✓ كل إشي مرفوع، أو ⏳ في تغييرات مستنية رفع. */
function SyncBadge() {
  const mode = useDeviceMode()
  const state = useSyncExternalStore(syncState.subscribe, syncState.get)
  if (mode !== 'cafe') return null
  const waiting = state.pending || !!state.error
  return (
    <span
      title={state.error || (waiting ? 'في تغييرات مستنية رفع للسحابة' : 'كل إشي مرفوع للسحابة')}
      className={`rounded-lg px-2 py-1 text-xs font-bold ${waiting ? 'bg-gold/20 text-gold' : 'bg-green-700 text-cream/80'}`}
    >
      {waiting ? (state.error ? '⏳ مش مرفوع' : '⏳ بيرفع') : '✓ مرفوع'}
    </span>
  )
}

const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** اليوم والتاريخ (بيتحدّث لحاله بعد نص الليل). */
function Today() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="hidden border-e border-cream/20 pe-3 text-left leading-tight sm:block">
      <div className="font-bold">{WEEK_DAYS[now.getDay()]}</div>
      <div className="num text-xs opacity-70">
        {now.getDate()}/{now.getMonth() + 1}/{now.getFullYear()}
      </div>
    </div>
  )
}
