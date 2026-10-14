import { useSession } from '../lib/session'
import Logo from '../components/Logo'
import PinPad from '../components/PinPad'

export default function LoginScreen() {
  const { login } = useSession()
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-green px-4 py-10 text-cream">
      <Logo />
      <h1 className="font-display text-xl">أدخل الرمز</h1>
      <PinPad onUser={login} dark />
    </div>
  )
}
