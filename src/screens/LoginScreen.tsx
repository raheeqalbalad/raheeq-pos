import { useSession } from '../lib/session'
import Logo from '../components/Logo'
import PinPad from '../components/PinPad'

/** شاشة الرمز. على التابلت بالعرض (الشاشة قصيرة) الشعار بيصير جنب الأرقام عشان كل اشي يبيّن. */
export default function LoginScreen() {
  const { login } = useSession()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto bg-green px-4 py-6 text-cream [@media(max-height:680px)]:flex-row [@media(max-height:680px)]:gap-16">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <h1 className="font-display text-xl">أدخل الرمز</h1>
      </div>
      <PinPad onUser={login} dark />
    </div>
  )
}
