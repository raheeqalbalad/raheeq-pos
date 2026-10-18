import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie'
import { db } from '../../db/db'
import { cloud, cloudError } from './client'
import { deviceMode, isRemoteOwner } from './device'

// الدخول بالإيميل من بعيد (تلفون أو لابتوب): القاعدة المحلية هون نسخة من السحابة.
// - المالك بيعدّل المنيو والأسعار والإعدادات. التعديل بيبيّن عنده فورًا، وبينبعت «طلب تعديل»
//   للتابلت (جدول remote_edits)، والتابلت بيطبّقه عنده وبيرجع يرفعه.
// - تعديل المصاريف والطلبات المسكّرة والطاولات بينبعت كأمر (tbl = '_op')، شوف ownerEdits.ts.
// - أي كتابة تانية (بيع، شيفت، زباين، مخزون...) ممنوعة من بعيد.
// - إذا ما في نت، الطلبات بتستنى بالجهاز وبتنبعت لما يرجع.

/** الجداول اللي المالك بيعدّلها من بعيد (لازم تطابق الـ check بجدول remote_edits) */
export const REMOTE_EDITABLE = new Set(['categories', 'items', 'optionLists', 'settings'])

/** أوامر تعديل الحركات (التابلت بيطبّقها بدوال سجل التعديلات) */
export const OP_TBL = '_op'

export const REMOTE_BLOCKED_MESSAGE = 'هاد بيتعدّل من التابلت بس'

/** وقت السحب من السحابة: الكتابة جاية من السحابة، فما بتنبعت كطلب تعديل */
let applyingCloud = 0
export async function withCloudWrites<T>(fn: () => Promise<T>): Promise<T> {
  applyingCloud++
  try {
    return await fn()
  } finally {
    applyingCloud--
  }
}

// ===== طابور الطلبات (محفوظ بالجهاز عشان ما يضيع بدون نت) =====

interface Edit {
  tbl: string
  rec_id: string
  data: unknown
  deleted: boolean
}

const OUTBOX = 'raheeq-outbox'
const SUBMITTED = 'raheeq-submitted'

const load = <T,>(key: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]
  } catch {
    return []
  }
}
const save = (key: string, value: unknown[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ما في تخزين
  }
  notify()
}

function enqueue(edits: Edit[]) {
  // آخر حالة لكل سجل بس
  const keyOf = (e: Edit) => `${e.tbl}|${e.rec_id}`
  const incoming = new Set(edits.map(keyOf))
  save(OUTBOX, [...load<Edit>(OUTBOX).filter((e) => !incoming.has(keyOf(e))), ...edits])
  scheduleFlush(300)
}

/** أمر تعديل حركة (مصروف، طلب مسكّر، طاولة) للتابلت */
export function enqueueOp(opId: string, data: unknown) {
  enqueue([{ tbl: OP_TBL, rec_id: opId, data, deleted: false }])
}

let flushing: Promise<void> | null = null
let flushTimer: ReturnType<typeof setTimeout> | undefined
let lastError = ''

function scheduleFlush(ms: number) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void flushOutbox(), ms)
}

/** بيبعت الطلبات المستنية للسحابة. */
export function flushOutbox(): Promise<void> {
  // ‏.finally بيشتغل بعد ما الوعد يتسجّل، حتى لو الطابور فاضي ورجع فورًا
  flushing ??= sendOutbox().finally(() => {
    flushing = null
  })
  return flushing
}

async function sendOutbox() {
  try {
    const pending = load<Edit>(OUTBOX)
    if (!pending.length) return
    const { data, error } = await cloud().from('remote_edits').insert(pending).select('id')
    if (error) throw new Error(cloudError(error.message))
    // اللي انبعت بينشال من الطابور (واللي انضاف وقت الإرسال بيضل)
    const sent = new Set(pending.map((e) => JSON.stringify(e)))
    save(OUTBOX, load<Edit>(OUTBOX).filter((e) => !sent.has(JSON.stringify(e))))
    save(SUBMITTED, [...load<number>(SUBMITTED), ...(data ?? []).map((r: { id: number }) => r.id)])
    lastError = ''
  } catch (e) {
    lastError = e instanceof Error ? cloudError(e.message) : String(e)
    notify()
    scheduleFlush(15_000)
  }
}

/** بيشيك أي طلبات التابلت طبّقها. بيرجع true إذا التابلت رفض تعديل (فالنسخة لازم تنسحب من جديد). */
export async function checkSubmitted(): Promise<boolean> {
  const ids = load<number>(SUBMITTED)
  if (!ids.length) return false
  // * عشان عمود error (التحديث ٣) إذا لسا ما انضاف ما يكسّر الاستعلام
  const { data, error } = await cloud().from('remote_edits').select('*').in('id', ids)
  if (error) throw new Error(cloudError(error.message))
  const rows = (data ?? []) as { id: number; applied_at: string | null; error?: string | null }[]
  const waiting = new Set(rows.filter((r) => !r.applied_at).map((r) => r.id))
  const rejected = rows.filter((r) => r.applied_at && r.error)
  if (rejected.length) lastError = `التابلت ما طبّق تعديل: ${rejected[rejected.length - 1].error}`
  save(SUBMITTED, ids.filter((id) => waiting.has(id)))
  return rejected.length > 0
}

export function clearRemoteQueues() {
  save(OUTBOX, [])
  save(SUBMITTED, [])
}

// ===== حالة الطلبات للواجهة =====

export interface RemoteEditsState {
  /** لسا ما انبعتت (بدون نت) */
  queued: number
  /** انبعتت والتابلت لسا ما طبّقها */
  waiting: number
  error: string
}

const listeners = new Set<() => void>()
let snapshot: RemoteEditsState = { queued: 0, waiting: 0, error: '' }

function notify() {
  const next = { queued: load<Edit>(OUTBOX).length, waiting: load<number>(SUBMITTED).length, error: lastError }
  if (next.queued !== snapshot.queued || next.waiting !== snapshot.waiting || next.error !== snapshot.error) snapshot = next
  for (const l of listeners) l()
}

export const remoteEdits = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => snapshot,
}

// ===== الطبقة اللي بتمسك الكتابة على القاعدة المحلية =====

let lastId = 0
/** رقم لسجل جديد من بعيد: كبير وما بيتكرر، عشان ما يتضارب مع أرقام التابلت */
export const remoteId = () => (lastId = Math.max(Date.now(), lastId + 1))

function wrapTable(name: string, table: DBCoreTable): DBCoreTable {
  return {
    ...table,
    async mutate(req: DBCoreMutateRequest) {
      if (applyingCloud || deviceMode() !== 'viewer') return table.mutate(req)
      if (!isRemoteOwner() || !REMOTE_EDITABLE.has(name) || req.type === 'deleteRange') throw new Error(REMOTE_BLOCKED_MESSAGE)
      const pk = table.schema.primaryKey
      if ((req.type === 'add' || req.type === 'put') && pk.autoIncrement && pk.keyPath === 'id')
        req = { ...req, values: req.values.map((v: { id?: number }) => (v.id == null ? { ...v, id: remoteId() } : v)) }
      const res = await table.mutate(req)
      if (req.type === 'delete') {
        enqueue(req.keys.map((k) => ({ tbl: name, rec_id: String(k), data: null, deleted: true })))
      } else {
        const keys = (res.results ?? req.keys ?? []) as unknown[]
        const rows = await table.getMany({ trans: req.trans, keys })
        enqueue(
          rows
            .map((row, i) => (row ? { tbl: name, rec_id: String(keys[i]), data: row, deleted: false } : null))
            .filter((e): e is Edit => !!e),
        )
      }
      return res
    },
  }
}

const middleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'remote-owner-edits',
  create: (down) => ({ ...down, table: (name: string) => wrapTable(name, down.table(name)) }),
}

/** لازم تنادى قبل أول استعمال للقاعدة */
export function installRemoteEdits() {
  db.use(middleware)
  window.addEventListener('online', () => scheduleFlush(1_000))
  notify()
  if (load<Edit>(OUTBOX).length) scheduleFlush(2_000)
}
