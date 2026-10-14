import Dexie, { type EntityTable } from 'dexie'
import type {
  CafeTable,
  Category,
  Expense,
  Item,
  Order,
  OptionList,
  OrderLine,
  Payment,
  PaymentCorrection,
  Shift,
  StockCount,
  StockItem,
  StockMove,
  User,
} from './types'

export const db = new Dexie('raheeq-pos') as Dexie & {
  users: EntityTable<User, 'id'>
  categories: EntityTable<Category, 'id'>
  items: EntityTable<Item, 'id'>
  cafeTables: EntityTable<CafeTable, 'id'>
  orders: EntityTable<Order, 'id'>
  orderLines: EntityTable<OrderLine, 'id'>
  payments: EntityTable<Payment, 'id'>
  paymentCorrections: EntityTable<PaymentCorrection, 'id'>
  shifts: EntityTable<Shift, 'id'>
  expenses: EntityTable<Expense, 'id'>
  stockItems: EntityTable<StockItem, 'id'>
  stockMoves: EntityTable<StockMove, 'id'>
  stockCounts: EntityTable<StockCount, 'id'>
  optionLists: EntityTable<OptionList, 'id'>
}

// ملاحظة: `db.tables` محجوز بـ Dexie، عشان هيك الطاولات اسمها cafeTables.
db.version(1).stores({
  users: '++id, role, pin',
  categories: '++id, sort',
  items: '++id, categoryId, active, isSeasonal',
  cafeTables: '++id, area, sort',
})

db.version(2).stores({
  orders: '++id, status, tableId, openedAt, closedAt',
  orderLines: '++id, orderId, itemId',
  payments: '++id, orderId, method, createdAt',
})

db.version(3).stores({
  payments: '++id, orderId, method, createdAt, shiftId',
  paymentCorrections: '++id, paymentId, orderId, at',
  shifts: '++id, openedAt',
  expenses: '++id, shiftId, createdAt',
})

db.version(4).stores({
  stockItems: '++id, sort',
  stockMoves: '++id, stockItemId, createdAt',
  stockCounts: '++id, batchId, stockItemId, countedAt',
})

export const HOOKAH_LIST_ID = 'hookah-flavors'

// نكهات الأرجيلة صارت قائمة وحدة مشتركة بين «أرجيلة» و«تغيير راس» (وأي صنف بينربط فيها).
db.version(5)
  .stores({ optionLists: 'id' })
  .upgrade(async (tx) => {
    const items = tx.table('items')
    const hookah = (await items.toArray()).find((i) => i.name === 'أرجيلة')
    const flavor = hookah?.options.find((g: { id: string }) => g.id === 'flavor')
    if (!flavor) return
    await tx.table('optionLists').add({ id: HOOKAH_LIST_ID, name: 'نكهات الأرجيلة', choices: flavor.choices })
    await items.toCollection().modify((item) => {
      if (item.name !== 'أرجيلة' && item.name !== 'تغيير راس') return
      item.options = item.options.map((g: { id: string }) =>
        g.id === 'flavor'
          ? { ...g, choices: [], listId: HOOKAH_LIST_ID, applyDeltas: item.name === 'أرجيلة' }
          : g,
      )
    })
  })
