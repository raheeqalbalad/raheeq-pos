import { db } from '../db/db'
import type { Role, User } from '../db/types'

/** رموز سهلة كتير: 1111، 0000، 1234 */
export const isWeakPin = (pin: string) => /^(\d)\1{3}$/.test(pin) || pin === '1234'

/**
 * مشكلة بالرمز أو فاضي إذا تمام. الرمز لازم يكون فريد، لأنه الدخول بالرمز
 * بس (بدون اختيار اسم).
 */
export async function pinProblem(pin: string, exceptUserId?: number): Promise<string> {
  if (!/^\d{4}$/.test(pin)) return 'الرمز لازم يكون 4 أرقام'
  if (isWeakPin(pin)) return 'اختار رمز أصعب من 1111 أو 1234'
  const taken = await db.users.where('pin').equals(pin).filter((u) => u.id !== exceptUserId).count()
  if (taken) return 'هالرمز مستعمل لحدا تاني'
  return ''
}

/** لازم يضل مالك واحد فعّال على الأقل. */
async function isLastActiveOwner(id: number) {
  const owners = await db.users.filter((u) => u.role === 'owner' && u.active).toArray()
  return owners.length === 1 && owners[0].id === id
}

export async function addUser(name: string, role: Role, pin: string) {
  const problem = (!name.trim() && 'اكتب الاسم') || (await pinProblem(pin))
  if (problem) throw new Error(problem)
  await db.users.add({ name: name.trim(), role, pin, active: true })
}

export async function updateUser(user: User, changes: { name?: string; role?: Role; pin?: string; active?: boolean }) {
  if (changes.name !== undefined && !changes.name.trim()) throw new Error('اكتب الاسم')
  if (changes.pin !== undefined) {
    const problem = await pinProblem(changes.pin, user.id)
    if (problem) throw new Error(problem)
  }
  const losesOwner = (changes.role && changes.role !== 'owner') || changes.active === false
  if (user.role === 'owner' && losesOwner && (await isLastActiveOwner(user.id!))) {
    throw new Error('لازم يضل مالك واحد فعّال على الأقل')
  }
  await db.users.update(user.id!, { ...changes, ...(changes.name ? { name: changes.name.trim() } : {}) })
}
