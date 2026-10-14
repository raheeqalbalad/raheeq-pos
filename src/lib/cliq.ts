import { db } from '../db/db'
import type { CliqSettings, Payment, Shift } from '../db/types'

// حسابات الكليك: الكليك بينحوّل على حساب شخص معيّن. إذا انحوّل على حساب الموظف اللي فاتح
// الشيفت، الموظف بيحط مقابله كاش بالدرج، فبينحسب ضمن المفروض بالدرج.

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
  await db.settings.put({
    key: KEY,
    value: { accounts: s.accounts.map((a) => ({ ...a, name: a.name.trim() })), defaultId, staffFirst: s.staffFirst !== false },
  })
}

export interface CliqChoice {
  key: string
  name: string
  /** على حساب الموظف: بيحط مقابله كاش بالدرج */
  isStaff: boolean
}

/**
 * الخيارات بشاشة الدفع: الحسابات الفعّالة + الموظف اللي فاتح الشيفت.
 * التلقائي: حساب الموظف (إلا إذا المالك طفّاها من الإعدادات)، والموظف بيقدر يغيّر لحساب المالك.
 * إذا المالك نفسه فاتح الشيفت، الكليك على حسابه العادي (ما في «حساب موظف»).
 */
export async function cliqChoices(shift: Shift | undefined): Promise<{ choices: CliqChoice[]; defaultKey: string }> {
  const s = await getCliqSettings()
  const accounts: CliqChoice[] = s.accounts.filter((a) => a.active).map((a) => ({ key: a.id, name: a.name, isStaff: false }))
  const opener = shift ? await db.users.get(shift.staffId) : undefined
  const staff: CliqChoice | undefined =
    opener && opener.role !== 'owner' ? { key: `${STAFF_PREFIX}${opener.id}`, name: opener.name, isStaff: true } : undefined
  const choices = staff ? [staff, ...accounts] : accounts
  const account = accounts.find((c) => c.key === s.defaultId) ?? accounts[0]
  const defaultKey = (staff && s.staffFirst !== false ? staff : account ?? staff)?.key
  return { choices, defaultKey: defaultKey ?? '' }
}

export const isStaffCliq = (p: Payment) => !!p.cliqAccount?.startsWith(STAFF_PREFIX)

export interface CliqSplitRow {
  name: string
  amount: number
  isStaff: boolean
}

/**
 * الكليك مقسوم حسب الحساب، بالاسم الحالي من الإعدادات (لو المالك غيّر اسم الحساب، بيتغيّر هون كمان).
 * الدفعات اللي ما إلها حساب (قديمة) بتنحسب على الحساب التلقائي.
 */
export function splitCliq(payments: Payment[], settings: CliqSettings): CliqSplitRow[] {
  const names = new Map(settings.accounts.map((a) => [a.id, a.name]))
  const map = new Map<string, CliqSplitRow>()
  for (const p of payments) {
    if (p.method !== 'cliq') continue
    const isStaff = isStaffCliq(p)
    const key = p.cliqAccount ?? settings.defaultId
    const name = (isStaff ? undefined : names.get(key)) ?? p.cliqAccountName ?? names.get(settings.defaultId) ?? 'كليك'
    const row = map.get(key) ?? { name, amount: 0, isStaff }
    row.amount += p.amount
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => Number(a.isStaff) - Number(b.isStaff) || b.amount - a.amount)
}
