import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cloudConfigured } from '../lib/cloud/config'
import { getStatus, linkCafeDevice, resetUploadState, syncNow, unlinkCafeDevice, verifyUpload, type VerifyRow } from '../lib/cloud/sync'
import { useDeviceMode } from '../lib/cloud/useDeviceMode'
import { timeLabelOf } from '../lib/time'
import Sheet from './Sheet'

const inputClass = 'h-12 w-full min-w-0 rounded-xl bg-white px-3 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green'

const TABLE_LABEL: Record<string, string> = {
  users: 'المستخدمين (بدون رموز)',
  categories: 'أقسام المنيو',
  items: 'الأصناف',
  optionLists: 'قوائم الخيارات',
  cafeTables: 'الطاولات',
  orders: 'الطلبات',
  orderLines: 'سطور الطلبات',
  payments: 'الدفعات',
  paymentCorrections: 'تصحيح الدفعات',
  shifts: 'الشيفتات',
  expenses: 'المصاريف',
  stockItems: 'أصناف المخزون',
  stockMoves: 'حركات المخزون',
  stockCounts: 'الجرد',
  auditLog: 'سجل التعديلات',
  customers: 'الزباين',
  settings: 'الإعدادات',
}

/** ربط التابلت بالسحابة (للمالك): حساب الكافيه، وحالة الرفع، والتأكد إنه كل إشي انرفع. */
export default function CloudSection() {
  const mode = useDeviceMode()
  if (!cloudConfigured || mode === 'viewer') return null
  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">السحابة (Supabase)</h2>
      {mode === 'cafe' ? <Linked /> : <LinkForm />}
    </section>
  )
}

function LinkForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [elsewhere, setElsewhere] = useState(false)

  async function link(force = false) {
    setBusy(true)
    setError('')
    try {
      await linkCafeDevice(email, password, force)
      setPassword('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ما زبط'
      if (msg === 'LINKED_ELSEWHERE') setElsewhere(true)
      else setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mb-4 text-sm text-ink/60">
        التابلت بيضل يحفظ كل إشي عنده أول، وبيرفع نسخة للسحابة لما يكون في نت (عشان المتابعة من بعيد بالإيميل، والنسخة الاحتياطية). الموظفين بيضلّوا
        يدخلوا بالرمز. بتدخل حساب الكافيه هون مرة وحدة بس.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-green">إيميل حساب الكافيه</span>
          <input type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-green">كلمة السر</span>
          <input
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {error && <p className="mt-3 text-center font-bold text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy || !email || !password}
        onClick={() => link()}
        className="mt-4 h-14 w-full rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
      >
        {busy ? 'لحظة، بنربط وبنرفع البيانات…' : 'اربط التابلت ورفّع البيانات'}
      </button>

      {elsewhere && (
        <Sheet title="حساب الكافيه مربوط بجهاز تاني" onClose={() => setElsewhere(false)}>
          <p className="mb-3 text-ink/80">
            حساب الكافيه انربط قبل بجهاز تاني. إذا هاد <b>نفس التابلت</b> (مثلًا انمسحت بيانات المتصفح)، اربطه من جديد.
          </p>
          <p className="mb-4 text-sm font-bold text-red-800">
            إذا هاد جهاز جديد أو تاني، لا تربطه: رح يكتب بياناته فوق بيانات التابلت بالسحابة.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setElsewhere(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button
              type="button"
              onClick={() => {
                setElsewhere(false)
                void link(true)
              }}
              className="h-14 rounded-xl bg-red-800 font-bold text-cream"
            >
              نفس التابلت، اربطه
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function Linked() {
  const status = useLiveQuery(getStatus, [])
  const [verify, setVerify] = useState<VerifyRow[] | null>(null)
  const [verifyError, setVerifyError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  async function check(full = false) {
    setBusy(true)
    setVerifyError('')
    try {
      if (full) await resetUploadState()
      await syncNow()
      setVerify(await verifyUpload())
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'ما زبط')
    } finally {
      setBusy(false)
    }
  }

  const ok = verify?.every((r) => r.local === r.cloud)

  return (
    <>
      <div
        className={`mb-3 rounded-xl px-4 py-3 ${status?.error ? 'bg-red-800/10 text-red-900' : 'bg-green-100 text-green'}`}
      >
        {status?.running ? (
          <b>بيرفع هلق…</b>
        ) : status?.error ? (
          <>
            <b>آخر محاولة ما زبطت:</b> {status.error}
            <div className="text-sm">البيانات محفوظة على التابلت، وبيرجع يحاول لحاله لما يرجع النت.</div>
          </>
        ) : (
          <b>✓ التابلت مربوط بالسحابة</b>
        )}
        <div className="mt-1 text-sm opacity-80">
          {status?.lastSyncAt ? (
            <>
              آخر مزامنة ناجحة <span className="num">{timeLabelOf(status.lastSyncAt)}</span>
            </>
          ) : (
            'لسا ما صار رفع'
          )}
          {status?.lastUploadAt && (
            <>
              {' '}
              · آخر رفع <span className="num">{status.lastUploaded}</span> سجل الساعة <span className="num">{timeLabelOf(status.lastUploadAt)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => check()}
          className="h-12 rounded-xl bg-green px-4 font-bold text-cream active:bg-green-700 disabled:opacity-50"
        >
          {busy ? 'بيتأكّد…' : 'ارفع هلق وتأكّد إنه كل إشي انرفع'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmUnlink(true)}
          className="h-12 rounded-xl px-4 text-sm text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
        >
          افصل التابلت
        </button>
      </div>

      {verifyError && <p className="mt-3 font-bold text-red-700">{verifyError}</p>}
      {verify && (
        <div className="mt-3">
          <p className={`mb-2 font-bold ${ok ? 'text-green' : 'text-red-800'}`}>
            {ok ? '✓ كل البيانات اللي على التابلت موجودة بالسحابة' : 'في جداول مش متطابقة'}
          </p>
          {!ok && (
            <button
              type="button"
              disabled={busy}
              onClick={() => check(true)}
              className="mb-3 h-12 rounded-xl bg-gold px-4 font-bold text-green active:bg-gold-600 disabled:opacity-50"
            >
              ارفع كل إشي من جديد
            </button>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 text-ink/60">
                <th className="px-2 py-1 text-start font-medium">الجدول</th>
                <th className="px-2 py-1 text-start font-medium">التابلت</th>
                <th className="px-2 py-1 text-start font-medium">السحابة</th>
              </tr>
            </thead>
            <tbody>
              {verify.map((r) => (
                <tr key={r.tbl} className="border-b border-cream-200/60">
                  <td className="px-2 py-1">{TABLE_LABEL[r.tbl] ?? r.tbl}</td>
                  <td className="px-2 py-1">
                    <span className="num">{r.local}</span>
                  </td>
                  <td className={`px-2 py-1 font-bold ${r.local === r.cloud ? 'text-green' : 'text-red-800'}`}>
                    <span className="num">{r.cloud}</span> {r.local === r.cloud ? '✓' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmUnlink && (
        <Sheet title="فصل التابلت عن السحابة؟" onClose={() => setConfirmUnlink(false)}>
          <p className="mb-4 text-ink/80">
            التابلت بيضل يشتغل عادي وكل بياناته بتضل عليه، بس ما بيرفع إشي للسحابة لحد ما تربطه من جديد. اللي داخلين بالإيميل بيضلّوا يشوفوا آخر نسخة انرفعت.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirmUnlink(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button
              type="button"
              onClick={async () => {
                setConfirmUnlink(false)
                await unlinkCafeDevice()
              }}
              className="h-14 rounded-xl bg-red-800 font-bold text-cream"
            >
              افصل
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
