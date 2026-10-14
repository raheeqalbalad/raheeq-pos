import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let id: number | null = null
    try {
      id = Number(localStorage.getItem(KEY)) || null
    } catch {
      /* التخزين ممنوع: بنرجع لشاشة الدخول */
    }
    ;(id ? db.users.get(id) : Promise.resolve(undefined)).then((u) => {
      if (u?.active) setUser(u)
      setReady(true)
    })
  }, [])

  const login = (u: User) => {
    setUser(u)
    try {
      localStorage.setItem(KEY, String(u.id))
    } catch {
      /* ignore */
    }
  }

  const logout = () => {
    setUser(null)
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }

  if (!ready) return null
  return <SessionContext.Provider value={{ user, login, logout }}>{children}</SessionContext.Provider>
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
