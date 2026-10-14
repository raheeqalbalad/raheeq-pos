import { db } from '../db/db'
import type { Shift } from '../db/types'
import { formatJod } from './money'
import { buildReport, dayLabel } from './reports'
import { timeLabelOf } from './time'

// «شارك ملخص اليوم»: رسالة جاهزة بالعربي بتنفتح بواتساب (الموظف أو المالك بيختار لمين يبعتها).

const fullDate = (ts: number) => {
  const d = new Date(ts)
  return `${dayLabel(ts)}/${d.getFullYear()}`
}

const signed = (v: number) => (v === 0 ? 'مضبوط ✓' : v > 0 ? `زيادة +${formatJod(v)}` : `نقص −${formatJod(-v)}`)

/** نص الملخص ليوم شغل (شيفت) أو فترة. */
export async function summaryText(shifts: Shift[]): Promise<string> {
  const report = await buildReport(shifts)
  const names = new Map((await db.users.toArray()).map((u) => [u.id!, u.name]))
  const t = report.totals
  const sorted = [...shifts].sort((a, b) => a.openedAt - b.openedAt)
  const single = sorted.length === 1
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const lines: string[] = []

  lines.push(single ? '☕ رحيق البلد — ملخص اليوم' : '☕ رحيق البلد — ملخص الفترة')
  if (single) {
    lines.push(`📅 ${fullDate(first.openedAt)} (${timeLabelOf(first.openedAt)} – ${first.closedAt ? timeLabelOf(first.closedAt) : 'لسا مفتوح'})`)
  } else {
    lines.push(`📅 من ${fullDate(first.openedAt)} لـ ${fullDate(last.openedAt)} (${sorted.length} يوم شغل)`)
  }
  const staff = [...new Set(sorted.map((s) => names.get(s.staffId)).filter(Boolean))]
  if (staff.length) lines.push(`👤 ${single ? 'الموظف' : 'الموظفين'}: ${staff.join('، ')}`)
  const guests = t.men + t.women + t.kids
  lines.push(`🧾 الطلبات: ${t.orders}${guests ? ` · 👥 الزباين: ${guests}` : ''}`)

  lines.push('')
  lines.push(`💰 الدخل: ${formatJod(t.sales)}`)
  lines.push(`• كاش: ${formatJod(t.cash)}`)
  lines.push(`• كليك: ${formatJod(t.cliq)}`)
  for (const r of report.cliqSplit) lines.push(`   - ${r.name}${r.isStaff ? ' (على حساب الموظف)' : ''}: ${formatJod(r.amount)}`)
  if (t.cliqTransfer) lines.push(`🔁 كليك رح يحوّله الموظف لصاحب المحل: ${formatJod(t.cliqTransfer)}`)
  if (t.loyalty || t.manual) {
    const parts = [t.loyalty ? `ولاء ${formatJod(t.loyalty)}` : '', t.manual ? `يدوية ${formatJod(t.manual)}` : ''].filter(Boolean)
    lines.push(`🏷️ الخصومات: ${parts.join(' · ')}`)
  }
  lines.push(
    `📤 المصاريف: ${formatJod(t.expenses + t.outside)}${t.outside ? ` (درج ${formatJod(t.expenses)} · من برا ${formatJod(t.outside)})` : ''}`,
  )
  lines.push(`✅ الصافي: ${formatJod(t.net)}`)

  const diffs = report.days.filter((d) => d.drawerDiff !== undefined)
  if (diffs.length) {
    const total = diffs.reduce((s, d) => s + d.drawerDiff!, 0)
    lines.push(`🗄️ فرق الدرج: ${signed(total)}`)
  } else if (single && !first.closedAt) {
    lines.push('🗄️ فرق الدرج: الشيفت لسا مفتوح')
  }

  const top = report.items.slice(0, 3)
  if (top.length) {
    lines.push('')
    lines.push('⭐ الأكثر مبيعًا:')
    top.forEach((i, n) => lines.push(`${n + 1}. ${i.name} (${i.qty})`))
  }
  return lines.join('\n')
}

/** بيفتح واتساب بالرسالة (بيختار لمين يبعتها). النص لازم يكون جاهز قبل الكبسة عشان المتصفح ما يمنعه. */
export function openWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}
