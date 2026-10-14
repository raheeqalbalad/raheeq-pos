import type { WorkSheet } from 'xlsx'
import { db } from '../db/db'
import { allShifts, buildReport, hourLabel, hourOrder, itemMargin, itemProfit, monthLabel, MONTHS } from './reports'
import { timeLabelOf } from './time'
import { expenseSource, leftInDrawerOf } from './shift'

// التصدير بيمشي مع أعمدة شيت الحسابات الشهري («الحساب»):
// A الشهر · B الدخل · C المصاريف =SUM(H:K) · D الضمان · E الصافي =B-C-D · F تفصيل · H أغراض ومصاريف · I رواتب · J كهربا · K مي
// السيستم بيعبّي الدخل ومصاريف الدرج بس. الرواتب والكهربا والمي والضمان بتنضاف بالإيد.

const MONEY_SIGNED = '#,##0.00;[RED]\\-#,##0.00'
const MONEY = '#,##0.00'
const jod = (fils: number) => Math.round(fils) / 1000

type Cell = string | number | { f: string; z?: string } | { v: number; z: string } | null

function sheetFrom(rows: Cell[][], widths: number[]): WorkSheet {
  const ws: WorkSheet = {}
  let maxC = 0
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null || cell === undefined || cell === '') return
      const ref = cellRef(r, c)
      if (typeof cell === 'string') ws[ref] = { t: 's', v: cell }
      else if (typeof cell === 'number') ws[ref] = { t: 'n', v: cell }
      else if ('f' in cell) ws[ref] = { t: 'n', f: cell.f, z: cell.z }
      else ws[ref] = { t: 'n', v: cell.v, z: cell.z }
      maxC = Math.max(maxC, c)
    })
  })
  ws['!ref'] = `A1:${cellRef(Math.max(rows.length - 1, 0), maxC)}`
  ws['!cols'] = widths.map((wch) => ({ wch }))
  return ws
}

function cellRef(r: number, c: number) {
  return `${String.fromCharCode(65 + c)}${r + 1}`
}

const money = (fils: number, z = MONEY): Cell => ({ v: jod(fils), z })

/** بيبني ملف الإكسل (بدون تنزيل). */
export async function buildWorkbook() {
  const XLSX = await import('xlsx')
  const shifts = await allShifts()
  const report = await buildReport(shifts)
  const users = new Map((await db.users.toArray()).map((u) => [u.id!, u.name]))

  // ===== الحساب (نفس شيت الماستر) =====
  const months = [...report.months].reverse() // الأقدم أول، زي الماستر
  const years = new Set(months.map((m) => m.key.slice(0, 4)))
  const monthName = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return years.size > 1 ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1]
  }
  const span = months.length
    ? `${MONTHS[Number(months[0].key.slice(5)) - 1]} – ${MONTHS[Number(months.at(-1)!.key.slice(5)) - 1]} ${[...years].join('/')}`
    : ''

  const hisab: Cell[][] = [
    [`رحيق البلد — الدخل والمصاريف والصافي (${span})`],
    [],
    ['الشهر', 'الدخل', 'المصاريف (أغراض + رواتب + كهربا + مي)', 'الضمان', 'الصافي', 'تفصيل المصاريف', null, 'أغراض ومصاريف', 'رواتب', 'كهربا', 'مي'],
  ]
  months.forEach((m, i) => {
    const r = 4 + i // رقم الصف بالإكسل
    hisab.push([
      monthName(m.key),
      money(m.sales, MONEY_SIGNED),
      { f: `SUM(H${r}:K${r})`, z: MONEY_SIGNED },
      null,
      { f: `B${r}-C${r}-D${r}`, z: MONEY_SIGNED },
      `من السيستم: كاش ${jod(m.cash).toFixed(2)} + كليك ${jod(m.cliq).toFixed(2)}، مصاريف درج ${jod(m.expenses).toFixed(2)}${
        m.outside ? ` + من برا الدرج ${jod(m.outside).toFixed(2)}` : ''
      } (${m.days} يوم شغل)`,
      null,
      money(m.expenses + m.outside),
      null,
      null,
      null,
    ])
  })
  const first = 4
  const last = 3 + months.length
  if (months.length) {
    hisab.push([
      'المجموع',
      ...(['B', 'C', 'D', 'E'] as const).map((c): Cell => ({ f: `SUM(${c}${first}:${c}${last})`, z: MONEY_SIGNED })),
      null,
      null,
      ...(['H', 'I', 'J', 'K'] as const).map((c): Cell => ({ f: `SUM(${c}${first}:${c}${last})`, z: MONEY })),
    ])
  }
  hisab.push(
    [],
    ['ملاحظات'],
    ['• الدخل = كاش + كليك من السيستم، حسب يوم الشغل (من فتح الشيفت لتسكيره).'],
    ['• أغراض ومصاريف = مصاريف الدرج + المصاريف من برا الدرج المسجّلة بالسيستم.'],
    ['• الرواتب والكهربا والمي والضمان فاضيين: عبّيهم بالإيد، والمصاريف والصافي بيتحسبوا لحالهم.'],
  )
  const wsHisab = sheetFrom(hisab, [14, 12, 22, 10, 12, 60, 2, 14, 10, 10, 10])
  const noteStart = hisab.length - 4
  wsHisab['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    ...[0, 1, 2, 3].map((i) => ({ s: { r: noteStart + i, c: 0 }, e: { r: noteStart + i, c: 5 } })),
  ]

  // ===== أيام الشغل =====
  const days: Cell[][] = [
    ['يوم الشغل', 'فتح', 'تسكير', 'كاش', 'كليك', 'الدخل', 'مصاريف الدرج', 'من برا الدرج', 'الصافي', 'طلبات', 'ملغي', 'كاش البداية', 'المعدود', 'فرق الدرج', 'تركت بالدرج', 'المسحوب', 'خصم ولاء', 'خصومات يدوية', 'كليك على حساب الموظف', 'زباين', 'الموظف (الدرج)'],
  ]
  for (const d of [...report.days].reverse()) {
    const s = d.shift
    const date = new Date(s.openedAt)
    days.push([
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      timeLabelOf(s.openedAt),
      s.closedAt ? timeLabelOf(s.closedAt) : 'مفتوح',
      money(d.cash),
      money(d.cliq),
      money(d.sales),
      money(d.expenses),
      money(d.outside),
      money(d.net, MONEY_SIGNED),
      d.orders,
      d.voids,
      money(s.openingCash),
      s.countedCash !== undefined ? money(s.countedCash) : null,
      d.drawerDiff !== undefined ? money(d.drawerDiff, MONEY_SIGNED) : null,
      s.closedAt && leftInDrawerOf(s) !== undefined ? money(leftInDrawerOf(s)!) : null,
      d.withdrawn !== undefined ? money(d.withdrawn) : null,
      d.loyalty ? money(d.loyalty) : null,
      d.manual ? money(d.manual) : null,
      d.cliqStaff ? money(d.cliqStaff) : null,
      d.men + d.women + d.kids || null,
      users.get(s.staffId) ?? '',
    ])
  }

  // ===== فروقات الدرج لكل موظف بالشهر =====
  const drawer: Cell[][] = [['الشهر', 'الموظف', 'شيفتات', 'زيادة', 'نقص', 'الصافي']]
  for (const r of [...report.drawerByStaff].reverse())
    drawer.push([monthLabel(r.month), users.get(r.userId) ?? '', r.shifts, money(r.over), money(r.short), money(r.over - r.short, MONEY_SIGNED)])

  // ===== الأصناف =====
  const items: Cell[][] = [['الصنف', 'الكمية', 'المبيعات', 'التكلفة', 'الربح', 'نسبة الربح']]
  for (const i of report.items) {
    const profit = itemProfit(i)
    const margin = itemMargin(i)
    items.push([
      i.name,
      i.qty,
      money(i.revenue),
      i.costedQty ? money(i.cost) : 'بدون تكلفة',
      profit === undefined ? null : money(profit, MONEY_SIGNED),
      margin === undefined ? null : `${Math.round(margin * 100)}%`,
    ])
  }

  // ===== أداء الموظفين =====
  const staffSheet: Cell[][] = [['الموظف', 'شيفتات', 'طلبات', 'المبيعات', 'معدّل الفاتورة', 'خصومات يدوية', 'عدد الخصومات', 'إلغاءات (قيمة)', 'عدد الإلغاءات', 'زيادة بالدرج', 'نقص بالدرج']]
  for (const r of report.staff)
    staffSheet.push([
      users.get(r.userId) ?? '',
      r.shifts,
      r.orders,
      money(r.sales),
      r.orders ? money(Math.round(r.sales / r.orders)) : null,
      money(r.manual),
      r.manualCount,
      money(r.cancelAmount),
      r.cancels,
      money(r.drawerOver),
      money(r.drawerShort),
    ])

  // ===== العروض =====
  const offers: Cell[][] = [['العرض', 'كم انباع', 'المبيعات']]
  for (const o of report.offers) offers.push([o.name, o.qty, money(o.revenue)])

  // ===== الساعات =====
  const hours: Cell[][] = [['الساعة', 'طلبات', 'مبيعات']]
  for (const h of [...report.hours].sort((a, b) => hourOrder(a.hour) - hourOrder(b.hour)))
    hours.push([hourLabel(h.hour), h.orders, money(h.sales)])

  // ===== مصاريف الدرج =====
  const expenses: Cell[][] = [['التاريخ', 'الوقت', 'السبب', 'من وين', 'المبلغ', 'الموظف']]
  for (const e of [...report.expenses].reverse()) {
    const d = new Date(e.createdAt)
    expenses.push([
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      timeLabelOf(e.createdAt),
      e.reason,
      expenseSource(e) === 'outside' ? 'برا الدرج' : 'الدرج',
      money(e.amount),
      users.get(e.staffId) ?? '',
    ])
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsHisab, 'الحساب')
  XLSX.utils.book_append_sheet(wb, sheetFrom(days, [12, 8, 8, 10, 10, 10, 12, 12, 10, 8, 8, 12, 10, 10, 12, 10, 10, 12, 18, 8, 14]), 'أيام الشغل')
  XLSX.utils.book_append_sheet(wb, sheetFrom(drawer, [16, 14, 8, 10, 10, 10]), 'فروقات الدرج')
  XLSX.utils.book_append_sheet(wb, sheetFrom(items, [24, 10, 12, 12, 12, 10]), 'الأصناف')
  XLSX.utils.book_append_sheet(wb, sheetFrom(staffSheet, [14, 8, 8, 12, 12, 12, 10, 12, 10, 12, 12]), 'أداء الموظفين')
  XLSX.utils.book_append_sheet(wb, sheetFrom(offers, [20, 10, 12]), 'العروض')
  XLSX.utils.book_append_sheet(wb, sheetFrom(hours, [10, 10, 12]), 'الساعات')
  XLSX.utils.book_append_sheet(wb, sheetFrom(expenses, [12, 8, 24, 10, 10, 12]), 'المصاريف')
  wb.Workbook = { Views: [{ RTL: true }] }

  const today = new Date()
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return { XLSX, wb, filename: `raheeq-hisab-${stamp}.xlsx` }
}

export async function exportWorkbook() {
  const { XLSX, wb, filename } = await buildWorkbook()
  XLSX.writeFile(wb, filename, { compression: true })
}
