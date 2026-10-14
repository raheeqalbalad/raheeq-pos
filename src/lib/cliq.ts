import { db } from '../db/db'
import type { CliqSettings, Payment, Shift } from '../db/types'

// حسابات الكليك: الكليك بينحوّل على حساب شخص معيّن. إذا انحوّل على حساب الموظف اللي فاتح
// الشيفت، المبلغ لازم يتسلّم منه، فبيطلع سطر لحاله بتسكير الشيفت والتقارير.

const KEY = 'cliq'
export const STAFF_PREFIX = 'staff:'

/** أول مرة: حساب واحد، والمالك بيغيّر اسمه من الإعدادات (ما بنحط أسماء أشخاص بالكود). */
export const DEFAULT_CLIQ: CliqSettings = {
  accounts: [{ id: 'owner', name: 'حساب المالك', active: true }],
  defaultId: 'owner',
}

export async function getCliqSettings(): Promise<CliqSettings> {
  const row = await db.settings.get(KEY)
  const s = (row?.value as CliqSettings | undefined) ?? DEFAULT_CLIQ
  return s.accounts.length ? s : DEFAULT_CLIQ
}

export async function saveCliqSettings(s: CliqSettings) {
  const active = s.accounts.filter((a) => a.active && a.name.trim())
  if (!active.length) throw new Error('لازم يضل حساب كليك واحد فعّال على الأقل')
  const names = active.map((a) => a.name.trim())
  if (new Set(names).size !== names.length) throw new Error('في اسمين حسابات متشابهين')
  const defaultId = active.some((a) => a.id === s.defaultId) ? s.defaultId : active[0].id
  await db.settings.put({ key: KEY, value: { accounts: s.accounts.map((a) => ({ ...a, name: a.name.trim() })), defaultId } })
}

export interface CliqChoice {
  key: string
  name: string
  /** على حساب الموظف: لازم يتسلّم منه */
  isStaff: boolean
}

/** الخيارات بشاشة الدفع: الحسابات الفعّالة + الموظف اللي فاتح الشيفت. */
export async function cliqChoices(shift: Shift | undefined): Promise<{ choices: CliqChoice[]; defaultKey: string }> {
  const s = await getCliqSettings()
  const choices: CliqChoice[] = s.accounts.filter((a) => a.active).map((a) => ({ key: a.id, name: a.name, isStaff: false }))
  if (shift) {
    const staff = await db.users.get(shift.staffId)
    if (staff) choices.push({ key: `${STAFF_PREFIX}${staff.id}`, name: staff.name, isStaff: true })
  }
  return { choices, defaultKey: choices.some((c) => c.key === s.defaultId) ? s.defaultId : choices[0]?.key }
}

export const isStaffCliq = (p: Payment) => !!p.cliqAccount?.startsWith(STAFF_PREFIX)

export interface CliqSplitRow {
  name: string
  amount: number
  isStaff: boolean
}

/** الكليك مقسوم حسب الحساب (الدفعات القديمة بدون حساب: «بدون حساب»). */
export function splitCliq(payments: Payment[]): CliqSplitRow[] {
  const map = new Map<string, CliqSplitRow>()
  for (const p of payments) {
    if (p.method !== 'cliq') continue
    const isStaff = isStaffCliq(p)
    const name = p.cliqAccountName ?? 'بدون حساب'
    const key = `${isStaff ? 's' : 'a'}|${name}`
    const row = map.get(key) ?? { name, amount: 0, isStaff }
    row.amount += p.amount
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => Number(a.isStaff) - Number(b.isStaff) || b.amount - a.amount)
}
