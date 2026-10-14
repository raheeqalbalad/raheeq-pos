import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { StockItem } from '../db/types'
import {
  addStockItem,
  countHistory,
  formatQty,
  receiveStock,
  saveCount,
  stockStatus,
  updateStockItem,
  type CountBatch,
} from '../lib/stock'
import { dayLabel } from '../lib/reports'
import { timeLabelOf } from '../lib/time'
import { useSession } from '../lib/session'
import { useRemote } from '../lib/cloud/useDeviceMode'
import Sheet from '../components/Sheet'
import MoneyInput from '../components/MoneyInput'
import { formatJod, toFils } from '../lib/money'

const parseQty = (text: string) => {
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

function QtyInput({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <input
      inputMode="decimal"
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      className="num h-14 w-full min-w-0 rounded-xl bg-white px-4 text-xl ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
    />
  )
}

export default function InventoryScreen() {
  const { user } = useSession()
  const remote = useRemote()
  const status = useLiveQuery(stockStatus, [])
  const history = useLiveQuery(countHistory, [])
  const recent = useLiveQuery(async () => {
    const [moves, items, users] = await Promise.all([
      db.stockMoves.orderBy('createdAt').reverse().limit(15).toArray(),
      db.stockItems.toArray(),
      db.users.toArray(),
    ])
    const item = new Map(items.map((i) => [i.id!, i]))
    const name = new Map(users.map((u) => [u.id!, u.name]))
    return moves.map((m) => ({ move: m, item: item.get(m.stockItemId), staff: name.get(m.staffId) }))
  }, [])

  const [receiving, setReceiving] = useState<StockItem | null>(null)
  const [counting, setCounting] = useState(false)
  const [managing, setManaging] = useState(false)
  const [batchIndex, setBatchIndex] = useState(0)

  const active = (status ?? []).filter((s) => s.item.active)
  const batch = history?.[batchIndex]

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {remote ? (
            <p className="flex-1 rounded-xl bg-gold/30 px-4 py-2 text-sm">من بعيد بتشوف بس. الاستلام والجرد بيصيروا من التابلت.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCounting(true)}
                className="h-14 rounded-2xl bg-gold px-6 text-lg font-bold text-green active:bg-gold-600"
              >
                جرد
              </button>
              <p className="flex-1 text-sm text-ink/60">
                كل ما توصل بضاعة اكبس «استلام» عالصنف. وآخر الأسبوع اعمل «جرد» واكتب الموجود فعليًا.
              </p>
              {user?.role === 'owner' && (
                <button
                  type="button"
                  onClick={() => setManaging(true)}
                  className="h-12 rounded-xl px-4 font-medium text-green ring-1 ring-green/20 active:bg-cream-200"
                >
                  أصناف المخزون
                </button>
              )}
            </>
          )}
        </div>

        {/* الوضع الحالي */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map(({ item, lastCount, receivedSince, expected }) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-2xl bg-white/70 p-4 ring-1 ring-cream-200">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-lg text-green">{item.name}</span>
                <span className="text-sm text-ink/50">{item.unit}</span>
              </div>
              <dl className="grid grid-cols-3 gap-1 text-center text-xs text-ink/60">
                <div>
                  <dt>آخر جرد</dt>
                  <dd className="num text-base font-bold text-ink">{lastCount ? formatQty(lastCount.qty) : '—'}</dd>
                </div>
                <div>
                  <dt>دخل بعده</dt>
                  <dd className="num text-base font-bold text-ink">{formatQty(receivedSince)}</dd>
                </div>
                <div className="rounded-lg bg-green-100">
                  <dt>المفروض هلق</dt>
                  <dd className="num text-base font-bold text-green">{expected !== undefined ? formatQty(expected) : '—'}</dd>
                </div>
              </dl>
              <p className="text-xs text-ink/50">
                {lastCount ? (
                  <>
                    جرد {dayLabel(lastCount.countedAt)} <span className="num">{timeLabelOf(lastCount.countedAt)}</span>
                  </>
                ) : (
                  'لسا ما انجرد'
                )}
              </p>
              <button
                type="button"
                onClick={() => setReceiving(item)}
                hidden={remote}
                className="h-12 rounded-xl bg-green font-bold text-cream active:bg-green-700"
              >
                + استلام
              </button>
            </div>
          ))}
        </div>

        {/* الاستهلاك */}
        <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 font-display text-xl text-green">الاستهلاك بين جردين</h2>
            {history && history.length > 1 && (
              <select
                value={batchIndex}
                onChange={(e) => setBatchIndex(Number(e.target.value))}
                className="h-12 rounded-xl bg-white px-3 ring-1 ring-cream-200"
              >
                {history.map((b, i) => (
                  <option key={b.batchId} value={i}>
                    جرد {dayLabel(b.countedAt)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {batch ? <Consumption batch={batch} /> : <p className="text-ink/50">بعد أول جردين بيبيّن قديش انصرف من كل صنف.</p>}
        </section>

        {/* آخر الاستلامات */}
        <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
          <h2 className="mb-3 font-display text-xl text-green">آخر الاستلامات</h2>
          {!recent?.length ? (
            <p className="text-ink/50">ما في استلامات لسا</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {recent.map(({ move, item, staff }) => (
                <li key={move.id} className="flex items-baseline gap-3 py-2">
                  <span className="w-28 shrink-0 text-xs text-ink/50">
                    {dayLabel(move.createdAt)} <span className="num">{timeLabelOf(move.createdAt)}</span>
                  </span>
                  <span className="flex-1">
                    <span className="font-bold text-green">{item?.name}</span>
                    {move.note && <span className="text-sm text-ink/60"> · {move.note}</span>}
                    <span className="text-sm text-ink/50"> · {staff}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="num font-bold">+{formatQty(move.qty)}</span> <span className="text-sm text-ink/60">{item?.unit}</span>
                    {move.cost !== undefined && (
                      <span className="block text-xs text-ink/50">
                        <span className="num">{formatJod(move.cost)}</span> {move.expenseId ? '· من الدرج' : '· مش من الدرج'}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {receiving && <ReceiveSheet item={receiving} onClose={() => setReceiving(null)} />}
      {counting && (
        <CountSheet
          rows={active.map((s) => ({ item: s.item, expected: s.expected }))}
          onClose={() => setCounting(false)}
          onSaved={() => {
            setCounting(false)
            setBatchIndex(0)
          }}
        />
      )}
      {managing && <ManageSheet items={(status ?? []).map((s) => s.item)} onClose={() => setManaging(false)} />}
    </main>
  )
}

function Consumption({ batch }: { batch: CountBatch }) {
  return (
    <div>
      <p className="mb-3 text-sm text-ink/60">
        {batch.prevAt ? (
          <>
            من جرد {dayLabel(batch.prevAt)} لجرد {dayLabel(batch.countedAt)}
          </>
        ) : (
          <>جرد {dayLabel(batch.countedAt)} (أول جرد)</>
        )}
      </p>
      {batch.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 text-ink/60">
                {['الصنف', 'الجرد اللي قبل', 'دخل', 'الجرد هلق', 'انصرف'].map((h) => (
                  <th key={h} className="px-2 py-2 text-start font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batch.rows.map((r) => (
                <tr key={r.item.id} className="border-b border-cream-200/60">
                  <td className="px-2 py-2 font-medium text-green">
                    {r.item.name} <span className="text-xs text-ink/50">({r.item.unit})</span>
                  </td>
                  {[r.prevQty, r.received, r.qty].map((v, i) => (
                    <td key={i} className="px-2 py-2">
                      <span className="num">{formatQty(v)}</span>
                    </td>
                  ))}
                  <td className={`px-2 py-2 font-bold ${r.used < 0 ? 'text-red-800' : 'text-green'}`}>
                    <span className="num">{formatQty(r.used)}</span>
                    {r.used < 0 && <span className="ms-2 text-xs font-normal">الجرد أكثر من المفروض، راجع الاستلامات</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {batch.firstTime.length > 0 && (
        <p className="mt-3 text-sm text-ink/60">
          أول جرد لـ: {batch.firstTime.map((f) => `${f.item.name} ${formatQty(f.qty)} ${f.item.unit}`).join('، ')}. الاستهلاك بيبيّن من الجرد الجاي.
        </p>
      )}
    </div>
  )
}

function ReceiveSheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { user } = useSession()
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [fromDrawer, setFromDrawer] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const value = parseQty(qty)
  const costFils = toFils(cost || 0)
  // من الدرج: المبلغ لازم، عشان ينسجّل مصروف
  const valid = !!value && (!fromDrawer || costFils > 0)

  async function save() {
    if (!valid) return
    try {
      await receiveStock(item, value!, user!.id!, { note, cost: costFils || undefined, fromDrawer })
      onClose()
    } catch {
      setError('ما انسجل. لازم يكون في شيفت مفتوح عشان ينسجّل مصروف الدرج')
    }
  }

  return (
    <Sheet title={`استلام ${item.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">الكمية ({item.unit})</span>
          <QtyInput value={qty} onChange={setQty} autoFocus />
        </label>

        <div>
          <span className="mb-1 block font-bold text-green">انصرفت من الدرج؟</span>
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setFromDrawer(v)}
                className={`h-12 rounded-xl font-medium ${
                  fromDrawer === v ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
                }`}
              >
                {v ? 'آه' : 'لا'}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">المبلغ {fromDrawer ? '' : '(اختياري)'}</span>
          <MoneyInput value={cost} onChange={setCost} />
          <span className="text-xs text-ink/50">
            {fromDrawer ? 'رح ينسجّل مصروف درج لحاله بنفس المبلغ.' : 'استلام بس، بدون مصروف درج.'}
          </span>
        </label>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظة (اختياري): مثلًا من وين"
          className="h-14 rounded-xl bg-white px-4 ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
        />
        {error && <p className="text-center text-red-700">{error}</p>}
        <button
          type="button"
          disabled={!valid}
          onClick={save}
          className="h-14 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
        >
          سجّل الاستلام
        </button>
      </div>
    </Sheet>
  )
}

function CountSheet({
  rows,
  onClose,
  onSaved,
}: {
  rows: { item: StockItem; expected?: number }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useSession()
  const [values, setValues] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const entries = rows.flatMap(({ item }) => {
    const v = parseQty(values[item.id!] ?? '')
    return v === null ? [] : [{ stockItemId: item.id!, qty: v }]
  })
  const missing = rows.length - entries.length

  async function save() {
    if (!entries.length || busy) return
    setBusy(true)
    await saveCount(entries, user!.id!)
    onSaved()
  }

  return (
    <Sheet title="جرد المخزون" onClose={onClose} wide>
      <p className="mb-4 text-ink/60">عدّ الموجود فعليًا واكتبه. الرقم الباهت هو المفروض حسب آخر جرد والاستلامات.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ item, expected }) => (
          <label key={item.id} className="flex items-center gap-3 rounded-xl bg-white/70 p-3 ring-1 ring-cream-200">
            <span className="w-24 shrink-0">
              <span className="block font-bold text-green">{item.name}</span>
              <span className="text-xs text-ink/50">{item.unit}</span>
            </span>
            <QtyInput
              value={values[item.id!] ?? ''}
              onChange={(v) => setValues((s) => ({ ...s, [item.id!]: v }))}
              placeholder={expected !== undefined ? formatQty(expected) : 'الكمية'}
            />
          </label>
        ))}
      </div>
      {missing > 0 && entries.length > 0 && (
        <p className="mt-3 text-sm text-ink/60">
          <span className="num">{missing}</span> صنف ما انكتبله رقم، فما رح ينجرد هالمرة.
        </p>
      )}
      <button
        type="button"
        disabled={!entries.length || busy}
        onClick={save}
        className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
      >
        احفظ الجرد
      </button>
    </Sheet>
  )
}

function ManageSheet({ items, onClose }: { items: StockItem[]; onClose: () => void }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const valid = name.trim() && unit.trim()

  return (
    <Sheet title="أصناف المخزون" onClose={onClose}>
      <ul className="mb-5 flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className={`flex items-center gap-2 ${i.active ? '' : 'opacity-50'}`}>
            <input
              defaultValue={i.name}
              onBlur={(e) => e.target.value.trim() && updateStockItem(i.id!, { name: e.target.value.trim() })}
              className="h-12 min-w-0 flex-1 rounded-xl bg-white px-3 ring-1 ring-cream-200"
            />
            <input
              defaultValue={i.unit}
              onBlur={(e) => e.target.value.trim() && updateStockItem(i.id!, { unit: e.target.value.trim() })}
              className="h-12 w-24 rounded-xl bg-white px-3 ring-1 ring-cream-200"
            />
            <button
              type="button"
              onClick={() => updateStockItem(i.id!, { active: !i.active })}
              className="h-12 w-20 shrink-0 rounded-xl bg-cream-200 text-sm text-green active:bg-green-100"
            >
              {i.active ? 'إخفاء' : 'رجّعه'}
            </button>
          </li>
        ))}
      </ul>
      <h3 className="mb-2 font-bold text-green">صنف جديد</h3>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="الاسم (مثلًا: ثلج)"
          className="h-14 min-w-0 flex-1 rounded-xl bg-white px-3 ring-1 ring-cream-200"
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="الوحدة"
          className="h-14 w-24 rounded-xl bg-white px-3 ring-1 ring-cream-200"
        />
      </div>
      <button
        type="button"
        disabled={!valid}
        onClick={async () => {
          await addStockItem(name, unit)
          setName('')
          setUnit('')
        }}
        className="mt-3 h-14 w-full rounded-2xl bg-gold font-bold text-green active:bg-gold-600 disabled:opacity-40"
      >
        ضيف
      </button>
    </Sheet>
  )
}
