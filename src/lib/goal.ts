import { db } from '../db/db'
import { monthKey } from './reports'

// عدّاد الهدف: كم بدنا نوفّر بكم شهر. المالك بيسجّل كل شهر كم وفّرنا فعليًا.

export interface GoalSettings {
  /** الهدف بالـ fils */
  target: number
  months: number
  /** شهر البداية "2026-10" */
  start: string
  /** كم وفّرنا فعليًا بكل شهر (fils) */
  savings: Record<string, number>
}

const KEY = 'goal'

export const defaultGoal = (): GoalSettings => ({ target: 3_000_000, months: 6, start: monthKey(Date.now()), savings: {} })

export async function getGoal(): Promise<GoalSettings | undefined> {
  return (await db.settings.get(KEY))?.value as GoalSettings | undefined
}

/** أول مرة: الهدف المبدئي، والبداية من الشهر الحالي (بيتعدّل من الإعدادات). */
export async function ensureGoal() {
  await db.transaction('rw', 'settings', async () => {
    if (!(await db.settings.get(KEY))) await db.settings.put({ key: KEY, value: defaultGoal() })
  })
}

export async function saveGoalPlan(plan: { target: number; months: number; start: string }) {
  if (!(plan.target > 0)) throw new Error('اكتب الهدف')
  if (!Number.isInteger(plan.months) || plan.months < 1 || plan.months > 60) throw new Error('المدة لازم تكون بين 1 و60 شهر')
  if (!/^\d{4}-\d{2}$/.test(plan.start)) throw new Error('اختار شهر البداية')
  const current = (await getGoal()) ?? defaultGoal()
  await db.settings.put({ key: KEY, value: { ...current, ...plan } })
}

export async function saveMonthSaving(month: string, amount: number | undefined) {
  const current = (await getGoal()) ?? defaultGoal()
  const savings = { ...current.savings }
  if (amount === undefined) delete savings[month]
  else savings[month] = amount
  await db.settings.put({ key: KEY, value: { ...current, savings } })
}

/** "2026-10" + 2 → "2026-12" */
export function addMonths(key: string, n: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface GoalProgress {
  /** شهور الخطة بالترتيب */
  months: string[]
  end: string
  saved: number
  remaining: number
  /** نسبة الإنجاز 0–1 */
  ratio: number
  /** الشهور اللي لسا ممكن نوفّر فيها (من الشهر الحالي، إذا لسا ما انسجّل) */
  monthsLeft: number
  /** كم لازم نوفّر بالشهر عشان نوصل بالوقت */
  perMonth: number
  /** المفروض نكون وفّرنا لآخر الشهر الماضي حسب الخطة */
  plannedByNow: number
  done: boolean
  /** المدة خلصت وما وصلنا */
  overdue: boolean
}

export function goalProgress(g: GoalSettings, now = Date.now()): GoalProgress {
  const months = Array.from({ length: g.months }, (_, i) => addMonths(g.start, i))
  const end = months[months.length - 1]
  const saved = months.reduce((s, m) => s + (g.savings[m] ?? 0), 0)
  const remaining = Math.max(0, g.target - saved)
  const current = monthKey(now)
  const open = months.filter((m) => m > current || (m === current && g.savings[m] === undefined))
  const passed = months.filter((m) => m < current).length
  const done = remaining === 0
  return {
    months,
    end,
    saved,
    remaining,
    ratio: g.target ? Math.min(1, saved / g.target) : 0,
    monthsLeft: open.length,
    perMonth: open.length ? Math.ceil(remaining / open.length / 10) * 10 : remaining,
    plannedByNow: Math.round((g.target * passed) / g.months),
    done,
    overdue: !done && open.length === 0,
  }
}
