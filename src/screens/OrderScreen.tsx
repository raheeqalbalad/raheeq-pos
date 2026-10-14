import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { CafeTable, Item, LineOption, OrderLine } from '../db/types'
import {
  addItem,
  linesTotal,
  optionsLabel,
  paymentsTotal,
  setLineQty,
  moveOrder,
  voidOrder,
  type LineChangeResult,
  type OrderTarget,
} from '../lib/orders'
import { formatJod } from '../lib/money'
import { useSession } from '../lib/session'
import Header from '../components/Header'
import MenuBrowser from '../components/MenuBrowser'
import OptionsSheet from '../components/OptionsSheet'
import PaySheet from '../components/PaySheet'
import LineSheet from '../components/LineSheet'
import Sheet from '../components/Sheet'
import PaymentsList from '../components/PaymentsList'
import { refreshLoyaltyDiscount } from '../lib/customers'
import { useOwnerGate } from '../lib/useOwnerGate'

export type OrderScreenProps = {
  orderId?: number
  target: OrderTarget
  title: string
  onDone: (message?: string) => void
  /** بعد نقل الطلب لطاولة تانية */
  onMoved: (table: CafeTable, orderId: number) => void
}

const BELOW_PAID = 'ما بتقدر تنقّص، جزء من الفاتورة مدفوع'

export default function OrderScreen({ orderId: initialId, target, title, onDone, onMoved }: OrderScreenProps) {
  const { user } = useSession()
  const [orderId, setOrderIdState] = useState(initialId)
  // الكبس السريع أسرع من الـ render: بنمسك رقم الطلب بـ ref، وأول صنف بيفتح الطلب مرة وحدة بس.
  const idRef = useRef(initialId)
  const creating = useRef<Promise<number> | null>(null)
  const setOrderId = (id: number | undefined) => {
    idRef.current = id
    setOrderIdState(id)
  }
  const [optionsFor, setOptionsFor] = useState<Item | null>(null)
  const [editLine, setEditLine] = useState<OrderLine | null>(null)
  const [paying, setPaying] = useState(false)
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [moving, setMoving] = useState(false)
  const { requireOwner, sheet: ownerSheet } = useOwnerGate()
  const [panelOpen, setPanelOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const order = useLiveQuery(() => (orderId ? db.orders.get(orderId) : undefined), [orderId])
  const lines = useLiveQuery(
    () => (orderId ? db.orderLines.where('orderId').equals(orderId).sortBy('createdAt') : []),
    [orderId],
  )
  const payments = useLiveQuery(
    () => (orderId ? db.payments.where('orderId').equals(orderId).toArray() : []),
    [orderId],
  )

  const subtotal = linesTotal(lines ?? [])
  const discount = Math.min(order?.loyaltyDiscount ?? 0, subtotal)
  // المطلوب = الأصناف ناقص خصم الولاء
  const total = subtotal - discount
  const paid = paymentsTotal(payments ?? [])
  const count = (lines ?? []).reduce((s, l) => s + l.qty, 0)
  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const l of lines ?? []) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty)
    return m
  }, [lines])

  const displayTitle = order?.label ?? title
  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  async function add(item: Item, options: LineOption[]) {
    setOptionsFor(null)
    if (!idRef.current && creating.current) await creating.current
    if (idRef.current) {
      await addItem(idRef.current, target, item, options, user!.id!)
      await refreshLoyaltyDiscount(idRef.current)
      return
    }
    creating.current = addItem(undefined, target, item, options, user!.id!)
    try {
      setOrderId(await creating.current)
    } finally {
      creating.current = null
    }
  }

  function pick(item: Item) {
    if (item.options.length > 0) setOptionsFor(item)
    else add(item, [])
  }

  function handleLineResult(r: LineChangeResult) {
    if (idRef.current) refreshLoyaltyDiscount(idRef.current)
    if (r === 'below-paid') flash(BELOW_PAID)
    if (r === 'order-removed') setOrderId(undefined)
  }

  async function changeQty(line: OrderLine, delta: number) {
    handleLineResult(await setLineQty(line, line.qty + delta, user!.id!))
  }

  async function doVoid() {
    setConfirmVoid(false)
    if (!orderId) return
    const msg = `انلغى طلب ${displayTitle}`
    if (paid === 0) {
      if (await voidOrder(orderId, user!.id!)) onDone(msg)
      return
    }
    // عليه دفعات: بدها رمز المالك
    requireOwner(
      'إلغاء طلب مدفوع منه',
      async (ownerId) => {
        if (await voidOrder(orderId, user!.id!, ownerId)) onDone(msg)
      },
      <>
        على الطلب دفعات بقيمة <span className="num">{formatJod(paid)}</span> رح ترجع للزبون وما تنحسب.
      </>,
    )
  }

  async function doMove(table: CafeTable) {
    setMoving(false)
    if (!orderId) return
    if (await moveOrder(orderId, table)) onMoved(table, orderId)
    else flash(`${table.name} صارت مشغولة`)
  }

  const panel = (
    <div className="flex h-full min-h-0 flex-col bg-white/60">
      <div className="flex-1 overflow-y-auto">
        {!lines?.length ? (
          <p className="p-8 text-center text-ink/50">اكبس على صنف عشان تضيفه</p>
        ) : (
          <ul className="divide-y divide-cream-200">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setEditLine(l)} className="min-w-0 flex-1 py-1 text-start">
                  <div className="font-bold text-green">{l.nameSnapshot}</div>
                  {(l.options.length > 0 || l.note) && (
                    <div className="truncate text-xs text-ink/60">
                      {[optionsLabel(l.options), l.note].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="num text-xs text-ink/50">{formatJod(l.priceSnapshot * l.qty)}</div>
                </button>
                <div className="flex shrink-0 items-center gap-1" dir="ltr">
                  <button
                    type="button"
                    onClick={() => changeQty(l, -1)}
                    aria-label="نقّص"
                    className="size-12 rounded-xl bg-cream-200 text-2xl text-green active:bg-green-100"
                  >
                    −
                  </button>
                  <span className="num w-8 text-center text-lg font-bold">{l.qty}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(l, 1)}
                    aria-label="زيد"
                    className="size-12 rounded-xl bg-cream-200 text-2xl text-green active:bg-green-100"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {paid > 0 && orderId && (
          <section className="border-t border-cream-200 p-3">
            <h3 className="mb-2 text-sm font-bold text-green">الدفعات</h3>
            <PaymentsList orderId={orderId} />
          </section>
        )}
      </div>

      <div className="shrink-0 border-t border-cream-200 bg-cream p-3">
        {discount > 0 && (
          <div className="mb-1 flex justify-between text-sm font-bold text-green">
            <span>خصم ولاء</span>
            <span className="num">−{formatJod(discount)}</span>
          </div>
        )}
        {paid > 0 && (
          <div className="mb-1 flex justify-between text-sm text-ink/70">
            <span>مدفوع</span>
            <span className="num">{formatJod(paid)}</span>
          </div>
        )}
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-bold text-green">{paid > 0 ? 'الباقي' : 'المجموع'}</span>
          <span className="num font-display text-3xl text-green">{formatJod(total - paid)}</span>
        </div>
        <div className="flex gap-2">
          {orderId && (
            <button
              type="button"
              onClick={() => setConfirmVoid(true)}
              className="h-14 shrink-0 rounded-2xl px-4 font-medium text-red-800 active:bg-red-700/10"
            >
              إلغاء
            </button>
          )}
          <button
            type="button"
            disabled={!orderId || total === 0}
            onClick={() => setPaying(true)}
            className="h-14 flex-1 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
          >
            دفع
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <Header
        title={displayTitle}
        onBack={() => onDone()}
        extra={
          orderId && (
            <button
              type="button"
              onClick={() => setMoving(true)}
              className="h-12 shrink-0 rounded-xl border border-cream/30 px-4 active:bg-gold active:text-green"
            >
              نقل
            </button>
          )
        }
      />

      <div className="flex min-h-0 flex-1">
        <MenuBrowser onPick={pick} counts={counts} canToggle />
        <aside className="hidden w-[340px] shrink-0 border-s border-cream-200 md:block lg:w-[380px]">{panel}</aside>
      </div>

      {/* التلفون: شريط تحت فيه المجموع، وبيفتح الطلب كامل */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="flex h-16 shrink-0 items-center justify-between bg-green px-5 text-cream md:hidden"
      >
        <span className="font-bold">
          الطلب <span className="num">({count})</span>
        </span>
        <span className="num font-display text-2xl text-gold">{formatJod(total - paid)}</span>
      </button>
      {panelOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-cream md:hidden">
          <div className="flex h-16 shrink-0 items-center justify-between bg-green px-4 text-cream">
            <span className="font-display text-xl">{displayTitle}</span>
            <button type="button" onClick={() => setPanelOpen(false)} className="h-12 rounded-xl bg-green-700 px-4">
              رجوع للمنيو
            </button>
          </div>
          <div className="min-h-0 flex-1">{panel}</div>
        </div>
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-20 z-50 mx-auto w-fit rounded-xl bg-ink px-5 py-3 text-cream shadow-lg">
          {notice}
        </div>
      )}

      {optionsFor && <OptionsSheet item={optionsFor} onAdd={(o) => add(optionsFor, o)} onClose={() => setOptionsFor(null)} />}
      {editLine && <LineSheet line={editLine} onResult={handleLineResult} onClose={() => setEditLine(null)} />}
      {paying && orderId && (
        <PaySheet
          orderId={orderId}
          order={order}
          subtotal={subtotal}
          total={total}
          paid={paid}
          onClose={() => setPaying(false)}
          onPaidFull={() => onDone(`انْدفع ${displayTitle} ✓`)}
        />
      )}
      {moving && orderId && (
        <MoveSheet currentTableId={order?.tableId} onPick={doMove} onClose={() => setMoving(false)} />
      )}
      {ownerSheet}
      {confirmVoid && (
        <Sheet title="إلغاء الطلب؟" onClose={() => setConfirmVoid(false)}>
          <p className="mb-4 text-ink/70">
            الطلب رح ينلغى وما رح ينحسب بالمبيعات.
            {paid > 0 && ' عليه دفعات، فبده رمز المالك.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirmVoid(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button type="button" onClick={doVoid} className="h-14 rounded-xl bg-red-800 font-bold text-cream">
              إلغاء الطلب
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function MoveSheet({
  currentTableId,
  onPick,
  onClose,
}: {
  currentTableId?: number
  onPick: (t: CafeTable) => void
  onClose: () => void
}) {
  const free = useLiveQuery(async () => {
    const busy = new Set(
      (await db.orders.where('status').equals('open').toArray()).map((o) => o.tableId).filter(Boolean),
    )
    return (await db.cafeTables.orderBy('sort').toArray()).filter((t) => t.id !== currentTableId && !busy.has(t.id))
  }, [currentTableId])

  return (
    <Sheet title="نقل الطلب لـ" onClose={onClose}>
      {free?.length === 0 ? (
        <p className="text-center text-ink/60">كل الطاولات مشغولة</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {free?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              className="h-16 rounded-xl bg-white/80 font-bold text-green ring-1 ring-cream-200 active:bg-gold/40"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
