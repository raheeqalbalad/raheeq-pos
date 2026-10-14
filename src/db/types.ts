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
  /** وقت الإلغاء. إلغاء طلب مسكّر من سجل الأيام ما بيغيّر closedAt (عشان يضل بيومه) */
  voidedAt?: number
  /** الزبون المسجّل (رقم التلفون) */
  customerId?: number
  /** خصم الولاء بالـ fils (سطر واضح بالفاتورة) */
  loyaltyDiscount?: number
  /** عدد الزباين على الطاولة (اختياري) */
  guests?: Guests
  /** خصم يدوي (منفصل عن خصم الولاء) */
  manualDiscount?: ManualDiscount
}

export interface ManualDiscount {
  /** قيمة الخصم بالـ fils */
  amount: number
  /** إذا الخصم نسبة: بيتحسب من جديد إذا تغيّرت الأصناف */
  pct?: number
  reason: string
  byUserId: number
  /** إذا أكثر من المسموح للموظف: رمز المالك */
  approvedBy?: number
  at: number
}

export interface DiscountSettings {
  /** أقصى نسبة بيعطيها الموظف لحاله (أكثر بده رمز المالك) */
  staffMaxPct: number
}

export interface Guests {
  men: number
  women: number
  kids: number
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
  /** الكليك على حساب مين: id حساب من الإعدادات، أو `staff:<userId>` للموظف اللي فاتح الشيفت */
  cliqAccount?: string
  /** اسم الحساب وقت الدفع (للعرض والتقارير) */
  cliqAccountName?: string
}

/** حساب كليك (المالك بيضيفه ويسمّيه من الإعدادات) */
export interface CliqAccount {
  id: string
  name: string
  active: boolean
}

export interface CliqSettings {
  accounts: CliqAccount[]
  /** الحساب التلقائي لما الموظف يختار كليك */
  defaultId: string
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
  /** العدّ الأعمى: بينحفظ أول ما الموظف يأكّد العدّ (قبل ما يشوف المفروض) */
  countedCash?: number
  countedAt?: number
  countedBy?: number
  /** اللي انترك بالدرج للشيفت الجاي. الباقي (المعدود − المتروك) انسحب. */
  leftInDrawer?: number
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

// ===== سجل التعديلات (مين عدّل شو ومتى، وشو كان قبل) =====

export type AuditKind = 'line' | 'void' | 'payment' | 'expense-edit' | 'expense-delete' | 'discount' | 'recount'

export interface AuditEntry {
  id?: number
  at: number
  byUserId: number
  kind: AuditKind
  /** وصف قصير بالعربي للعرض */
  summary: string
  /** يوم الشغل اللي بيخصّه التعديل (عشان يبيّن بسجل ذاك اليوم) */
  shiftId?: number
  orderId?: number
  /** قيمة اللي انشال أو انلغى بالـ fils (لتقرير الإلغاءات لكل موظف) */
  amount?: number
  /** مين وافق (رمز المالك)، إذا التعديل بده موافقة */
  approvedBy?: number
  before?: unknown
  after?: unknown
}

// ===== الزباين وكرت الولاء =====

export interface Customer {
  id?: number
  /** رقم أردني موحّد: 07XXXXXXXX */
  phone: string
  name?: string
  /** موافق ينبعتله عروض (التصدير للموافقين بس) */
  marketingOptIn: boolean
  createdAt: number
}

export interface LoyaltySettings {
  enabled: boolean
  /** كم زيارة قبل الخصم (5 → السادسة عليها خصم) */
  visitsNeeded: number
  /** نسبة الخصم على الفاتورة كاملة */
  discountPct: number
  /** أقصى خصم بالـ fils */
  maxDiscount: number
  /** أقل طلب بينحسب زيارة، بالـ fils */
  minOrder: number
}

export interface Setting {
  key: string
  value: unknown
}
