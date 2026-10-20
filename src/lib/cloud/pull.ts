import { db } from '../../db/db'
import { cloud, cloudError, cloudFail, myRole } from './client'
import { deviceMode, setDeviceMode, setViewerRole, viewerRole } from './device'
import { checkSubmitted, clearRemoteQueues, flushOutbox, remoteEdits, withCloudWrites } from './remote'
import { clearPreviews } from '../ownerEdits'

// الدخول بالإيميل (تلفون أو لابتوب): بيسحب نسخة من السحابة لقاعدة محلية عشان نفس الشاشات تشتغل عليها.
// ما بيرفع بيانات أبدًا (المالك بيبعت طلبات تعديل للمنيو والإعدادات بس، شوف remote.ts).
// عند الخروج، النسخة بتنمسح من الجهاز.

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
    if (error) throw cloudFail('سحب البيانات', error.message)
    all.push(...((data ?? []) as CloudRecord[]))
    if (!data || data.length < PAGE) return all
  }
}

/** بيحط السجلات بالقاعدة المحلية (والمحذوف بينشال). */
async function apply(records: CloudRecord[], replace: boolean) {
  const known = new Map(db.tables.map((t) => [t.name, t]))
  const tables = db.tables
  await withCloudWrites(() => db.transaction('rw', tables, async () => {
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
  }))
  const latest = records.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '')
  if (latest) localStorage.setItem(LAST_PULL, latest)
  localStorage.setItem(PULLED_AT, String(Date.now()))
}

/** دخول بالإيميل: بس على جهاز ما فيه بيع، وبحساب إله دور بجدول members. */
export async function linkViewer(email: string, password: string) {
  if (deviceMode() === 'cafe') throw new Error('هاد تابلت الكافيه. الدخول بالإيميل بيكون من تلفون أو لابتوب تاني')
  if (deviceMode() !== 'viewer' && (await hasLocalSales())) throw new Error('هاد الجهاز فيه بيانات بيع، فما بينفع عليه الدخول بالإيميل')
  const { error } = await cloud().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(cloudError(error.message))
  try {
    const role = await myRole()
    if (!role) throw new Error('هاد الحساب ما إله صلاحية (مش مضاف بجدول members)')
    const records = await fetchSince(null)
    await apply(records, true)
    setViewerRole(role)
  } catch (e) {
    await cloud().auth.signOut()
    throw e
  }
  setDeviceMode('viewer')
}

/** بيبعت تعديلات المالك المستنية، وبيجيب اللي تغيّر من آخر مرة. */
export async function refreshViewer() {
  // الدخول انتهى (أو انمسح): بدون هاد، الطلبات بتروح بلا حساب والسحابة بترفضها كأنها «بلا صلاحية»
  const { data: auth } = await cloud().auth.getSession()
  if (!auth.session) throw new Error('انتهى الدخول على هالجهاز، اكبس «خروج» وادخل من جديد')
  if (viewerRole() === 'owner') {
    await flushOutbox()
    // التابلت رفض تعديل: النسخة عندي فيها التعديل، فبنسحب كل إشي من جديد
    if (await checkSubmitted()) return apply(await fetchSince(null), true)
    // كل التعديلات وصلت: النسخ المؤقتة بتنشال، واللي طبّقه التابلت بيوصل مع السحب
    const pending = remoteEdits.get()
    if (!pending.queued && !pending.waiting) await clearPreviews()
  }
  const since = localStorage.getItem(LAST_PULL)
  await apply(await fetchSince(since), false)
}

/** آخر مرة سحب من السحابة */
export const lastPullAt = () => {
  const v = localStorage.getItem(PULLED_AT)
  return v ? Number(v) : undefined
}

/** خروج: النسخة بتنمسح من الجهاز. */
export async function signOutViewer() {
  if (deviceMode() !== 'viewer') return
  await withCloudWrites(() =>
    db.transaction('rw', db.tables, async () => {
      for (const t of db.tables) await t.clear()
    }),
  )
  clearRemoteQueues()
  setViewerRole(null)
  localStorage.removeItem(LAST_PULL)
  localStorage.removeItem(PULLED_AT)
  setDeviceMode(null)
  await cloud()
    .auth.signOut()
    .catch(() => undefined)
}
