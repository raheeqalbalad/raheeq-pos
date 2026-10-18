import { db } from '../db/db'
import type { CafeTable, PaymentMethod } from '../db/types'
import { deleteExpenseAudited, removeLineUnits, updateExpenseAudited, voidOrderAudited } from './audit'
import { correctPayment } from './orders'
import { deleteTable, saveTable } from './tables'
import { isRemoteOwner } from './cloud/device'
import { enqueueOp, remoteId, withCloudWrites } from './cloud/remote'

// تعديلات المالك على الحركات: المصاريف، والطلبات المسكّرة، والطاولات.
// - على التابلت: بتنطبق فورًا.
// - من بعيد (الدخول بالإيميل): بتنطبق على النسخة اللي عنده عشان يشوفها هلق، وبتنبعت للتابلت كأمر
//   (remote_edits بـ tbl = '_op'). التابلت بيطبّقها بنفس الدوال (فالتقارير والصافي والدرج بينحسبوا من جديد)
//   وبيرجع يرفعها. كل تعديل بينحفظ بسجل التعديلات: مين ومتى وشو كان وشو صار، ومعلّم «من بعيد».

export type OwnerEdit =
  | { op: 'expense-edit'; expenseId: number; amount: number; reason: string }
  | { op: 'expense-delete'; expenseId: number }
  | { op: 'line-remove'; lineId: number; units: number }
  | { op: 'order-void'; orderId: number }
  | { op: 'payment-method'; paymentId: number; to: PaymentMethod }
  | { op: 'table-save'; table: CafeTable }
  | { op: 'table-delete'; tableId: number }

/** كل الجداول اللي ممكن تعديل يلمسها (التعديل كله بمعاملة وحدة) */
const TABLES = ['orders', 'orderLines', 'payments', 'paymentCorrections', 'shifts', 'expenses', 'auditLog', 'settings', 'cafeTables']

async function run(edit: OwnerEdit, by: number) {
  switch (edit.op) {
    case 'expense-edit': {
      const expense = await db.expenses.get(edit.expenseId)
      if (!expense) throw new Error('المصروف مش موجود (يمكن انحذف)')
      return updateExpenseAudited(expense, { amount: edit.amount, reason: edit.reason }, by)
    }
    case 'expense-delete': {
      const expense = await db.expenses.get(edit.expenseId)
      if (expense) await deleteExpenseAudited(expense, by)
      return
    }
    case 'line-remove': {
      const line = await db.orderLines.get(edit.lineId)
      if (!line) throw new Error('الصنف مش موجود بالطلب (يمكن انشال)')
      return removeLineUnits(line, edit.units, by)
    }
    case 'order-void': {
      const order = await db.orders.get(edit.orderId)
      if (!order) throw new Error('الطلب مش موجود')
      return voidOrderAudited(order, by)
    }
    case 'payment-method': {
      const payment = await db.payments.get(edit.paymentId)
      if (!payment) throw new Error('الدفعة مش موجودة')
      if (payment.method !== edit.to) await correctPayment(payment, by)
      return
    }
    case 'table-save':
      return saveTable(edit.table, by)
    case 'table-delete':
      return deleteTable(edit.tableId, by)
  }
}

export interface EditMeta {
  opId: string
  /** وقت التعديل عند المالك */
  at: number
  /** على جهاز المالك من بعيد: نسخة مؤقتة لحد ما يوصل اللي طبّقه التابلت */
  preview?: boolean
}

/**
 * بيطبّق التعديل بمعاملة وحدة. مع meta: سطور سجل التعديلات بتنعلّم «من بعيد» بوقت المالك،
 * والأمر نفسه ما بينطبق مرتين (لو التابلت رجع جابه بعد ما النت قطع).
 */
export async function applyOwnerEdit(edit: OwnerEdit, by: number, meta?: EditMeta) {
  await db.transaction('rw', TABLES, async () => {
    if (meta && (await db.auditLog.filter((a) => a.opId === meta.opId).count())) return
    const lastAudit = (await db.auditLog.orderBy(':id').last())?.id ?? 0
    const lastFix = (await db.paymentCorrections.orderBy(':id').last())?.id ?? 0
    await run(edit, by)
    if (!meta) return
    await db.auditLog
      .where(':id')
      .above(lastAudit)
      .modify({ opId: meta.opId, remote: true, at: meta.at, ...(meta.preview ? { preview: true } : {}) })
    if (meta.preview) await db.paymentCorrections.where(':id').above(lastFix).modify({ preview: true })
  })
}

/** تعديل من المالك: على التابلت فورًا، ومن بعيد بيبيّن عنده وبينبعت للتابلت. */
export async function ownerEdit(edit: OwnerEdit, by: number) {
  if (!isRemoteOwner()) return applyOwnerEdit(edit, by)
  // طاولة جديدة من بعيد: رقمها بينحدد هون، عشان يكون نفسه عنده وعند التابلت
  if (edit.op === 'table-save' && edit.table.id == null) edit = { ...edit, table: { ...edit.table, id: remoteId() } }
  const meta = { opId: crypto.randomUUID(), at: Date.now() }
  await withCloudWrites(() => applyOwnerEdit(edit, by, { ...meta, preview: true }))
  enqueueOp(meta.opId, { ...edit, by, at: meta.at })
  try {
    localStorage.setItem(PREVIEW_FLAG, '1')
  } catch {
    // بدون تخزين: النسخ المؤقتة بتنشال لما يطلع
  }
}

const PREVIEW_FLAG = 'raheeq-previews'

/** النسخ المؤقتة على جهاز المالك (بتنشال لما كل التعديلات توصل، والنسخة الحقيقية بتيجي مع السحب) */
export async function clearPreviews() {
  try {
    if (!localStorage.getItem(PREVIEW_FLAG)) return
    localStorage.removeItem(PREVIEW_FLAG)
  } catch {
    return
  }
  await withCloudWrites(() =>
    db.transaction('rw', ['auditLog', 'paymentCorrections'], async () => {
      await db.auditLog.filter((a) => !!a.preview).delete()
      await db.paymentCorrections.filter((c) => !!c.preview).delete()
    }),
  )
}
