import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRemote } from '../lib/cloud/useDeviceMode'
import type { LoyaltySettings } from '../db/types'
import {
  allCustomerStats,
  getLoyaltySettings,
  saveCustomer,
  saveLoyaltySettings,
  type CustomerStats,
} from '../lib/customers'
import { exportCustomers } from '../lib/exportCustomers'
import { formatJod, toFils } from '../lib/money'
import { dayLabel } from '../lib/reports'
import Sheet from '../components/Sheet'
import MoneyInput from '../components/MoneyInput'

const DAY = 24 * 3600 * 1000
const inputClass = 'h-12 min-w-0 rounded-xl bg-white px-3 ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

/** الزباين للمالك: الزيارات، آخر زيارة، الصرف، أكثر صنف، فلتر الغايبين، والتصدير للواتساب. */
export default function CustomersScreen() {
  const stats = useLiveQuery(allCustomerStats, [])
  // من بعيد: بيانات الزباين للقراءة (التعديل من التابلت)، وإعدادات الولاء بتتعدّل عادي
  const remote = useRemote()
  const [search, setSearch] = useState('')
  const [absentOnly, setAbsentOnly] = useState(false)
  const [absentDays, setAbsentDays] = useState('14')
  const [editing, setEditing] = useState<CustomerStats | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [message, setMessage] = useState('')

  const days = Math.max(1, Number(absentDays) || 14)
  const now = Date.now()
  const q = search.trim()
  const rows = (stats ?? [])
    .filter((r) => !q || r.customer.phone.includes(q) || (r.customer.name ?? '').includes(q))
    .filter((r) => !absentOnly || (r.lastVisit !== undefined && now - r.lastVisit > days * DAY))
    .sort((a, b) => (b.lastVisit ?? 0) - (a.lastVisit ?? 0))
  const optedIn = rows.filter((r) => r.customer.marketingOptIn).length

  async function doExport() {
    const n = await exportCustomers(rows)
    setMessage(n ? `انصدّر ${n} زبون (الموافقين على العروض بس)` : 'ما في زباين موافقين على العروض بهالقائمة')
    setTimeout(() => setMessage(''), 5000)
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="دوّر بالاسم أو الرقم"
            className={`${inputClass} flex-1`}
          />
          <label className={`flex h-12 items-center gap-2 rounded-xl px-3 ${absentOnly ? 'bg-green text-cream' : 'bg-cream-200 text-green'}`}>
            <input type="checkbox" checked={absentOnly} onChange={(e) => setAbsentOnly(e.target.checked)} className="size-5 accent-gold" />
            غابوا أكثر من
            <input
              value={absentDays}
              onChange={(e) => setAbsentDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="num h-9 w-14 rounded-lg bg-white text-center text-ink"
            />
            يوم
          </label>
          <button type="button" onClick={() => setSettingsOpen(true)} className="h-12 rounded-xl px-4 text-green ring-1 ring-green/30 active:bg-cream-200">
            إعدادات الولاء
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-cream-200">
          <span className="flex-1 text-sm text-ink/70">
            <span className="num font-bold">{rows.length}</span> زبون بالقائمة، منهم <span className="num font-bold">{optedIn}</span> موافقين على العروض
          </span>
          <button
            type="button"
            disabled={!optedIn}
            onClick={doExport}
            className="h-12 rounded-xl bg-gold px-5 font-bold text-green active:bg-gold-600 disabled:opacity-40"
          >
            تصدير للواتساب (إكسل)
          </button>
          {message && <p className="w-full text-center font-bold text-green">{message}</p>}
        </div>

        {stats?.length === 0 && <p className="p-8 text-center text-ink/50">لسا ما في زباين. الموظف بيسجّلهم برقم التلفون وقت الدفع.</p>}
        <div className="overflow-x-auto rounded-2xl bg-white/70 ring-1 ring-cream-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 text-ink/60">
                {['الزبون', 'الزيارات', 'الولاء', 'آخر زيارة', 'صرف', 'أكثر اشي بيطلبه', 'عروض'].map((h) => (
                  <th key={h} className="px-3 py-2 text-start font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.customer.id}
                  onClick={() => !remote && setEditing(r)}
                  className={`border-b border-cream-200/60 ${remote ? '' : 'cursor-pointer active:bg-gold/20'}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-bold text-green">{r.customer.name || '—'}</div>
                    <div className="num text-xs text-ink/50">{r.customer.phone}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="num">{r.visits}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.loyalty.eligible ? (
                      <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-green">مستحق خصم</span>
                    ) : (
                      <span className="num text-ink/60">
                        {r.loyalty.progress}/{r.loyalty.settings.visitsNeeded}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.lastVisit ? (
                      <>
                        {dayLabel(r.lastVisit)}
                        <span className="block text-xs text-ink/50">
                          قبل <span className="num">{Math.floor((now - r.lastVisit) / DAY)}</span> يوم
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="num">{formatJod(r.spent)}</span>
                  </td>
                  <td className="px-3 py-2">{r.favorite ?? '—'}</td>
                  <td className="px-3 py-2">{r.customer.marketingOptIn ? '✓' : <span className="text-ink/30">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <CustomerEditor stats={editing} onClose={() => setEditing(null)} />}
      {settingsOpen && <LoyaltySettingsSheet onClose={() => setSettingsOpen(false)} />}
    </main>
  )
}

function CustomerEditor({ stats, onClose }: { stats: CustomerStats; onClose: () => void }) {
  const c = stats.customer
  const [name, setName] = useState(c.name ?? '')
  const [phone, setPhone] = useState(c.phone)
  const [optIn, setOptIn] = useState(c.marketingOptIn)
  const [error, setError] = useState('')

  async function save() {
    try {
      await saveCustomer({ id: c.id, phone, name, marketingOptIn: optIn })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
    }
  }

  return (
    <Sheet title={c.name || c.phone} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">الاسم</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} h-14 text-lg`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">الرقم</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={`${inputClass} num h-14 text-lg`} />
        </label>
        <label className="flex h-14 items-center gap-3 rounded-xl bg-white px-4 ring-1 ring-cream-200">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="size-6 accent-green" />
          موافق ينبعتله عروض
        </label>
        <p className="text-sm text-ink/60">
          <span className="num">{stats.visits}</span> زيارة · صرف <span className="num">{formatJod(stats.spent)}</span>
          {stats.favorite && <> · أكثر اشي: {stats.favorite}</>}
        </p>
        {error && <p className="text-center font-bold text-red-700">{error}</p>}
        <button type="button" onClick={save} className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
          حفظ
        </button>
      </div>
    </Sheet>
  )
}

function LoyaltySettingsSheet({ onClose }: { onClose: () => void }) {
  const current = useLiveQuery(getLoyaltySettings, [])
  return current ? <LoyaltyForm initial={current} onClose={onClose} /> : null
}

function LoyaltyForm({ initial, onClose }: { initial: LoyaltySettings; onClose: () => void }) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [visits, setVisits] = useState(String(initial.visitsNeeded))
  const [pct, setPct] = useState(String(initial.discountPct))
  const [max, setMax] = useState(formatJod(initial.maxDiscount))
  const [min, setMin] = useState(formatJod(initial.minOrder))
  const [error, setError] = useState('')

  async function save() {
    const s: LoyaltySettings = {
      enabled,
      visitsNeeded: Number(visits),
      discountPct: Number(pct),
      maxDiscount: toFils(max || 0),
      minOrder: toFils(min || 0),
    }
    if (!(s.visitsNeeded >= 1 && s.visitsNeeded <= 50)) return setError('عدد الزيارات لازم يكون بين 1 و 50')
    if (!(s.discountPct > 0 && s.discountPct <= 100)) return setError('النسبة لازم تكون بين 1 و 100')
    if (!(s.maxDiscount > 0)) return setError('أقصى خصم لازم يكون أكبر من صفر')
    await saveLoyaltySettings(s)
    onClose()
  }

  const num = (v: string, set: (v: string) => void) => (
    <input value={v} onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" className={`${inputClass} num w-24 text-center text-lg`} />
  )

  return (
    <Sheet title="إعدادات كرت الولاء" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex h-14 items-center gap-3 rounded-xl bg-white px-4 ring-1 ring-cream-200">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-6 accent-green" />
          كرت الولاء شغّال
        </label>
        <div className="flex flex-wrap items-center gap-2">
          كل {num(visits, setVisits)} زيارات، اللي بعدها خصم {num(pct, setPct)} % على الفاتورة كاملة
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">أقصى خصم (دينار)</span>
          <MoneyInput value={max} onChange={setMax} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">أقل طلب بينحسب زيارة (دينار)</span>
          <MoneyInput value={min} onChange={setMin} />
        </label>
        <p className="text-sm text-ink/60">زيارة وحدة بكل يوم شغل. زيارة الخصم ما بتنحسب من الدورة الجاية.</p>
        {error && <p className="text-center font-bold text-red-700">{error}</p>}
        <button type="button" onClick={save} className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
          حفظ
        </button>
      </div>
    </Sheet>
  )
}
