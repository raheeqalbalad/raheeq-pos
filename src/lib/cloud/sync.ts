import Dexie, { type Table } from 'dexie'
import { db } from '../../db/db'
import { cloud, cloudError, myRole } from './client'
import { deviceId, deviceMode, setDeviceMode } from './device'
import { buildPublicMenu } from './publicMenu'
import { REMOTE_EDITABLE } from './remote'

// المزامنة على التابلت (حساب الكافيه): الحفظ المحلي ما بيتغيّر أبدًا، والسحابة نسخة عنه.
// كل دورة: بنقرا الجداول اللي تغيّرت، بنقارن بصمة كل سجل باللي انرفع قبل، وبنرفع بس الجديد والمعدّل
// (والمحذوف بينرفع كـ deleted). البصمات محفوظة بقاعدة لحالها (raheeq-sync)، مش بقاعدة البيع.
// إذا ما في نت، الدورة بتفشل بهدوء وبترجع تحاول، وما بيضيع إشي لأنه البصمة بتتحدّث بس بعد ما السحابة تأكّد.

interface HashRow {
  tbl: string
  id: string
  hash: string
}

interface MetaRow {
  key: string
  value: unknown
}

class SyncDb extends Dexie {
  hashes!: Table<HashRow, [string, string]>
  meta!: Table<MetaRow, string>
  constructor() {
    super('raheeq-sync')
    this.version(1).stores({ hashes: '[tbl+id], tbl', meta: 'key' })
  }
}

export const syncDb = new SyncDb()

const BATCH = 400
const MENU_TABLES = new Set(['categories', 'items', 'optionLists'])
const MENU_HASH = 'public-menu-hash'

export interface SyncStatus {
  lastSyncAt?: number
  /** آخر رفع فيه تعديلات */
  lastUploadAt?: number
  /** كم سجل انرفع بآخر دورة */
  lastUploaded?: number
  error?: string
  errorAt?: number
  running?: boolean
}

export async function getStatus(): Promise<SyncStatus> {
  return ((await syncDb.meta.get('status'))?.value as SyncStatus | undefined) ?? {}
}

async function setStatus(change: Partial<SyncStatus>) {
  await syncDb.meta.put({ key: 'status', value: { ...(await getStatus()), ...change } })
}

/** بصمة سريعة للنص (cyrb53) */
function hashOf(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** شو بينرفع من السجل: رموز الموظفين ما بتطلع من التابلت أبدًا. */
function cloudData(tbl: string, row: Record<string, unknown>): Record<string, unknown> {
  if (tbl === 'users') {
    const { pin: _pin, ...rest } = row
    return rest
  }
  return row
}

const keyOf = (table: Table, row: object) => String(Dexie.getByKeyPath(row, table.schema.primKey.keyPath as string))

// الجداول اللي تغيّرت من آخر دورة (أول دورة: كلهم)
const dirty = new Set<string>(db.tables.map((t) => t.name))
let watching = false

function watchChanges() {
  if (watching) return
  watching = true
  Dexie.on('storagemutated', (parts) => {
    let changed = false
    for (const key of Object.keys(parts)) {
      // "idb://raheeq-pos/orders/..." → orders
      const [, , dbName, tbl] = key.split('/')
      if (dbName === db.name && tbl) {
        dirty.add(tbl)
        changed = true
      }
    }
    // بس تغييرات قاعدة البيع: كتابة المزامنة على قاعدتها (الحالة والبصمات) ما لازم تصحّيها من جديد،
    // وإلا بتصير حلقة كل ثانية
    if (!changed) return
    lastChangeAt = Date.now()
    notifyState()
    // ما بنرفع مع كل كبسة: بنرفع لما تخلص مجموعة الأوامر (syncSoon من التنقّل بين الشاشات)،
    // وإذا مرّت دقيقة بدون حركة وفي اشي ما انرفع، بنرفعه
    schedule(IDLE_SYNC_MS)
  })
}

/** دقيقة بدون أي تغيير = بنرفع اللي فات */
const IDLE_SYNC_MS = 60_000
let lastChangeAt = 0

/**
 * خلصت مجموعة أوامر (رجع للطاولات، دفع، سكّر شيفت، طلع...): بنرفع هلق بدل ما نستنى.
 * على أي جهاز مش تابلت مربوط ما بتعمل إشي.
 */
export function syncSoon() {
  if (deviceMode() !== 'cafe' || !started) return
  schedule(500)
}

// ===== مؤشر التابلت: ✓ مرفوع أو ⏳ مستني =====

export interface SyncState {
  pending: boolean
  error: string
}

const stateListeners = new Set<() => void>()
let state: SyncState = { pending: false, error: '' }
let lastError = ''

function notifyState() {
  const next = { pending: dirty.size > 0 || !!running, error: lastError }
  if (next.pending !== state.pending || next.error !== state.error) {
    state = next
    for (const l of stateListeners) l()
  }
}

export const syncState = {
  subscribe(l: () => void) {
    stateListeners.add(l)
    return () => stateListeners.delete(l)
  },
  get: () => state,
}

async function upsert(rows: { tbl: string; id: string; data: unknown; deleted: boolean }[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await cloud()
      .from('records')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'tbl,id' })
    if (error) throw new Error(cloudError(error.message))
  }
}

/** دورة رفع وحدة. بترجع كم سجل انرفع. */
async function pushOnce(): Promise<number> {
  let uploaded = 0
  const tables = db.tables.filter((t) => dirty.has(t.name))
  // المنيو العام بينحسب من جديد بس إذا المنيو نفسه تغيّر (أو أول مرة)
  const menuChanged = tables.some((t) => MENU_TABLES.has(t.name)) || !(await syncDb.meta.get(MENU_HASH))
  for (const table of tables) {
    dirty.delete(table.name)
    try {
      const rows = (await table.toArray()) as Record<string, unknown>[]
      const old = new Map((await syncDb.hashes.where('tbl').equals(table.name).toArray()).map((h) => [h.id, h.hash]))
      const changed: { tbl: string; id: string; data: unknown; deleted: boolean }[] = []
      const newHashes: HashRow[] = []
      const seen = new Set<string>()
      for (const [n, row] of rows.entries()) {
        // كل 200 سجل بنعطي الشاشة نفس، عشان الكبسات ما تعلق على تابلت بطيء
        if (n && n % 200 === 0) await new Promise((r) => setTimeout(r))
        const id = keyOf(table, row)
        seen.add(id)
        const data = cloudData(table.name, row)
        const hash = hashOf(JSON.stringify(data))
        if (old.get(id) !== hash) {
          changed.push({ tbl: table.name, id, data, deleted: false })
          newHashes.push({ tbl: table.name, id, hash })
        }
      }
      const removed = [...old.keys()].filter((id) => !seen.has(id))
      for (const id of removed) changed.push({ tbl: table.name, id, data: {}, deleted: true })
      if (!changed.length) continue
      await upsert(changed)
      // السحابة أكّدت: هلق بنحدّث البصمات
      await syncDb.transaction('rw', syncDb.hashes, async () => {
        await syncDb.hashes.bulkPut(newHashes)
        await syncDb.hashes.bulkDelete(removed.map((id) => [table.name, id] as [string, string]))
      })
      uploaded += changed.length
    } catch (e) {
      dirty.add(table.name)
      throw e
    }
  }

  // المنيو العام لصفحة الـ QR
  if (!menuChanged) return uploaded
  const menu = await buildPublicMenu()
  const menuHash = hashOf(JSON.stringify(menu))
  if ((await syncDb.meta.get(MENU_HASH))?.value !== menuHash) {
    const { error } = await cloud().from('public_menu').upsert({ id: 1, data: menu })
    if (error) throw new Error(cloudError(error.message))
    await syncDb.meta.put({ key: MENU_HASH, value: menuHash })
  }
  return uploaded
}

let running: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** بيرفع اللي فات (إذا التابلت مربوط). آمنة تنادى أكثر من مرة. */
export function syncNow(): Promise<void> {
  if (deviceMode() !== 'cafe') return Promise.resolve()
  running ??= (async () => {
    await setStatus({ running: true })
    // (ما في return قبل أول await، فـ finally بيشتغل بعد ما running يتسجّل)
    try {
      await applyRemoteEdits()
      const n = await pushOnce()
      lastError = ''
      await setStatus({
        running: false,
        lastSyncAt: Date.now(),
        error: undefined,
        errorAt: undefined,
        ...(n ? { lastUploadAt: Date.now(), lastUploaded: n } : {}),
      })
    } catch (e) {
      lastError = e instanceof Error ? cloudError(e.message) : String(e)
      await setStatus({ running: false, error: lastError, errorAt: Date.now() })
    } finally {
      running = null
      notifyState()
    }
  })()
  notifyState()
  return running
}

/**
 * طلبات التعديل اللي بعتها المالك من بعيد (المنيو والأسعار والإعدادات): التابلت بيطبّقها عنده،
 * والرفع العادي بيرجّعها للسحابة. التطبيق آمن يتكرر لو انقطع النت بالنص.
 */
const APPLIED_KEY = 'remote-applied'

async function appliedLocally(): Promise<number[]> {
  return ((await syncDb.meta.get(APPLIED_KEY))?.value as number[] | undefined) ?? []
}

async function applyRemoteEdits() {
  // اللي طبّقناه قبل وما قدرنا نعلّم عليه بالسحابة (النت قطع): بنعلّم بس، ما بنرجع نكتب
  const pendingMarks = await appliedLocally()
  if (pendingMarks.length) await markApplied(pendingMarks)

  const { data, error } = await cloud()
    .from('remote_edits')
    .select('id,tbl,rec_id,data,deleted')
    .is('applied_at', null)
    .order('id')
    .limit(500)
  if (error) {
    // التحديث ٢ لسا ما انلصق بـ Supabase: المزامنة العادية بتكمّل
    if (/remote_edits|schema cache/i.test(error.message)) return
    throw new Error(cloudError(error.message))
  }
  const done = new Set(await appliedLocally())
  const edits = ((data ?? []) as { id: number; tbl: string; rec_id: string; data: Record<string, unknown> | null; deleted: boolean }[]).filter(
    (e) => !done.has(e.id),
  )
  if (!edits.length) return
  const tables = new Map(db.tables.map((t) => [t.name, t]))
  await db.transaction('rw', [...REMOTE_EDITABLE].map((n) => tables.get(n)!), async () => {
    for (const e of edits) {
      const table = tables.get(e.tbl)
      if (!table || !REMOTE_EDITABLE.has(e.tbl)) continue
      const keyPath = table.schema.primKey.keyPath as string
      const key = table.schema.primKey.auto ? Number(e.rec_id) : e.rec_id
      const current = await table.get(key)
      if (e.deleted) {
        if (current) await table.delete(key)
      } else if (e.data && String(e.data[keyPath]) === e.rec_id && JSON.stringify(current) !== JSON.stringify(e.data)) {
        // بس إذا في تغيير فعلًا (كتابة نفس الإشي بتصحّي الشاشات والمزامنة على الفاضي)
        await table.put(e.data)
      }
    }
  })
  // انطبّقوا: بنحفظهم عنا أول، عشان لو التعليم بالسحابة فشل ما نرجع نطبّقهم كل ثانية
  await syncDb.meta.put({ key: APPLIED_KEY, value: [...done, ...edits.map((e) => e.id)] })
  await markApplied(edits.map((e) => e.id))
}

/** بيعلّم بالسحابة إنه التابلت طبّق هالتعديلات، وبيشيلهم من القائمة المحلية. */
async function markApplied(ids: number[]) {
  const { error } = await cloud().from('remote_edits').update({ applied_at: new Date().toISOString() }).in('id', ids)
  if (error) throw new Error(cloudError(error.message))
  const left = (await appliedLocally()).filter((id) => !ids.includes(id))
  await syncDb.meta.put({ key: APPLIED_KEY, value: left })
}

function schedule(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

let started = false

/** بيشغّل المزامنة بالخلفية على التابلت المربوط: بعد أي تعديل، وكل دقيقة، ولما يرجع النت. */
export function startSync() {
  if (started || deviceMode() !== 'cafe') return
  started = true
  watchChanges()
  window.addEventListener('online', () => schedule(1_000))
  // كل 30 ثانية: بيجيب تعديلات المالك من بعيد وبيرفع اللي فات، بس مش بنص شغل (لازم 20 ثانية بدون تغيير)
  setInterval(() => {
    if (Date.now() - lastChangeAt > 20_000) void syncNow()
  }, 30_000)
  schedule(2_000)
}

/** عدد التعديلات اللي لسا ما انرفعت (تقريبي: الجداول اللي تغيّرت) */
export const hasPending = () => dirty.size > 0

// ===== ربط التابلت بحساب الكافيه =====

const DEVICE_RECORD = { tbl: '_meta', id: 'device' }

/**
 * بيدخل بحساب الكافيه وبيربط هالتابلت فيه. حساب الكافيه بينربط بجهاز واحد بس، عشان جهاز فاضي
 * ما يكتب فوق بيانات التابلت. force = المالك متأكد إنه نفس التابلت (مثلًا انمسحت بيانات المتصفح).
 */
export async function linkCafeDevice(email: string, password: string, force = false) {
  const { error } = await cloud().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(cloudError(error.message))
  try {
    const role = await myRole()
    if (role !== 'cafe') throw new Error('هاد الحساب مش حساب الكافيه (أو مش مضاف بجدول members)')
    const { data, error: readError } = await cloud()
      .from('records')
      .select('data')
      .eq('tbl', DEVICE_RECORD.tbl)
      .eq('id', DEVICE_RECORD.id)
      .maybeSingle()
    if (readError) throw new Error(cloudError(readError.message))
    const linked = (data?.data as { deviceId?: string } | undefined)?.deviceId
    if (linked && linked !== deviceId() && !force) throw new Error('LINKED_ELSEWHERE')
    const { error: writeError } = await cloud()
      .from('records')
      .upsert({ ...DEVICE_RECORD, data: { deviceId: deviceId(), linkedAt: Date.now() }, deleted: false }, { onConflict: 'tbl,id' })
    if (writeError) throw new Error(cloudError(writeError.message))
  } catch (e) {
    await cloud().auth.signOut()
    throw e
  }
  setDeviceMode('cafe')
  // كل ربط = رفع كامل من جديد (الرفع آمن يتكرر)، عشان ولا سجل يضيع لو السحابة تغيّرت أو انفضت
  await resetUploadState()
  startSync()
  await syncNow()
}

/** بينسى شو انرفع قبل، فالدورة الجاية بترفع كل إشي من جديد. */
export async function resetUploadState() {
  await syncDb.transaction('rw', syncDb.hashes, syncDb.meta, async () => {
    await syncDb.hashes.clear()
    await syncDb.meta.delete(MENU_HASH)
  })
  for (const t of db.tables) dirty.add(t.name)
}

/** بيفصل التابلت عن السحابة. البيانات المحلية ما بتنمس. */
export async function unlinkCafeDevice() {
  setDeviceMode(null)
  await cloud().auth.signOut()
}

export interface VerifyRow {
  tbl: string
  local: number
  cloud: number
}

/** بيقارن عدد السجلات بكل جدول بين التابلت والسحابة. */
export async function verifyUpload(): Promise<VerifyRow[]> {
  const rows: VerifyRow[] = []
  for (const table of db.tables) {
    const local = await table.count()
    const { count, error } = await cloud()
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('tbl', table.name)
      .eq('deleted', false)
    if (error) throw new Error(cloudError(error.message))
    rows.push({ tbl: table.name, local, cloud: count ?? 0 })
  }
  return rows
}
