import { db } from '../../db/db'
import { cloud, cloudError, myRole } from './client'
import { deviceMode, setDeviceMode } from './device'

// تلفون الشريك: بيسحب نسخة من السحابة لقاعدة محلية عشان نفس شاشة التقارير تشتغل عليها.
// ما بيرفع إشي أبدًا (والـ RLS ما بيسمحله أصلًا). عند الخروج، النسخة بتنمسح من التلفون.

const PAGE = 1000
const LAST_PULL = 'raheeq-last-pull'
const PULLED_AT = 'raheeq-pulled-at'

interface CloudRecord {
  tbl: string
  id: string
  data: Record<string, unknown>
  deleted: boolean
  updated_at: string
}

/** الجهاز فيه بيع؟ (عشان ما ننسخ فوق تابلت الكافيه بالغلط) */
async function hasLocalSales() {
  return (await db.shifts.count()) > 0 || (await db.orders.count()) > 0
}

async function fetchSince(since: string | null): Promise<CloudRecord[]> {
  const all: CloudRecord[] = []
  for (let from = 0; ; from += PAGE) {
    let q = cloud().from('records').select('tbl,id,data,deleted,updated_at').neq('tbl', '_meta')
    if (since) q = q.gt('updated_at', since)
    const { data, error } = await q.order('updated_at').order('tbl').order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(cloudError(error.message))
    all.push(...((data ?? []) as CloudRecord[]))
    if (!data || data.length < PAGE) return all
  }
}

/** بيحط السجلات بالقاعدة المحلية (والمحذوف بينشال). */
async function apply(records: CloudRecord[], replace: boolean) {
  const known = new Map(db.tables.map((t) => [t.name, t]))
  const tables = db.tables
  await db.transaction('rw', tables, async () => {
    if (replace) for (const t of tables) await t.clear()
    const byTable = new Map<string, CloudRecord[]>()
    for (const r of records) if (known.has(r.tbl)) byTable.set(r.tbl, [...(byTable.get(r.tbl) ?? []), r])
    for (const [tbl, rows] of byTable) {
      const table = known.get(tbl)!
      const keyPath = table.schema.primKey.keyPath as string
      // المفاتيح الرقمية (++id) رجعت نص من السحابة
      const toKey = (r: CloudRecord) => (table.schema.primKey.auto ? Number(r.id) : (r.data[keyPath] ?? r.id))
      const live = rows.filter((r) => !r.deleted)
      const gone = rows.filter((r) => r.deleted)
      if (live.length) await table.bulkPut(live.map((r) => r.data))
      if (gone.length) await table.bulkDelete(gone.map(toKey) as never[])
    }
  })
  const latest = records.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '')
  if (latest) localStorage.setItem(LAST_PULL, latest)
  localStorage.setItem(PULLED_AT, String(Date.now()))
}

/** دخول الشريك: بس على جهاز ما فيه بيع، وبحساب إله دور بجدول members. */
export async function linkViewer(email: string, password: string) {
  if (deviceMode() === 'cafe') throw new Error('هاد تابلت الكافيه. الشريك بيدخل من تلفونه')
  if (deviceMode() !== 'viewer' && (await hasLocalSales())) throw new Error('هاد الجهاز فيه بيانات بيع، فما بينفع عليه دخول الشريك')
  const { error } = await cloud().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(cloudError(error.message))
  try {
    const role = await myRole()
    if (!role) throw new Error('هاد الحساب ما إله صلاحية (مش مضاف بجدول members)')
    const records = await fetchSince(null)
    await apply(records, true)
  } catch (e) {
    await cloud().auth.signOut()
    throw e
  }
  setDeviceMode('viewer')
}

/** بيجيب اللي تغيّر من آخر مرة. */
export async function refreshViewer() {
  const since = localStorage.getItem(LAST_PULL)
  await apply(await fetchSince(since), false)
}

/** آخر مرة سحب من السحابة */
export const lastPullAt = () => {
  const v = localStorage.getItem(PULLED_AT)
  return v ? Number(v) : undefined
}

/** خروج الشريك: النسخة بتنمسح من التلفون. */
export async function signOutViewer() {
  if (deviceMode() !== 'viewer') return
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  localStorage.removeItem(LAST_PULL)
  localStorage.removeItem(PULLED_AT)
  setDeviceMode(null)
  await cloud()
    .auth.signOut()
    .catch(() => undefined)
}
