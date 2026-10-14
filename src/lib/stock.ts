import { db } from '../db/db'
import type { StockCount, StockItem } from '../db/types'
import { addExpense } from './shift'

// المخزون البسيط: بنسجّل اللي دخل (استلام)، وبنجرد آخر الأسبوع.
// الاستهلاك بين جردين = الجرد اللي قبل + اللي دخل بينهم − الجرد الجديد.

/**
 * استلام بضاعة. إذا fromDrawer، المبلغ بينسجّل مصروف درج تلقائيًا
 * (عشان ما ينسجّل مرتين)، والاستلام بيضل مربوط فيه.
 */
export async function receiveStock(
  item: StockItem,
  qty: number,
  staffId: number,
  opts: { note?: string; cost?: number; fromDrawer: boolean },
) {
  await db.transaction('rw', ['stockMoves', 'expenses', 'shifts'], async () => {
    const note = opts.note?.trim()
    const expenseId =
      opts.fromDrawer && opts.cost ? await addExpense(opts.cost, `استلام ${item.name}${note ? ` (${note})` : ''}`, staffId) : undefined
    await db.stockMoves.add({
      stockItemId: item.id!,
      qty,
      staffId,
      createdAt: Date.now(),
      ...(note ? { note } : {}),
      ...(opts.cost ? { cost: opts.cost } : {}),
      ...(expenseId ? { expenseId } : {}),
    })
  })
}

/** بيحفظ جرد كامل (كل الأصناف اللي انكتبلها كمية) بنفس batchId. */
export async function saveCount(entries: { stockItemId: number; qty: number }[], staffId: number) {
  const countedAt = Date.now()
  const batchId = countedAt
  await db.stockCounts.bulkAdd(entries.map((e) => ({ ...e, batchId, countedAt, staffId })))
  return batchId
}

export async function addStockItem(name: string, unit: string) {
  const sort = (await db.stockItems.count()) + 1
  await db.stockItems.add({ name: name.trim(), unit: unit.trim(), active: true, sort })
}

export async function updateStockItem(id: number, changes: Partial<Pick<StockItem, 'name' | 'unit' | 'active'>>) {
  await db.stockItems.update(id, changes)
}

export interface StockStatus {
  item: StockItem
  lastCount?: StockCount
  /** اللي دخل من بعد آخر جرد (أو من الأول إذا ما في جرد) */
  receivedSince: number
  /** آخر جرد + اللي دخل بعده. فاضي إذا ما صار جرد لسا */
  expected?: number
}

export async function stockStatus(): Promise<StockStatus[]> {
  const [items, counts, moves] = await Promise.all([
    db.stockItems.orderBy('sort').toArray(),
    db.stockCounts.toArray(),
    db.stockMoves.toArray(),
  ])
  return items.map((item) => {
    const lastCount = counts
      .filter((c) => c.stockItemId === item.id)
      .reduce<StockCount | undefined>((a, c) => (!a || c.countedAt > a.countedAt ? c : a), undefined)
    const since = lastCount?.countedAt ?? 0
    const receivedSince = moves
      .filter((m) => m.stockItemId === item.id && m.createdAt > since)
      .reduce((s, m) => s + m.qty, 0)
    return { item, lastCount, receivedSince, expected: lastCount ? lastCount.qty + receivedSince : undefined }
  })
}

export interface ConsumptionRow {
  item: StockItem
  prevQty: number
  received: number
  qty: number
  /** الاستهلاك بالفترة */
  used: number
}

export interface CountBatch {
  batchId: number
  countedAt: number
  /** تاريخ الجرد اللي قبل (بداية الفترة) */
  prevAt?: number
  rows: ConsumptionRow[]
  /** أصناف انجردت بس ما إلها جرد قبل (أول مرة) */
  firstTime: { item: StockItem; qty: number }[]
}

/** كل الجرودات، الأحدث أول، مع الاستهلاك من الجرد اللي قبل. */
export async function countHistory(): Promise<CountBatch[]> {
  const [items, counts, moves] = await Promise.all([
    db.stockItems.toArray(),
    db.stockCounts.orderBy('countedAt').toArray(),
    db.stockMoves.toArray(),
  ])
  const byId = new Map(items.map((i) => [i.id!, i]))
  const batches = new Map<number, StockCount[]>()
  for (const c of counts) batches.set(c.batchId, [...(batches.get(c.batchId) ?? []), c])

  const lastByItem = new Map<number, StockCount>()
  const result: CountBatch[] = []
  for (const [batchId, entries] of batches) {
    const countedAt = entries[0].countedAt
    const rows: ConsumptionRow[] = []
    const firstTime: CountBatch['firstTime'] = []
    let prevAt: number | undefined
    for (const c of entries) {
      const item = byId.get(c.stockItemId)
      if (!item) continue
      const prev = lastByItem.get(c.stockItemId)
      if (!prev) firstTime.push({ item, qty: c.qty })
      else {
        const received = moves
          .filter((m) => m.stockItemId === c.stockItemId && m.createdAt > prev.countedAt && m.createdAt <= c.countedAt)
          .reduce((s, m) => s + m.qty, 0)
        rows.push({ item, prevQty: prev.qty, received, qty: c.qty, used: prev.qty + received - c.qty })
        prevAt = Math.max(prevAt ?? 0, prev.countedAt)
      }
      lastByItem.set(c.stockItemId, c)
    }
    result.push({ batchId, countedAt, prevAt, rows, firstTime })
  }
  return result.reverse()
}

/** كميات المخزون: لحد رقمين بعد الفاصلة، وبدون أصفار زيادة (1.5 مش 1.50). */
export const formatQty = (n: number) => String(Math.round(n * 100) / 100)
