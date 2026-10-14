import type { CustomerStats } from './customers'
import { whatsappPhone } from './customers'

const MONEY = '#,##0.00'

/** قائمة زباين للواتساب بزنس: الموافقين على العروض بس. */
export async function exportCustomers(rows: CustomerStats[]) {
  const XLSX = await import('xlsx')
  const optedIn = rows.filter((r) => r.customer.marketingOptIn)
  const date = (ts?: number) => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const data = [
    ['الاسم', 'الرقم', 'رقم الواتساب', 'عدد الزيارات', 'آخر زيارة', 'كم صرف', 'أكثر اشي بيطلبه'],
    ...optedIn.map((r) => [
      r.customer.name ?? '',
      r.customer.phone,
      whatsappPhone(r.customer.phone),
      r.visits,
      date(r.lastVisit),
      { t: 'n', v: r.spent / 1000, z: MONEY },
      r.favorite ?? '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [18, 13, 15, 12, 12, 10, 20].map((wch) => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الزباين')
  wb.Workbook = { Views: [{ RTL: true }] }
  const today = date(Date.now())
  XLSX.writeFile(wb, `raheeq-zabayen-${today}.xlsx`, { compression: true })
  return optedIn.length
}
