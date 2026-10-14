import type { ReactNode } from 'react'
import type { User } from '../db/types'
import PinPad from './PinPad'
import Sheet from './Sheet'

/** موافقة المالك برمزه. */
export default function OwnerPinSheet({
  title,
  children,
  onApproved,
  onClose,
}: {
  title: string
  children?: ReactNode
  onApproved: (owner: User) => void
  onClose: () => void
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      {children && <div className="mb-2 text-center text-ink/70">{children}</div>}
      <p className="text-center font-bold text-green">رمز المالك</p>
      <PinPad onUser={onApproved} accept={(u) => u.role === 'owner'} errorText="لازم رمز المالك" />
    </Sheet>
  )
}
