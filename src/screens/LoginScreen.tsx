import { useSession } from '../lib/session'
import Logo from '../components/Logo'
import PinPad from '../components/PinPad'

/** شاشة الرمز. على التابلت بالعرض (الشاشة قصيرة) الشعار بيصير جنب الأرقام عشان كل اشي يبيّن. */
export default function LoginScreen({ onEmail }: { onEmail?: () => void }) {
  const { login } = useSession()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto bg-green px-4 py-6 text-cream [@media(max-height:680px)]:flex-row [@media(max-height:680px)]:gap-16">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <h1 className="font-display text-xl">أدخل الرمز</h1>
      </div>
      <div className="flex flex-col items-center gap-4">
        <PinPad onUser={login} dark />
        {onEmail && (
          <button type="button" onClick={onEmail} className="h-12 rounded-xl px-4 text-sm text-cream/70 underline-offset-4 active:text-gold">
            دخول بالإيميل
          </button>
        )}
      </div>
    </div>
  )
}
