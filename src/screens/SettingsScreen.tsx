import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CliqAccount, CliqSettings } from '../db/types'
import { getCliqSettings, saveCliqSettings } from '../lib/cliq'
import { getWaterSettings, saveWaterSettings, type WaterSettings } from '../lib/water'
import { newId } from '../lib/menu'
import { getGoal, saveGoalPlan, type GoalSettings } from '../lib/goal'
import { getFloorSettings, saveFloorSettings, type FloorSettings } from '../lib/floor'
import { getChecklists, saveChecklists, type Checklists } from '../lib/checklists'
import type { ChecklistTask } from '../db/types'
import { formatJod, toFils } from '../lib/money'
import MoneyInput from '../components/MoneyInput'
import CloudSection from '../components/CloudSection'
import MenuQrSection from '../components/MenuQrSection'

const inputClass = 'h-12 min-w-0 rounded-xl bg-white px-3 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

/** إعدادات المالك: حسابات الكليك، والمي التلقائية، ومهام الفتح والتسكير، والطاولات، وهدف التوفير. (إعدادات الولاء بشاشة الزباين.) */
export default function SettingsScreen() {
  const cliq = useLiveQuery(getCliqSettings, [])
  const water = useLiveQuery(getWaterSettings, [])
  const goal = useLiveQuery(getGoal, [])
  const floor = useLiveQuery(getFloorSettings, [])
  const checklists = useLiveQuery(getChecklists, [])
  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <CloudSection />
        <MenuQrSection />
        {cliq && <CliqForm initial={cliq} />}
        {water && <WaterForm initial={water} />}
        {checklists && <ChecklistsForm initial={checklists} />}
        {floor && <FloorForm initial={floor} />}
        {goal && <GoalForm initial={goal} />}
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
  const [staffFirst, setStaffFirst] = useState(initial.staffFirst !== false)
  const [msg, setMsg] = useState('')
  const update = (i: number, change: Partial<CliqAccount>) => setAccounts((as) => as.map((a, j) => (j === i ? { ...a, ...change } : a)))

  async function save() {
    try {
      await saveCliqSettings({ accounts, defaultId, staffFirst })
      setMsg('انحفظ ✓')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'ما زبط')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">حسابات الكليك</h2>
      <p className="mb-3 text-sm text-ink/60">
        لما الموظف يختار كليك، بيختار على حساب مين. الكليك على حساب الموظف بيحط مقابله كاش بالدرج، فبينحسب ضمن المفروض بالدرج.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStaffFirst(true)}
          className={`h-12 rounded-xl px-4 font-medium ${staffFirst ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'}`}
        >
          التلقائي: حساب الموظف اللي فاتح الشيفت
        </button>
        <button
          type="button"
          onClick={() => setStaffFirst(false)}
          className={`h-12 rounded-xl px-4 font-medium ${!staffFirst ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'}`}
        >
          التلقائي: الحساب المختار تحت
        </button>
      </div>
      <p className="mb-2 text-sm text-ink/60">
        {staffFirst
          ? 'الموظف بيقدر يغيّره لحساب من هدول بكبسة. «التلقائي ✓» هون للدفعات القديمة، ولما المالك هو اللي فاتح الشيفت.'
          : 'الحساب المعلّم «التلقائي ✓» بيكون مختار لحاله، والموظف بيقدر يغيّره.'}
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

function WaterForm({ initial }: { initial: WaterSettings }) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [free, setFree] = useState(initial.free)
  const [msg, setMsg] = useState('')

  async function save() {
    await saveWaterSettings({ enabled, free })
    setMsg('انحفظ ✓')
    setTimeout(() => setMsg(''), 3000)
  }

  const chip = (on: boolean) => `h-12 rounded-xl px-4 font-medium ${on ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'}`

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">المي التلقائية</h2>
      <p className="mb-4 text-sm text-ink/60">
        لما ينحط عدد الزباين على طاولة، بتنضاف مي بعددهم، وبتتعدّل إذا تغيّر العدد. الموظف بيقدر يزيد أو يشيل عادي. (صنف «مي» من المنيو.)
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEnabled(true)} className={chip(enabled)}>
          شغّالة
        </button>
        <button type="button" onClick={() => setEnabled(false)} className={chip(!enabled)}>
          مطفية
        </button>
      </div>
      {enabled && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setFree(false)} className={chip(!free)}>
            بسعرها من المنيو
          </button>
          <button type="button" onClick={() => setFree(true)} className={chip(free)}>
            مجانية
          </button>
        </div>
      )}
      <button type="button" onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
        حفظ
      </button>
      <div className="mt-2">
        <Saved text={msg} />
      </div>
    </section>
  )
}

function GoalForm({ initial }: { initial: GoalSettings }) {
  const [target, setTarget] = useState(formatJod(initial.target))
  const [months, setMonths] = useState(String(initial.months))
  const [start, setStart] = useState(initial.start)
  const [msg, setMsg] = useState('')

  async function save() {
    try {
      await saveGoalPlan({ target: toFils(target || 0), months: Number(months), start })
      setMsg('انحفظ ✓')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'ما زبط')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">هدف التوفير</h2>
      <p className="mb-4 text-sm text-ink/60">العدّاد بيطلع بالتقارير (هون ومن بعيد). التوفير الفعلي كل شهر بيتسجّل من هناك.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-green">الهدف (دينار)</span>
          <MoneyInput value={target} onChange={setTarget} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-green">المدة (شهور)</span>
          <input
            value={months}
            onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 2))}
            inputMode="numeric"
            className={`${inputClass} num h-14 text-center text-2xl`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-green">شهر البداية</span>
          <input type="month" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputClass} num h-14`} />
        </label>
      </div>
      <button type="button" onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
        حفظ الهدف
      </button>
      <div className="mt-2">
        <Saved text={msg} />
      </div>
    </section>
  )
}

function FloorForm({ initial }: { initial: FloorSettings }) {
  const [coal, setCoal] = useState(String(initial.coalMinutes))
  const [idle, setIdle] = useState(String(initial.idleMinutes))
  const [msg, setMsg] = useState('')

  async function save() {
    try {
      await saveFloorSettings({ coalMinutes: Number(coal), idleMinutes: Number(idle) })
      setMsg('انحفظ ✓')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'ما زبط')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  const minutesInput = (value: string, set: (v: string) => void) => (
    <input
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 3))}
      inputMode="numeric"
      className={`${inputClass} num w-24 text-center`}
    />
  )

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">الطاولات</h2>
      <p className="mb-4 text-sm text-ink/60">تنبيهات شاشة الطاولات للموظف.</p>
      <div className="flex flex-col gap-3">
        <label className="flex flex-wrap items-center gap-2">
          <span className="w-56">🔥 الفحم بيتغيّر كل</span>
          {minutesInput(coal, setCoal)}
          دقيقة
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <span className="w-56">طاولة ساكتة بعد</span>
          {minutesInput(idle, setIdle)}
          دقيقة بدون طلب
        </label>
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

function TasksEditor({ title, tasks, onChange, placeholder }: { title: string; tasks: ChecklistTask[]; onChange: (t: ChecklistTask[]) => void; placeholder: string }) {
  return (
    <div>
      <h3 className="mb-2 font-bold text-green">{title}</h3>
      <ul className="flex flex-col gap-2">
        {tasks.map((t, i) => (
          <li key={t.id} className="flex gap-2">
            <input
              value={t.text}
              onChange={(e) => onChange(tasks.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              placeholder={placeholder}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              aria-label="شيل المهمة"
              onClick={() => onChange(tasks.filter((_, j) => j !== i))}
              className="h-12 w-12 shrink-0 rounded-xl text-red-800 active:bg-red-700/10"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {!tasks.length && <p className="text-sm text-ink/50">ما في مهام (الخطوة ما بتطلع للموظف)</p>}
      <button
        type="button"
        onClick={() => onChange([...tasks, { id: newId(), text: '' }])}
        className="mt-2 h-12 rounded-xl px-4 text-green ring-1 ring-green/30 active:bg-cream-200"
      >
        + مهمة
      </button>
    </div>
  )
}

function ChecklistsForm({ initial }: { initial: Checklists }) {
  const [open, setOpen] = useState(initial.open)
  const [close, setClose] = useState(initial.close)
  const [msg, setMsg] = useState('')

  async function save() {
    await saveChecklists({ open, close })
    setMsg('انحفظ ✓')
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">مهام الفتح والتسكير</h2>
      <p className="mb-4 text-sm text-ink/60">
        الموظف لازم يعلّم على كل المهام قبل ما يفتح الشيفت أو يعدّ الدرج بالتسكير. بينحفظ مين علّم ومتى، وبيبيّن بسجل الأيام.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <TasksEditor title="عند الفتح" tasks={open} onChange={setOpen} placeholder="مثلًا: تجهيز الفحم" />
        <TasksEditor title="عند التسكير" tasks={close} onChange={setClose} placeholder="مثلًا: تنظيف الطاولات" />
      </div>
      <button type="button" onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600">
        حفظ المهام
      </button>
      <div className="mt-2">
        <Saved text={msg} />
      </div>
    </section>
  )
}
