import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { CLOUD_KEY, CLOUD_URL, cloudConfigured } from '../lib/cloud/config'
import type { PublicMenu, PublicMenuItem } from '../lib/cloud/publicMenu'
import { formatJod } from '../lib/money'
import { scheduleParts } from '../lib/schedule'

// صفحة المنيو العامة (من الـ QR على الطاولات). بتقرا المنيو العام اللي التابلت بينشره، وبس.
// ما بتعرف إشي عن المبيعات أو الزباين أو الرموز، وما بتحتاج حساب.

const CACHE = 'raheeq-public-menu'

type State = { menu: PublicMenu; updatedAt?: string } | null

function readCache(): State {
  try {
    const raw = localStorage.getItem(CACHE)
    return raw ? (JSON.parse(raw) as State) : null
  } catch {
    return null
  }
}

async function fetchMenu(): Promise<State> {
  const client = createClient(CLOUD_URL, CLOUD_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.from('public_menu').select('data,updated_at').eq('id', 1).maybeSingle()
  if (error) throw error
  if (!data) return null
  const state = { menu: data.data as PublicMenu, updatedAt: data.updated_at as string }
  try {
    localStorage.setItem(CACHE, JSON.stringify(state))
  } catch {
    // بدون تخزين: عادي
  }
  return state
}

export default function MenuPage() {
  const [state, setState] = useState<State>(readCache)
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'empty'>('loading')

  useEffect(() => {
    if (!cloudConfigured) return setStatus('empty')
    fetchMenu()
      .then((s) => {
        setState(s)
        setStatus(s ? 'ready' : 'empty')
      })
      .catch(() => setStatus('offline'))
  }, [])

  const categories = state?.menu.categories ?? []

  return (
    <div className="min-h-full bg-cream">
      <header className="bg-green px-4 pt-6 pb-4 text-center text-cream">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mx-auto mb-2 size-16 rounded-2xl" />
        <h1 className="font-display text-3xl font-bold">رحيق البلد</h1>
        <p className="text-sm opacity-70">كافيه · وسط البلد، عمّان</p>
      </header>

      {categories.length > 0 && (
        <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-cream-200 bg-cream/95 px-4 py-3 backdrop-blur">
          {categories.map((c, i) => (
            <a
              key={i}
              href={`#c${i}`}
              className={`flex h-11 shrink-0 items-center rounded-xl px-4 font-medium whitespace-nowrap ${
                c.offers ? 'bg-gold text-green' : 'bg-cream-200 text-green'
              }`}
            >
              {c.name}
            </a>
          ))}
        </nav>
      )}

      <main className="mx-auto max-w-2xl px-4 py-5">
        {status === 'loading' && !state && <p className="py-16 text-center text-ink/50">لحظة…</p>}
        {status === 'offline' && !state && <p className="py-16 text-center text-ink/60">ما قدرنا نجيب المنيو. تأكد من النت وجرّب كمان مرة.</p>}
        {status === 'empty' && <p className="py-16 text-center text-ink/60">المنيو لسا مش منشور. اسأل الموظف 🙂</p>}

        {categories.map((c, i) => (
          <section key={i} id={`c${i}`} className="mb-8 scroll-mt-20">
            <h2 className="mb-3 font-display text-2xl text-green">{c.name}</h2>
            <ul className="flex flex-col gap-3">
              {c.items.map((item) => (
                <MenuItem key={`${item.name}${item.price}`} item={item} offer={!!c.offers} />
              ))}
            </ul>
          </section>
        ))}

        {categories.length > 0 && (
          <p className="pt-4 pb-8 text-center text-xs text-ink/40">الأسعار بالدينار الأردني</p>
        )}
      </main>
    </div>
  )
}

function MenuItem({ item, offer }: { item: PublicMenuItem; offer: boolean }) {
  const when = scheduleParts(item.schedule)
  return (
    <li className={`rounded-2xl p-4 shadow-sm ${offer ? 'bg-gold/30 ring-2 ring-gold' : 'bg-white/80 ring-1 ring-cream-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-green">
            {item.name}
            {item.seasonal && <span className="ms-2 rounded-md bg-green px-2 py-0.5 align-middle text-xs font-medium text-cream">موسمي</span>}
          </h3>
          {item.description && <p className="mt-0.5 text-sm text-ink/70">{item.description}</p>}
          {(when.time || when.days) && (
            <p className="mt-1 text-xs font-bold text-green/80">
              🕘 {when.time && <span className="num">{when.time}</span>}
              {when.time && when.days && ' · '}
              {when.days}
            </p>
          )}
        </div>
        <span className="num shrink-0 font-display text-xl text-green">{formatJod(item.price)}</span>
      </div>
      {item.options?.map((g) =>
        g.choices.length > 8 ? (
          <details key={g.name} className="mt-2 text-sm">
            <summary className="cursor-pointer text-green">
              {g.name} (<span className="num">{g.choices.length}</span>)
            </summary>
            <p className="mt-1 leading-relaxed text-ink/70">{choicesText(g.choices)}</p>
          </details>
        ) : (
          <p key={g.name} className="mt-2 text-sm text-ink/70">
            <span className="font-medium text-green">
              {g.name}
              {g.pick ? ` (${g.pick})` : ''}:
            </span>{' '}
            {choicesText(g.choices)}
          </p>
        ),
      )}
    </li>
  )
}

function choicesText(choices: { name: string; priceDelta?: number }[]) {
  return choices.map((c) => (c.priceDelta ? `${c.name} (+${formatJod(c.priceDelta)})` : c.name)).join(' · ')
}
