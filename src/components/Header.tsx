import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeviceMode } from '../lib/cloud/useDeviceMode'
import { getStatus, syncState } from '../lib/cloud/sync'
import { getOpenShift } from '../lib/shift'
import { pastMidnight } from '../lib/businessDay'
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
        <StatusBar />
        <BusinessDay />
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

/** الوقت هلق، بيتحدّث كل 10 ثواني */
function useClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** "قبل 12ث" / "قبل 3د" / "قبل 2س" */
function agoShort(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}ث`
  if (s < 3600) return `${Math.floor(s / 60)}د`
  return `${Math.floor(s / 3600)}س`
}

/**
 * حالة النت وآخر مزامنة (على التابلت المربوط). البطارية والساعة بشريط أندرويد فوق.
 */
function StatusBar() {
  const now = useClock()
  const online = useOnline()
  const mode = useDeviceMode()
  const sync = useSyncExternalStore(syncState.subscribe, syncState.get)
  const status = useLiveQuery(() => (mode === 'cafe' ? getStatus() : undefined), [mode])
  const waiting = sync.pending || !!sync.error

  return (
    <div className="flex flex-col items-end gap-0.5 text-xs leading-tight">
      <div className="flex items-center gap-1 font-bold">
        <span className={`inline-block size-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-red-500'}`} aria-hidden />
        <span>{online ? 'متصل' : 'بدون نت'}</span>
      </div>
      {mode === 'cafe' && (
        <span
          title={sync.error || (waiting ? 'في تغييرات مستنية رفع للسحابة' : 'كل إشي مرفوع للسحابة')}
          className={waiting ? 'font-bold text-gold' : 'opacity-80'}
        >
          {waiting ? (sync.error ? '⏳ مش مرفوع' : '⏳ مستني يرفع') : '✓ مرفوع'}
          {status?.lastSyncAt ? (
            <>
              {' '}
              <span className="num">{agoShort(status.lastSyncAt, now)}</span>
            </>
          ) : null}
        </span>
      )}
    </div>
  )
}

const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/**
 * يوم الشغل: يوم فتح الشيفت المفتوح (حتى بعد نص الليل)، وإذا ما في شيفت: اليوم.
 * بعد نص الليل بيبيّن «بعد نص الليل» عشان يكون واضح ليش التاريخ مش تاريخ الساعة.
 */
function BusinessDay() {
  const now = useClock()
  const shift = useLiveQuery(async () => (await getOpenShift()) ?? null, [])
  const day = new Date(shift?.openedAt ?? now)
  const late = shift ? pastMidnight(shift, now) : false
  return (
    <div className="hidden border-e border-cream/20 pe-3 text-left leading-tight sm:block">
      <div className="font-bold">
        {WEEK_DAYS[day.getDay()]}
        {late && <span className="ms-1 rounded bg-gold/20 px-1 text-[10px] font-normal text-gold">بعد نص الليل</span>}
      </div>
      <div className="num text-xs opacity-70">
        {day.getDate()}/{day.getMonth() + 1}/{day.getFullYear()}
      </div>
    </div>
  )
}
