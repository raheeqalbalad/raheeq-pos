import { useRef, useState } from 'react'
import { db } from '../db/db'
import type { User } from '../db/types'

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const

/**
 * لوحة رمز من 4 أرقام. بتدوّر على المستخدم بالرمز وبترجعه لـ onUser
 * إذا accept وافقت عليه، وإلا بتطلّع errorText.
 */
export default function PinPad({
  onUser,
  accept = () => true,
  errorText = 'الرمز غلط، جرّب كمان مرة',
  dark = false,
}: {
  onUser: (u: User) => void
  accept?: (u: User) => boolean
  errorText?: string
  dark?: boolean
}) {
  const [pin, setPinState] = useState('')
  const [error, setError] = useState(false)
  // الكبس السريع أسرع من الـ render، فبنمسك القيمة الحالية بـ ref عشان ما يضيع رقم.
  const pinRef = useRef('')
  const setPin = (v: string) => {
    pinRef.current = v
    setPinState(v)
  }

  async function press(key: (typeof KEYS)[number]) {
    setError(false)
    if (key === 'clear') return setPin('')
    if (key === 'back') return setPin(pinRef.current.slice(0, -1))
    if (pinRef.current.length >= PIN_LENGTH) return
    const next = pinRef.current + key
    setPin(next)
    if (next.length < PIN_LENGTH) return

    const user = await db.users.where('pin').equals(next).filter((u) => u.active).first()
    if (user && accept(user)) onUser(user)
    else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p className={`h-5 text-sm ${error ? (dark ? 'text-gold' : 'text-red-700') : 'opacity-0'}`}>{errorText}</p>
      <div className="flex gap-4" dir="ltr" aria-label="الرمز">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`size-4 rounded-full border-2 transition-colors ${
              dark ? 'border-gold' : 'border-green'
            } ${i < pin.length ? (dark ? 'bg-gold' : 'bg-green') : ''}`}
          />
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3" dir="ltr">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={`num h-16 rounded-2xl text-3xl font-medium ${
              dark ? 'bg-green-700 active:bg-gold active:text-green' : 'bg-cream-200 text-green active:bg-gold'
            }`}
          >
            {k === 'clear' ? <span className="text-base">مسح</span> : k === 'back' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
