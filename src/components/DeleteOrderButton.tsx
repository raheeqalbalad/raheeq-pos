import { useState } from 'react'
import type { Order } from '../db/types'
import { deleteOrderAudited } from '../lib/audit'
import { formatJod } from '../lib/money'
import { useSession } from '../lib/session'
import { useOwnerGate } from '../lib/useOwnerGate'
import Sheet from './Sheet'

/** «حذف نهائي» لطلبات التجربة: بيسأل أول، وبده رمز المالك (إذا المالك مش هو الداخل). */
export default function DeleteOrderButton({ order, total, onDeleted }: { order: Order; total: number; onDeleted: () => void }) {
  const { user } = useSession()
  const { requireOwner, sheet } = useOwnerGate()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')

  function remove() {
    setAsking(false)
    requireOwner(
      'حذف الطلب نهائيًا',
      async (ownerId) => {
        try {
          await deleteOrderAudited(order.id!, user!.id!, ownerId)
          onDeleted()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'ما زبط')
        }
      },
      <>
        {order.label} (<span className="num">{formatJod(total)}</span>) رح ينحذف نهائيًا
      </>,
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="h-12 w-full rounded-xl text-sm font-medium text-red-800 underline-offset-4 active:bg-red-700/10"
      >
        حذف نهائي (طلب تجربة) — برمز المالك
      </button>
      {error && <p className="text-center text-sm font-bold text-red-700">{error}</p>}
      {asking && (
        <Sheet title={`حذف ${order.label} نهائيًا؟`} onClose={() => setAsking(false)}>
          <p className="mb-2 text-ink/80">
            الطلب وأصنافه ودفعاته رح ينشالوا كأنهم ما صاروا: ما بيبيّنوا بالمبيعات ولا بالتقارير ولا بالإلغاءات.
          </p>
          <p className="mb-4 text-sm text-ink/60">
            هاد لطلبات التجربة. الطلب الحقيقي اللي الزبون رجّعه استعمل «إلغاء» (بيضل مسجّل). الحذف بينسجّل بسجل التعديلات.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setAsking(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
              رجوع
            </button>
            <button type="button" onClick={remove} className="h-14 rounded-xl bg-red-800 font-bold text-cream">
              احذف نهائيًا
            </button>
          </div>
        </Sheet>
      )}
      {sheet}
    </>
  )
}
