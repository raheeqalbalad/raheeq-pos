import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CliqAccount, CliqSettings, DiscountSettings } from '../db/types'
import { getCliqSettings, saveCliqSettings } from '../lib/cliq'
import { getDiscountSettings, saveDiscountSettings } from '../lib/discounts'
import { newId } from '../lib/menu'

const inputClass = 'h-12 min-w-0 rounded-xl bg-white px-3 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

/** إعدادات المالك: حسابات الكليك، وحد خصم الموظف. (إعدادات الولاء بشاشة الزباين.) */
export default function SettingsScreen() {
  const cliq = useLiveQuery(getCliqSettings, [])
  const discounts = useLiveQuery(getDiscountSettings, [])
  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {cliq && <CliqForm initial={cliq} />}
        {discounts && <DiscountForm initial={discounts} />}
        <p className="text-center text-sm text-ink/50">إعدادات كرت الولاء بشاشة «الزباين».</p>
      </div>
    </main>
  )
}

function Saved({ text }: { text: string }) {
  return text ? <p className={`text-center font-bold ${text.endsWith('✓') ? 'text-green' : 'text-red-700'}`}>{text}</p> : null
}

function CliqForm({ initial }: { initial: CliqSettings }) {
  const [accounts, setAccounts] = useState<CliqAccount[]>(initial.accounts)
  const [defaultId, setDefaultId] = useState(initial.defaultId)
  const [msg, setMsg] = useState('')
  const update = (i: number, change: Partial<CliqAccount>) => setAccounts((as) => as.map((a, j) => (j === i ? { ...a, ...change } : a)))

  async function save() {
    try {
      await saveCliqSettings({ accounts, defaultId })
      setMsg('انحفظ ✓')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'ما زبط')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">حسابات الكليك</h2>
      <p className="mb-4 text-sm text-ink/60">
        لما الموظف يختار كليك، بيختار على حساب مين. «التلقائي» بيكون مختار لحاله. وفي كمان خيار «الموظف اللي فاتح الشيفت»، وهاد
        بيطلع بتسكير الشيفت «لازم يتسلّم».
      </p>
      <ul className="flex flex-col gap-2">
        {accounts.map((a, i) => (
          <li key={a.id} className={`flex flex-wrap items-center gap-2 ${a.active ? '' : 'opacity-50'}`}>
            <input value={a.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="اسم الحساب" className={`${inputClass} flex-1`} />
            <button
              type="button"
              disabled={!a.active}
              onClick={() => setDefaultId(a.id)}
              className={`h-12 rounded-xl px-3 text-sm font-medium ${
                defaultId === a.id ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
              } disabled:opacity-30`}
            >
              {defaultId === a.id ? 'التلقائي ✓' : 'خلّيه التلقائي'}
            </button>
            <button
              type="button"
              onClick={() => update(i, { active: !a.active })}
              className="h-12 rounded-xl px-3 text-sm text-ink/70 ring-1 ring-cream-200 active:bg-cream-200"
            >
              {a.active ? 'إخفاء' : 'رجّعه'}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setAccounts((as) => [...as, { id: newId(), name: '', active: true }])}
        className="mt-3 h-12 rounded-xl px-4 text-green ring-1 ring-green/30 active:bg-cream-200"
      >
        + حساب
      </button>
      <button type="button" onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
        حفظ الحسابات
      </button>
      <div className="mt-2">
        <Saved text={msg} />
      </div>
    </section>
  )
}

function DiscountForm({ initial }: { initial: DiscountSettings }) {
  const [pct, setPct] = useState(String(initial.staffMaxPct))
  const [msg, setMsg] = useState('')

  async function save() {
    try {
      await saveDiscountSettings({ staffMaxPct: Number(pct) })
      setMsg('انحفظ ✓')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'ما زبط')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">الخصومات اليدوية</h2>
      <p className="mb-4 text-sm text-ink/60">الموظف بيعطي خصم لحد هالنسبة لحاله. أكثر من هيك بده رمز المالك.</p>
      <div className="flex items-center gap-2">
        أقصى خصم للموظف
        <input
          value={pct}
          onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
          inputMode="numeric"
          className={`${inputClass} num w-24 text-center`}
        />
        %
      </div>
      <button type="button" onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
        حفظ
      </button>
      <div className="mt-2">
        <Saved text={msg} />
      </div>
    </section>
  )
}
