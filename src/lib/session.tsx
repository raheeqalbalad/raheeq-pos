import { createContext, useContext, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { User } from '../db/types'

const KEY = 'raheeq.userId'

interface Session {
  user: User | null
  login: (user: User) => void
  logout: () => void
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem(KEY)) || null
    } catch {
      return null // التخزين ممنوع: بنرجع لشاشة الدخول
    }
  })
  // المستخدم بيتحدّث لحاله (اسم أو صلاحية تغيّرت). إذا انوقف، بيطلع من الحساب.
  const stored = useLiveQuery(async () => (userId ? ((await db.users.get(userId)) ?? null) : null), [userId])
  // الخروج فوري: ما بنستنى الاستعلام يرجع (ولا بنعرض مستخدم تاني غير اللي داخل)
  const user = userId !== null && stored?.id === userId && stored.active ? stored : null

  const login = (u: User) => {
    setUserId(u.id!)
    try {
      localStorage.setItem(KEY, String(u.id))
    } catch {
      /* ignore */
    }
  }

  const logout = () => {
    setUserId(null)
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }

  if (userId !== null && stored === undefined) return null
  return <SessionContext.Provider value={{ user, login, logout }}>{children}</SessionContext.Provider>
}

/** الدخول بالإيميل من بعيد: المالك بيشتغل باسم مستخدم المالك من النسخة (بدون رمز). */
export function RemoteSession({ user, onLogout, children }: { user: User; onLogout: () => void; children: ReactNode }) {
  return <SessionContext.Provider value={{ user, login: () => undefined, logout: onLogout }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession خارج SessionProvider')
  return s
}

export const ROLE_LABEL: Record<User['role'], string> = {
  owner: 'المالك',
  partner: 'الشريك',
  staff: 'موظف',
}
