// كل المبالغ بالـ fils كأعداد صحيحة (2.50 دينار = 2500).

export type Role = 'staff' | 'owner' | 'partner'

export interface User {
  id?: number
  name: string
  role: Role
  pin: string
  active: boolean
}

export interface Category {
  id?: number
  name: string
  sort: number
  active: boolean
}

export interface OptionChoice {
  id: string
  name: string
  /** فرق السعر بالـ fils (مثلًا تفاحتين نخلة +500) */
  priceDelta: number
  /** عنوان مجموعة للعرض فقط (مثلًا «علكة» تحت نكهات الأرجيلة) */
  group?: string
}

export interface OptionGroup {
  id: string
  name: string
  required: boolean
  /** إذا المجموعة مربوطة بقائمة مشتركة، هاي فاضية والخيارات بتيجي من القائمة */
  choices: OptionChoice[]
  /** قائمة خيارات مشتركة بين كذا صنف (مثلًا نكهات الأرجيلة) */
  listId?: string
  /** مع القائمة المشتركة: هل فروق الأسعار بتنطبق على هالصنف؟ */
  applyDeltas?: boolean
}

/** قائمة خيارات مشتركة: تعديلها بيبيّن بكل الأصناف المربوطة فيها. */
export interface OptionList {
  id: string
  name: string
  choices: OptionChoice[]
}

export interface Item {
  id?: number
  categoryId: number
  name: string
  description?: string
  price: number
  active: boolean
  isSeasonal: boolean
  sort: number
  options: OptionGroup[]
}

export type TableArea = 'balcony' | 'inside'

export interface CafeTable {
  id?: number
  name: string
  area: TableArea
  sort: number
}

export type OrderStatus = 'open' | 'paid' | 'void'

export interface Order {
  id?: number
  /** فاضي للتيك أواي */
  tableId?: number
  takeaway: boolean
  /** رقم التيك أواي باليوم (1، 2، 3...) */
  takeawayNo?: number
  /** اسم الطاولة وقت فتح الطلب، للعرض والتقارير */
  label: string
  status: OrderStatus
  openedAt: number
  closedAt?: number
  staffId: number
  /** مين ألغى الطلب (إذا انلغى) */
  voidedBy?: number
}

export interface LineOption {
  groupId: string
  groupName: string
  choice: string
  priceDelta: number
}

export interface OrderLine {
  id?: number
  orderId: number
  itemId: number
  nameSnapshot: string
  /** سعر الوحدة شامل فرق الخيارات، بالـ fils */
  priceSnapshot: number
  qty: number
  options: LineOption[]
  note?: string
  createdAt: number
}

export type PaymentMethod = 'cash' | 'cliq'

export interface Payment {
  id?: number
  orderId: number
  method: PaymentMethod
  amount: number
  createdAt: number
  staffId: number
  /** الشيفت اللي دخلت فيه المصاري على الدرج */
  shiftId: number
}

/** سجل تصحيح طريقة الدفع (كاش ↔ كليك). */
export interface PaymentCorrection {
  id?: number
  paymentId: number
  orderId: number
  from: PaymentMethod
  to: PaymentMethod
  byUserId: number
  at: number
}

export interface Shift {
  id?: number
  staffId: number
  openedAt: number
  openingCash: number
  closedAt?: number
  closedBy?: number
  countedCash?: number
}

/**
 * drawer: انصرف من الدرج (بينخصم من الكاش المتوقع).
 * outside: من برا الدرج (للمالك بس) — بيدخل بالتقارير بس ما بيأثر على الدرج.
 */
export type ExpenseSource = 'drawer' | 'outside'

export interface Expense {
  id?: number
  amount: number
  reason: string
  createdAt: number
  staffId: number
  shiftId: number
  /** فاضي = drawer (السجلات القديمة) */
  source?: ExpenseSource
}

// ===== المخزون (بسيط: استلام + جرد آخر الأسبوع) =====

export interface StockItem {
  id?: number
  name: string
  /** لتر، كيلو، علبة... */
  unit: string
  active: boolean
  sort: number
}

/** استلام بضاعة (دخل على المخزون) */
export interface StockMove {
  id?: number
  stockItemId: number
  qty: number
  /** المبلغ اللي انْدفع (fils)، إذا انكتب */
  cost?: number
  /** مصروف الدرج اللي انسجّل مع الاستلام */
  expenseId?: number
  note?: string
  createdAt: number
  staffId: number
}

/** جرد: كمية موجودة فعليًا. كل جرد كامل إله batchId واحد. */
export interface StockCount {
  id?: number
  batchId: number
  stockItemId: number
  qty: number
  countedAt: number
  staffId: number
}
