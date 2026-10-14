import { useState } from 'react'
import { db } from '../db/db'
import type { Role } from '../db/types'
import { ROLE_LABEL } from '../lib/session'
import Logo from '../components/Logo'
import { isWeakPin } from '../lib/users'

interface Row {
  role: Role
  name: string
  pin: string
}

const inputClass = 'h-14 min-w-0 rounded-xl bg-white px-4 text-lg text-ink ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-gold'

/**
 * أول مرة بيفتح التطبيق على جهاز (ما في مستخدمين): المالك بيحدد الأسماء والرموز.
 * عشان هيك ما في ولا رمز مكتوب بالكود.
 */
export default function SetupScreen() {
  const [rows, setRows] = useState<Row[]>([
    { role: 'owner', name: '', pin: '' },
    { role: 'partner', name: '', pin: '' },
    { role: 'staff', name: '', pin: '' },
  ])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (i: number, change: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...change } : r)))

  function validate(): string {
    const owner = rows[0]
    if (!owner.name.trim() || owner.pin.length !== 4) return 'لازم اسم المالك ورمز من 4 أرقام'
    const used = rows.filter((r) => r.name.trim() || r.pin)
    for (const r of used) {
      if (!r.name.trim()) return 'في رمز بدون اسم'
      if (r.pin.length !== 4) return `رمز «${r.name.trim()}» لازم يكون 4 أرقام`
    }
    const pins = used.map((r) => r.pin)
    if (new Set(pins).size !== pins.length) return 'كل واحد لازم يكون إله رمز مختلف'
    if (pins.some(isWeakPin)) return 'اختار رموز أصعب من 1111 أو 1234'
    return ''
  }

  async function save() {
    const problem = validate()
    if (problem) return setError(problem)
    setBusy(true)
    await db.transaction('rw', 'users', async () => {
      if ((await db.users.count()) > 0) return // انعمل الإعداد من تبويب تاني
      await db.users.bulkAdd(
        rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), role: r.role, pin: r.pin, active: true })),
      )
    })
    // الـ App بيتحوّل لشاشة الدخول لحاله لما ينضاف مستخدمين
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-green px-4 py-10 text-cream">
      <Logo />
      <div className="w-full max-w-lg rounded-3xl bg-cream p-6 text-ink">
        <h1 className="mb-1 font-display text-2xl text-green">إعداد أول مرة</h1>
        <p className="mb-5 text-sm text-ink/60">
          حدّد الأسماء والرموز (4 أرقام). الرموز بتنحفظ على هالجهاز بس. الشريك والموظف ممكن تتركهم فاضيين وتضيفهم بعدين.
        </p>
        <div className="flex flex-col gap-4">
          {rows.map((r, i) => (
            <div key={r.role}>
              <div className="mb-1 font-bold text-green">
                {ROLE_LABEL[r.role]} {r.role === 'owner' && <span className="text-sm font-normal text-red-700">(لازم)</span>}
              </div>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="الاسم" className={inputClass} />
                <input
                  value={r.pin}
                  onChange={(e) => update(i, { pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  inputMode="numeric"
                  type="password"
                  autoComplete="off"
                  placeholder="الرمز"
                  className={`${inputClass} num text-center tracking-[0.4em]`}
                />
              </div>
            </div>
          ))}
        </div>
        {error && <p className="mt-4 text-center font-bold text-red-700">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="mt-5 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-50"
        >
          احفظ وابلّش
        </button>
      </div>
    </div>
  )
}
