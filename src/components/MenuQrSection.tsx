import qrcode from 'qrcode-generator'
import { cloudConfigured } from '../lib/cloud/config'
import { useDeviceMode } from '../lib/cloud/useDeviceMode'

/** رابط صفحة المنيو العامة (على نفس موقع التطبيق) */
export const menuUrl = () => `${location.origin}${import.meta.env.BASE_URL}menu/`

function qrSvg(text: string, cell = 8) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true })
}

const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** صفحة جاهزة للطباعة: الـ QR مع اسم الكافيه، بتنفتح بنافذة لحالها وبتطبع. */
function printQr(url: string) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>منيو رحيق البلد</title>
<style>
  @page { size: A5; margin: 12mm; }
  body { font-family: 'Tajawal', system-ui, sans-serif; color: #233D34; text-align: center; margin: 0; }
  .card { border: 3px solid #233D34; border-radius: 24px; padding: 24px; max-width: 420px; margin: 0 auto; }
  h1 { font-size: 34px; margin: 0 0 4px; }
  p { margin: 4px 0; font-size: 18px; }
  .qr { width: 300px; height: 300px; margin: 16px auto; }
  .qr svg { width: 100%; height: 100%; }
  small { color: #555; font-size: 12px; direction: ltr; display: block; margin-top: 8px; }
</style></head><body><div class="card">
<h1>رحيق البلد</h1><p>امسح الكود وشوف المنيو</p>
<div class="qr">${qrSvg(url)}</div>
<p>كافيه · وسط البلد</p><small>${escapeHtml(url)}</small>
</div><script>window.onload = () => { window.print() }</script></body></html>`)
  w.document.close()
}

/** QR منيو الزباين، جاهز للطباعة (للمالك). */
export default function MenuQrSection() {
  const mode = useDeviceMode()
  if (!cloudConfigured) return null
  const url = menuUrl()
  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">منيو QR للزباين</h2>
      <p className="mb-4 text-sm text-ink/60">
        صفحة عامة فيها المنيو والأسعار والعروض، وبتتحدّث لحالها من المنيو هون (التابلت بينشرها مع المزامنة). الأصناف الموقفة ما بتطلع، وما فيها
        أي تكلفة أو مبيعات أو زباين.
      </p>
      {mode === null && (
        <p className="mb-4 rounded-xl bg-gold/40 px-4 py-2 text-sm font-bold">
          الصفحة بتبيّن المنيو بعد ما تربط التابلت بالسحابة (فوق)، لأنه التابلت هو اللي بينشره.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <div className="size-40 shrink-0 rounded-xl bg-white p-2 ring-1 ring-cream-200" dangerouslySetInnerHTML={{ __html: qrSvg(url, 4) }} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="num truncate text-sm text-ink/60">{url}</span>
          <button
            type="button"
            onClick={() => printQr(url)}
            className="h-14 rounded-2xl bg-gold px-5 text-lg font-bold text-green active:bg-gold-600"
          >
            اطبع الـ QR
          </button>
          <a href={url} target="_blank" rel="noopener" className="flex h-12 items-center justify-center rounded-xl text-green ring-1 ring-green/20 active:bg-cream-200">
            افتح صفحة المنيو
          </a>
        </div>
      </div>
    </section>
  )
}
