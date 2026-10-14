import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Role, User } from '../db/types'
import { addUser, updateUser } from '../lib/users'
import { ROLE_LABEL, useSession } from '../lib/session'
import Sheet from '../components/Sheet'

const ROLES: Role[] = ['owner', 'partner', 'staff']

const ROLE_HINT: Record<Role, string> = {
  owner: 'كل اشي: البيع والتقارير والمنيو والمستخدمين',
  partner: 'التقارير وتصدير الإكسل بس',
  staff: 'البيع والدرج والمخزون وتسكير الشيفت',
}

const inputClass = 'h-14 w-full min-w-0 rounded-xl bg-white px-4 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

/** رمز من 4 أرقام، مخفي، أرقام بس. */
function PinInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      inputMode="numeric"
      type="password"
      autoComplete="off"
      placeholder={placeholder}
      className={`${inputClass} num text-center tracking-[0.4em]`}
    />
  )
}

/** المستخدمين والرموز (للمالك). الرموز ما بتنعرض أبدًا، بس بتتغيّر. */
export default function UsersScreen() {
  const { user: me } = useSession()
  const users = useLiveQuery(() => db.users.toArray(), [])
  const [editing, setEditing] = useState<User | 'new' | null>(null)

  const sorted = [...(users ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role))

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <p className="text-sm text-ink/60">كل واحد إله رمز من 4 أرقام لحاله. الرموز ما بتبيّن لحدا، بس المالك بيقدر يغيّرها.</p>
        <ul className="flex flex-col gap-2">
          {sorted.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setEditing(u)}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white/70 px-4 py-2 text-start ring-1 ring-cream-200 active:bg-gold/30 ${
                  u.active ? '' : 'opacity-50'
                }`}
              >
                <span className="flex-1">
                  <span className="font-bold text-green">{u.name}</span>
                  {u.id === me?.id && <span className="text-sm text-ink/50"> (إنت)</span>}
                  <span className="block text-xs text-ink/50">{ROLE_HINT[u.role]}</span>
                </span>
                <span
                  className={`rounded-lg px-3 py-1 text-sm font-bold ${
                    u.role === 'owner' ? 'bg-green text-cream' : u.role === 'partner' ? 'bg-gold text-green' : 'bg-cream-200 text-green'
                  }`}
                >
                  {ROLE_LABEL[u.role]}
                </span>
                {!u.active && <span className="text-sm text-red-800">موقوف</span>}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600"
        >
          + مستخدم جديد
        </button>
      </div>

      {editing && <UserEditor user={editing === 'new' ? null : editing} isMe={editing !== 'new' && editing.id === me?.id} onClose={() => setEditing(null)} />}
    </main>
  )
}

function UserEditor({ user, isMe, onClose }: { user: User | null; isMe: boolean; onClose: () => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'staff')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await action()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    // جديد: الرمز لازم. موجود: الرمز اختياري (فاضي = ما تغيّر)
    if ((!user || pin) && pin !== pin2) return setError('الرمزين مش متطابقين')
    if (!user) return run(() => addUser(name, role, pin))
    return run(() =>
      updateUser(user, {
        ...(name !== user.name ? { name } : {}),
        ...(role !== user.role ? { role } : {}),
        ...(pin ? { pin } : {}),
      }),
    )
  }

  return (
    <Sheet title={user ? `تعديل «${user.name}»` : 'مستخدم جديد'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">الاسم</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

        <div>
          <span className="mb-1 block font-bold text-green">الصلاحية</span>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isMe && r !== 'owner'}
                onClick={() => setRole(r)}
                className={`h-12 rounded-xl font-medium disabled:opacity-30 ${
                  role === r ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink/60">{ROLE_HINT[role]}</p>
        </div>

        <div>
          <span className="mb-1 block font-bold text-green">{user ? 'رمز جديد (اتركه فاضي إذا ما بدك تغيّره)' : 'الرمز'}</span>
          <div className="grid grid-cols-2 gap-2">
            <PinInput value={pin} onChange={setPin} placeholder="الرمز" />
            <PinInput value={pin2} onChange={setPin2} placeholder="مرة تانية" />
          </div>
        </div>

        {error && <p className="text-center font-bold text-red-700">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-50"
        >
          حفظ
        </button>

        {user && !isMe && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => updateUser(user, { active: !user.active }))}
            className={`h-12 rounded-xl font-medium ${
              user.active ? 'text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10' : 'text-green ring-1 ring-green/30 active:bg-cream-200'
            }`}
          >
            {user.active ? 'إيقاف المستخدم (ما بيقدر يدخل)' : 'رجّع المستخدم'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
