import type { ReactNode } from 'react'
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
