import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  allShifts,
  buildReport,
  dayLabel,
  hourLabel,
  hourOrder,
  itemMargin,
  itemProfit,
  monthKey,
  monthLabel,
  wipeSalesData,
  type HourRow,
  type ItemRow,
  type Report,
} from '../lib/reports'
import { exportWorkbook } from '../lib/exportXlsx'
import { downloadBackup, readBackup, restoreBackup, type BackupInfo } from '../lib/backup'
import { formatJod } from '../lib/money'
import { timeLabelOf } from '../lib/time'
import { useSession } from '../lib/session'
import { useOwnerGate } from '../lib/useOwnerGate'
import Sheet from '../components/Sheet'
import GoalCard from '../components/GoalCard'

// ألوان الرسوم (متأكد منها بفاحص عمى الألوان، ومعها أسماء ظاهرة دايمًا)
const CASH = '#1F8A5E'
const CLIQ = '#C9822A'

type Mode = 'day' | 'month' | 'all'

/** عزل نص إنجليزي (أوقات وأرقام) جوا نص عربي، للأماكن اللي ما بتقبل span */
const ltr = (text: string) => `\u2066${text}\u2069`

export default function ReportsScreen() {
  const { user } = useSession()
  const shifts = useLiveQuery(allShifts, [])
  const [mode, setMode] = useState<Mode>('day')
  const [dayId, setDayId] = useState<number>()
  const [month, setMonth] = useState<string>()

  const months = [...new Set((shifts ?? []).map((s) => monthKey(s.openedAt)))]
  const selectedDay = dayId ?? shifts?.[0]?.id
  const selectedMonth = month ?? months[0]

  const chosen =
    mode === 'day'
      ? (shifts ?? []).filter((s) => s.id === selectedDay)
      : mode === 'month'
        ? (shifts ?? []).filter((s) => monthKey(s.openedAt) === selectedMonth)
        : (shifts ?? [])
  const key = `${mode}|${chosen.map((s) => `${s.id}:${s.closedAt ?? ''}`).join(',')}`
  const report = useLiveQuery(() => buildReport(chosen), [key])

  if (!shifts) return null
  if (!shifts.length)
    return (
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-5xl">
          <GoalCard canEdit={user?.role === 'owner'} />
        </div>
        <p className="p-10 text-center text-ink/50">لسا ما في أيام شغل. التقارير بتبيّن بعد أول شيفت.</p>
        <Tools canWipe={user?.role === 'owner'} />
      </main>
    )

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <GoalCard canEdit={user?.role === 'owner'} />
        {/* الفترة */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['day', 'يوم شغل'],
              ['month', 'شهر'],
              ['all', 'كل الفترة'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-12 rounded-xl px-5 font-medium ${
                mode === m ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'
              }`}
            >
              {label}
            </button>
          ))}
          {mode === 'day' && (
            <select
              value={selectedDay}
              onChange={(e) => setDayId(Number(e.target.value))}
              className="h-12 min-w-0 flex-1 rounded-xl bg-white px-3 ring-1 ring-cream-200"
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {dayLabel(s.openedAt)} · {s.closedAt ? ltr(`${timeLabelOf(s.openedAt)}–${timeLabelOf(s.closedAt)}`) : `${ltr(timeLabelOf(s.openedAt))} (مفتوح)`}
                </option>
              ))}
            </select>
          )}
          {mode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setMonth(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl bg-white px-3 ring-1 ring-cream-200"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}
        </div>

        {report && <ReportBody report={report} mode={mode} />}
        <Tools canWipe={user?.role === 'owner'} />
      </div>
    </main>
  )
}

function Tile({ label, value, sub, accent = false }: { label: string; value: string; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? 'bg-green text-cream' : 'bg-white/70 ring-1 ring-cream-200'}`}>
      <div className={`text-sm ${accent ? 'opacity-70' : 'text-ink/60'}`}>{label}</div>
      <div className={`num font-display text-2xl ${accent ? 'text-gold' : 'text-green'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink/50">{sub}</div>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-3 font-display text-xl text-green">{title}</h2>
      {children}
    </section>
  )
}

function ReportBody({ report, mode }: { report: Report; mode: Mode }) {
  const t = report.totals
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="الدخل"
          value={formatJod(t.sales)}
          accent
          sub={
            t.loyalty > 0 && (
              <span className="text-cream/70">
                بعد خصم ولاء <span className="num">{formatJod(t.loyalty)}</span>
              </span>
            )
          }
        />
        <Tile
          label="المصاريف"
          value={formatJod(t.expenses + t.outside)}
          sub={
            t.outside > 0 && (
              <>
                درج <span className="num">{formatJod(t.expenses)}</span> · من برا <span className="num">{formatJod(t.outside)}</span>
              </>
            )
          }
        />
        <Tile label="الصافي" value={formatJod(t.net)} accent />
        <Tile
          label="الطلبات"
          value={String(t.orders)}
          sub={
            t.orders > 0 && (
              <>
                معدّل الطلب <span className="num">{formatJod(t.sales / t.orders)}</span>
              </>
            )
          }
        />
      </div>

      <Card title="كاش مقابل كليك">
        <CashCliq cash={t.cash} cliq={t.cliq} />
        {report.cliqSplit.length > 0 && (
          <div className="mt-4 border-t border-cream-200 pt-3">
            <h3 className="mb-2 text-sm font-bold text-green">الكليك حسب الحساب</h3>
            <ul className="flex flex-col gap-1">
              {report.cliqSplit.map((r) => (
                <li key={`${r.isStaff}${r.name}`} className="flex items-baseline justify-between rounded-lg px-3 py-1.5">
                  <span>{r.isStaff ? `${r.name} (على حساب الموظف، بيتحط كاش بالدرج)` : r.name}</span>
                  <span className="num">{formatJod(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="الزباين">
        <Guests totals={t} hours={report.hours} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="أكثر الأصناف مبيعًا">
          <TopItems items={report.items} />
        </Card>
        <Card title="أقوى الساعات">
          <Hours hours={report.hours} />
        </Card>
      </div>

      <Card title="العروض">
        {report.offers.length ? (
          <Table
            head={['العرض', 'كم انباع', 'المبيعات']}
            rows={report.offers.map((o) => [o.name, String(o.qty), formatJod(o.revenue)])}
          />
        ) : (
          <p className="text-ink/50">ما في عروض</p>
        )}
      </Card>

      <Card title="الأصناف: الأكثر مبيعًا مقابل الأكثر ربحًا">
        <ItemProfits items={report.items} />
      </Card>

      {mode === 'all' && report.months.length > 0 && (
        <Card title="دخل كل شهر">
          <Table
            head={['الشهر', 'أيام', 'كاش', 'كليك', 'الدخل', 'مصاريف', 'الصافي']}
            rows={report.months.map((m) => [
              monthLabel(m.key),
              String(m.days),
              formatJod(m.cash),
              formatJod(m.cliq),
              formatJod(m.sales),
              formatJod(m.expenses + m.outside),
              formatJod(m.net),
            ])}
          />
        </Card>
      )}

      {mode !== 'day' && (
        <Card title="دخل كل يوم شغل">
          <Table
            head={['اليوم', 'كاش', 'كليك', 'الدخل', 'مصاريف', 'الصافي', 'زباين', 'فرق الدرج', 'المسحوب']}
            rows={report.days.map((d) => [
              `${dayLabel(d.shift.openedAt)}${d.shift.closedAt ? '' : ' (مفتوح)'}`,
              formatJod(d.cash),
              formatJod(d.cliq),
              formatJod(d.sales),
              formatJod(d.expenses + d.outside),
              formatJod(d.net),
              String(d.men + d.women + d.kids || '—'),
              d.drawerDiff === undefined ? '—' : d.drawerDiff === 0 ? '✓' : `${d.drawerDiff > 0 ? '+' : '−'}${formatJod(Math.abs(d.drawerDiff))}`,
              d.withdrawn === undefined ? '—' : formatJod(d.withdrawn),
            ])}
          />
        </Card>
      )}

      <Card title="فروقات الدرج حسب الموظف">
        <DrawerByStaff rows={report.drawerByStaff} days={report.days} />
      </Card>

      <Card title="الخصومات">
        <Discounts loyalty={t.loyalty} manual={t.manual} rows={report.manualDiscounts} />
      </Card>

      <Card title="الإلغاءات وشيل الأصناف حسب الموظف">
        <Cancellations rows={report.cancellations} />
      </Card>

      <Card title="المصاريف">
        {report.expenseReasons.length === 0 ? (
          <p className="text-ink/50">ما في مصاريف بهالفترة</p>
        ) : (
          <Table
            head={['السبب', 'من وين', 'كم مرة', 'المبلغ']}
            rows={report.expenseReasons.map((r) => [
              r.reason,
              r.source === 'outside' ? 'برا الدرج' : 'الدرج',
              String(r.count),
              formatJod(r.amount),
            ])}
          />
        )}
      </Card>
    </>
  )
}

function CashCliq({ cash, cliq }: { cash: number; cliq: number }) {
  const total = cash + cliq
  if (!total) return <p className="text-ink/50">ما في مبيعات</p>
  const parts = [
    { label: 'كاش', value: cash, color: CASH },
    { label: 'كليك', value: cliq, color: CLIQ },
  ]
  return (
    <div>
      <div className="flex h-6 gap-0.5 overflow-hidden rounded-md" role="img" aria-label={`كاش ${formatJod(cash)}، كليك ${formatJod(cliq)}`}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: p.color }} />
            <span className="font-medium">{p.label}</span>
            <span className="num font-display text-lg text-green">{formatJod(p.value)}</span>
            <span className="num text-sm text-ink/50">{Math.round((p.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopItems({ items }: { items: ItemRow[] }) {
  const [all, setAll] = useState(false)
  if (!items.length) return <p className="text-ink/50">ما في مبيعات</p>
  const shown = all ? items : items.slice(0, 10)
  const max = items[0].qty
  return (
    <div>
      <ul className="flex flex-col gap-2">
        {shown.map((i, idx) => (
          <li key={i.name} className="grid grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]">
            <span className="truncate text-sm font-medium">
              <span className="num text-ink/40">{idx + 1}. </span>
              {i.name}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-5 rounded-e-[4px]" style={{ width: `${Math.max((i.qty / max) * 70, 2)}%`, background: CASH }} />
              <span className="num text-sm font-bold whitespace-nowrap">{i.qty}</span>
              <span className="num text-xs whitespace-nowrap text-ink/50">{formatJod(i.revenue)}</span>
            </div>
          </li>
        ))}
      </ul>
      {items.length > 10 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-3 h-12 rounded-xl px-4 text-green active:bg-cream-200">
          {all ? 'أقل' : `كل الأصناف (${items.length})`}
        </button>
      )}
    </div>
  )
}

const pctText = (m: number | undefined) => (m === undefined ? '—' : `${Math.round(m * 100)}%`)

/** الربح = السعر − التكلفة (قبل الخصومات والمصاريف). الصنف بدون تكلفة ما بينحسب. */
function ItemProfits({ items }: { items: ItemRow[] }) {
  const [all, setAll] = useState(false)
  if (!items.length) return <p className="text-ink/50">ما في مبيعات</p>
  const costed = items.filter((i) => i.costedQty > 0)
  const noCost = items.filter((i) => i.costedQty === 0)
  const partial = items.some((i) => i.costedQty > 0 && i.costedQty < i.qty)
  const profit = costed.reduce((s, i) => s + itemProfit(i)!, 0)
  const revenue = costed.reduce((s, i) => s + i.costedRevenue, 0)
  const topSold = items.slice(0, 5)
  const topProfit = [...costed].sort((a, b) => itemProfit(b)! - itemProfit(a)!).slice(0, 5)
  const profitText = (i: ItemRow) => {
    const p = itemProfit(i)
    return p === undefined ? 'بدون تكلفة' : `${formatJod(p)}${i.costedQty < i.qty ? '*' : ''}`
  }

  return (
    <div className="flex flex-col gap-4">
      {costed.length ? (
        <p className="text-ink/70">
          ربح الأصناف <span className="num font-display text-2xl text-green">{formatJod(profit)}</span> · نسبة الربح{' '}
          <span className="num font-bold text-green">{pctText(revenue ? profit / revenue : undefined)}</span>
          <span className="text-sm text-ink/50"> (قبل الخصومات والمصاريف)</span>
        </p>
      ) : (
        <p className="rounded-xl bg-gold/30 px-4 py-2 text-sm">ما في أصناف إلها تكلفة. حط التكلفة من «المنيو» عشان يبيّن الربح.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-bold text-green">الأكثر مبيعًا</h3>
          <Table head={['الصنف', 'الكمية', 'الربح']} rows={topSold.map((i) => [i.name, String(i.qty), profitText(i)])} />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold text-green">الأكثر ربحًا</h3>
          {topProfit.length ? (
            <Table
              head={['الصنف', 'الربح', 'النسبة']}
              rows={topProfit.map((i) => [i.name, profitText(i), pctText(itemMargin(i))])}
            />
          ) : (
            <p className="text-sm text-ink/50">—</p>
          )}
        </div>
      </div>
      {noCost.length > 0 && (
        <p className="text-sm text-ink/60">
          بدون تكلفة (ما انحسبوا بالربح): {noCost.map((i) => i.name).join('، ')}
        </p>
      )}
      {partial && <p className="text-xs text-ink/50">* جزء من مبيعات الصنف ما إله تكلفة، فالربح من الجزء اللي إله تكلفة بس.</p>}
      <div>
        <button type="button" onClick={() => setAll((a) => !a)} className="h-12 rounded-xl px-4 text-green ring-1 ring-green/20 active:bg-cream-200">
          {all ? 'خبّي الجدول' : `جدول كل الأصناف (${items.length})`}
        </button>
        {all && (
          <div className="mt-2">
            <Table
              head={['الصنف', 'الكمية', 'المبيعات', 'التكلفة', 'الربح', 'النسبة']}
              rows={items.map((i) => [
                i.name,
                String(i.qty),
                formatJod(i.revenue),
                i.costedQty ? formatJod(i.cost) : 'بدون تكلفة',
                itemProfit(i) === undefined ? '—' : profitText(i),
                pctText(itemMargin(i)),
              ])}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Hours({ hours }: { hours: HourRow[] }) {
  const [picked, setPicked] = useState<number | null>(null)
  if (!hours.length) return <p className="text-ink/50">ما في مبيعات</p>
  // من 9 الصبح لـ 1 بالليل، وأي ساعة برا هالمدى فيها بيع
  const set = new Set([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, ...hours.map((h) => h.hour)])
  const range = [...set].sort((a, b) => hourOrder(a) - hourOrder(b))
  const by = new Map(hours.map((h) => [h.hour, h]))
  const max = Math.max(...hours.map((h) => h.sales))
  const best = hours.reduce((a, b) => (b.sales > a.sales ? b : a))
  const shown = picked !== null ? by.get(picked) : best

  return (
    <div>
      <p className="mb-3 text-sm text-ink/70">
        {picked === null ? 'الأقوى: ' : ''}
        <span className="num font-bold text-green">{hourLabel(shown?.hour ?? picked!)}</span>
        {' · '}
        <span className="num">{shown?.orders ?? 0}</span> طلب · <span className="num">{formatJod(shown?.sales ?? 0)}</span>
      </p>
      <div className="flex h-40 items-end gap-0.5 border-b border-cream-200" dir="ltr">
        {range.map((h) => {
          const row = by.get(h)
          const height = row ? Math.max((row.sales / max) * 100, 3) : 0
          return (
            <button
              key={h}
              type="button"
              onClick={() => setPicked(picked === h ? null : h)}
              aria-label={`${hourLabel(h)}: ${row?.orders ?? 0} طلب، ${formatJod(row?.sales ?? 0)}`}
              className="flex h-full flex-1 items-end justify-center"
            >
              <div
                className="w-full max-w-6 rounded-t-[4px] transition-opacity"
                style={{
                  height: `${height}%`,
                  background: CASH,
                  opacity: picked === null ? (h === best.hour ? 1 : 0.55) : picked === h ? 1 : 0.35,
                }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-0.5" dir="ltr">
        {range.map((h) => (
          <span key={h} className="num flex-1 text-center text-[10px] text-ink/50">
            {h % 3 === 0 || h === 1 ? h : ''}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/50">الساعة حسب وقت فتح الطلب. اكبس على أي عمود عشان تشوف أرقامه.</p>
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-200 text-ink/60">
            {head.map((h) => (
              <th key={h} className="px-2 py-2 text-start font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-cream-200/60">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-2 whitespace-nowrap ${j === 0 ? 'font-medium text-green' : ''}`}>
                  {j === 0 ? c : <span className="num">{c}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** تصدير الإكسل (للمالك والشريك)، ومسح بيانات التجربة (للمالك بس). */
function Tools({ canWipe }: { canWipe: boolean }) {
  const { requireOwner, sheet } = useOwnerGate()
  const [busy, setBusy] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [message, setMessage] = useState('')

  async function doExport() {
    setBusy(true)
    try {
      await exportWorkbook()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-cream-200 p-4">
      <button
        type="button"
        disabled={busy}
        onClick={doExport}
        className="h-14 rounded-2xl bg-gold px-6 text-lg font-bold text-green active:bg-gold-600 disabled:opacity-50"
      >
        تصدير إكسل
      </button>
      <span className="flex-1 text-sm text-ink/60">ملف فيه شيت «الحساب» بنفس أعمدة شيت الماستر، وأيام الشغل والأصناف والساعات والمصاريف.</span>
      {canWipe && (
        <button
          type="button"
          onClick={() => setConfirmWipe(true)}
          className="h-12 rounded-xl px-4 text-sm font-medium text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
        >
          مسح بيانات التجربة
        </button>
      )}
      {canWipe && <BackupTools />}
      {message && <p className="w-full text-center font-bold text-green">{message}</p>}

      {confirmWipe && (
        <Sheet title="مسح بيانات التجربة؟" onClose={() => setConfirmWipe(false)}>
          <p className="mb-2 text-ink/70">رح ينمسح نهائيًا: كل الطلبات والدفعات والشيفتات ومصاريف الدرج وحركات المخزون.</p>
          <p className="mb-4 text-ink/70">المنيو والأسعار والطاولات والمستخدمين بيضلّوا.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirmWipe(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmWipe(false)
                requireOwner('مسح بيانات التجربة', async () => {
                  await wipeSalesData()
                  setMessage('انمسحت بيانات التجربة ✓')
                })
              }}
              className="h-14 rounded-xl bg-red-800 font-bold text-cream"
            >
              امسح
            </button>
          </div>
        </Sheet>
      )}
      {sheet}
    </section>
  )
}

const TABLE_LABEL: Record<string, string> = {
  items: 'صنف',
  orders: 'طلب',
  payments: 'دفعة',
  shifts: 'شيفت',
  expenses: 'مصروف',
  stockMoves: 'استلام',
}

/** تنزيل نسخة احتياطية واسترجاعها (للمالك). */
function BackupTools() {
  const { requireOwner, sheet } = useOwnerGate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ backup: Parameters<typeof restoreBackup>[0]; info: BackupInfo } | null>(null)
  const [error, setError] = useState('')

  async function pick(file: File | undefined) {
    setError('')
    if (!file) return
    try {
      setPending(await readBackup(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما قدرت أقرا الملف')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3 border-t border-cream-200 pt-3">
      <button
        type="button"
        onClick={downloadBackup}
        className="h-12 rounded-xl bg-green px-5 font-bold text-cream active:bg-green-700"
      >
        تنزيل نسخة احتياطية
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="h-12 rounded-xl px-5 font-medium text-green ring-1 ring-green/30 active:bg-cream-200"
      >
        استرجاع نسخة
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <span className="flex-1 text-sm text-ink/60">نزّل نسخة كل يوم أو أسبوع، وخبّيها برا التابلت (إيميل أو درايف).</span>
      {error && <p className="w-full text-center font-bold text-red-700">{error}</p>}

      {pending && (
        <Sheet title="استرجاع النسخة؟" onClose={() => setPending(null)}>
          <p className="mb-2 text-ink/70">
            نسخة من {dayLabel(pending.info.exportedAt)} الساعة <span className="num">{timeLabelOf(pending.info.exportedAt)}</span>، فيها:
          </p>
          <ul className="mb-3 flex flex-wrap gap-2">
            {Object.entries(TABLE_LABEL).map(([k, label]) => (
              <li key={k} className="rounded-lg bg-cream-200 px-3 py-1 text-sm">
                <span className="num font-bold">{pending.info.counts[k] ?? 0}</span> {label}
              </li>
            ))}
          </ul>
          <p className="mb-4 font-bold text-red-800">كل البيانات اللي على هالجهاز هلق رح تنمسح وتنحط النسخة مكانها.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setPending(null)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button
              type="button"
              onClick={() => {
                const { backup } = pending
                setPending(null)
                requireOwner('استرجاع نسخة احتياطية', async () => {
                  try {
                    await restoreBackup(backup)
                    location.reload()
                  } catch {
                    setError('ما زبط الاسترجاع، وما تغيّر اشي')
                  }
                })
              }}
              className="h-14 rounded-xl bg-red-800 font-bold text-cream"
            >
              استرجع
            </button>
          </div>
        </Sheet>
      )}
      {sheet}
    </div>
  )
}

/** فرق الدرج بينسجّل على الموظف اللي فاتح الشيفت. زيادة بالأخضر، نقص بالأحمر. */
function DrawerByStaff({ rows, days }: { rows: Report['drawerByStaff']; days: Report['days'] }) {
  const names = useLiveQuery(async () => new Map((await db.users.toArray()).map((u) => [u.id!, u.name])), [])
  if (!rows.length) return <p className="text-ink/50">ما في شيفتات مسكّرة بهالفترة</p>
  const signed = (v: number) => (
    <span className={`num font-bold ${v > 0 ? 'text-emerald-800' : v < 0 ? 'text-red-800' : 'text-green'}`}>
      {v === 0 ? '✓' : `${v > 0 ? '+' : '−'}${formatJod(Math.abs(v))}`}
    </span>
  )
  const months = [...new Set(rows.map((r) => r.month))]
  const diffs = days.filter((d) => d.drawerDiff)
  return (
    <div className="flex flex-col gap-4">
      {months.map((m) => (
        <div key={m}>
          <h3 className="mb-1 text-sm font-bold text-green">{monthLabel(m)}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-200 text-ink/60">
                  {['الموظف', 'شيفتات', 'زيادة', 'نقص', 'الصافي'].map((h) => (
                    <th key={h} className="px-2 py-2 text-start font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.month === m)
                  .map((r) => (
                    <tr key={r.userId} className="border-b border-cream-200/60">
                      <td className="px-2 py-2 font-medium whitespace-nowrap text-green">{names?.get(r.userId) ?? '—'}</td>
                      <td className="px-2 py-2">
                        <span className="num">{r.shifts}</span>
                      </td>
                      <td className="px-2 py-2">{r.over ? signed(r.over) : <span className="num text-ink/40">0.00</span>}</td>
                      <td className="px-2 py-2">{r.short ? signed(-r.short) : <span className="num text-ink/40">0.00</span>}</td>
                      <td className="px-2 py-2">{signed(r.over - r.short)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {diffs.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold text-green">كل فرق لحاله</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {diffs.map((d) => (
              <li key={d.shift.id} className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 odd:bg-cream-200/50">
                <span>
                  {dayLabel(d.shift.openedAt)} · {names?.get(d.shift.staffId) ?? '—'}
                </span>
                {signed(d.drawerDiff!)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Cancellations({ rows }: { rows: Report['cancellations'] }) {
  const names = useLiveQuery(async () => new Map((await db.users.toArray()).map((u) => [u.id!, u.name])), [])
  if (!rows.length) return <p className="text-ink/50">ما في إلغاءات ولا شيل أصناف بهالفترة</p>
  return (
    <Table
      head={['الموظف', 'طلبات ملغية', 'قيمتها', 'أصناف انشالت', 'قيمتها', 'المجموع']}
      rows={rows.map((r) => [
        names?.get(r.userId) ?? '—',
        String(r.voids),
        formatJod(r.voidAmount),
        String(r.removals),
        formatJod(r.removalAmount),
        formatJod(r.voidAmount + r.removalAmount),
      ])}
    />
  )
}

function Guests({ totals: t, hours }: { totals: Report['totals']; hours: HourRow[] }) {
  const total = t.men + t.women + t.kids
  if (!total) return <p className="text-ink/50">ما انسجّل عدد زباين بهالفترة (بيتسجّل لما تنفتح طاولة)</p>
  const byHour = hours.filter((h) => h.guests > 0).sort((a, b) => hourOrder(a.hour) - hourOrder(b.hour))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(
          [
            ['المجموع', String(total)],
            ['رجال', String(t.men)],
            ['نساء', String(t.women)],
            ['أطفال', String(t.kids)],
            ['معدّل الصرف للشخص', formatJod(t.guestSales / total)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-cream-200/60 p-3 text-center">
            <div className="text-xs text-ink/60">{k}</div>
            <div className="num font-display text-xl text-green">{v}</div>
          </div>
        ))}
      </div>
      {byHour.length > 0 && (
        <Table head={['الساعة', 'زباين', 'طلبات']} rows={byHour.map((h) => [hourLabel(h.hour), String(h.guests), String(h.orders)])} />
      )}
      <p className="text-xs text-ink/50">معدّل الصرف = مبيعات الطاولات اللي انسجّل عدد زباينها ÷ عددهم.</p>
    </div>
  )
}

function Discounts({ loyalty, manual, rows }: { loyalty: number; manual: number; rows: Report['manualDiscounts'] }) {
  const names = useLiveQuery(async () => new Map((await db.users.toArray()).map((u) => [u.id!, u.name])), [])
  const customers = useLiveQuery(async () => new Map((await db.customers.toArray()).map((c) => [c.id!, c.name || c.phone])), [])
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-cream-200/60 p-3 text-center">
          <div className="text-xs text-ink/60">خصم الولاء</div>
          <div className="num font-display text-xl text-green">{formatJod(loyalty)}</div>
        </div>
        <div className="rounded-xl bg-cream-200/60 p-3 text-center">
          <div className="text-xs text-ink/60">خصومات يدوية</div>
          <div className="num font-display text-xl text-green">{formatJod(manual)}</div>
        </div>
      </div>
      {rows.length > 0 && (
        <Table
          head={['اليوم', 'الطلب', 'الخصم', 'السبب', 'مين عطاه', 'لمين']}
          rows={rows.map((r) => [
            `${dayLabel(r.at)} ${timeLabelOf(r.at)}`,
            r.label,
            `${formatJod(r.amount)}${r.pct ? ` (${r.pct}%)` : ''}`,
            r.reason,
            `${names?.get(r.byUserId) ?? '—'}${r.approvedBy ? ` بموافقة ${names?.get(r.approvedBy) ?? 'المالك'}` : ''}`,
            r.customerId ? (customers?.get(r.customerId) ?? '—') : '—',
          ])}
        />
      )}
    </div>
  )
}
