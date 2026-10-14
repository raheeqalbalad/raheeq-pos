import { useState, type ReactNode } from 'react'
import OwnerPinSheet from '../components/OwnerPinSheet'
import { useSession } from './session'

type Pending = { title: string; detail?: ReactNode; run: (ownerId: number) => void }

/**
 * عمليات بدها موافقة المالك. إذا المالك نفسه داخل بتمشي فورًا،
 * وإلا بتطلب رمزه. `sheet` لازم ينحط بالشاشة.
 */
export function useOwnerGate() {
  const { user } = useSession()
  const [pending, setPending] = useState<Pending | null>(null)

  const requireOwner = (title: string, run: (ownerId: number) => void, detail?: ReactNode) => {
    if (user?.role === 'owner') run(user.id!)
    else setPending({ title, detail, run })
  }

  const sheet = pending && (
    <OwnerPinSheet
      title={pending.title}
      onClose={() => setPending(null)}
      onApproved={(owner) => {
        setPending(null)
        pending.run(owner.id!)
      }}
    >
      {pending.detail}
    </OwnerPinSheet>
  )

  return { requireOwner, sheet }
}
