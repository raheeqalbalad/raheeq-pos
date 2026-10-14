import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedIfEmpty, seedStockIfEmpty } from './db/seed'
import { ensureGoal } from './lib/goal'
import { ensureOffers } from './lib/offers'
import { ensureCoalReset } from './lib/floor'
import { cleanupExtraWater } from './lib/water'
import { cloudConfigured } from './lib/cloud/config'
import { deviceMode } from './lib/cloud/device'
import { installRemoteEdits } from './lib/cloud/remote'
import { SessionProvider } from './lib/session'
import { db } from './db/db'
import { keepScreenOn } from './lib/wakeLock'
import { ErrorBoundary, RecoveryScreen } from './components/Recovery'
import UpdateManager from './components/UpdateManager'

// للتجربة وقت التطوير بس (ما بيدخل بنسخة النشر)
if (import.meta.env.DEV) Object.assign(window, { db })

keepScreenOn()

// قبل أول استعمال للقاعدة: الدخول بالإيميل من بعيد بيحوّل تعديلات المالك لطلبات للتابلت، وبيمنع غيرها
installRemoteEdits()

// نسخة تانية من التطبيق (أحدث) فتحت القاعدة: هاي النسخة القديمة بتعيد تحميل حالها
db.on('versionchange', () => {
  db.close()
  location.reload()
  return false
})

type BootState = 'loading' | 'ready' | 'blocked' | 'slow' | { error: string }

/** بيعرض التطبيق دايمًا: إما جاهز، أو شاشة واضحة فيها زر «أعد التشغيل» (ما في شاشة فاضية). */
function Boot() {
  const [state, setState] = useState<BootState>('loading')

  useEffect(() => {
    let done = false
    const onBlocked = () => !done && setState('blocked')
    db.on('blocked', onBlocked)
    const slow = setTimeout(() => !done && setState('slow'), 10_000)
    // العروض بعد تعبئة المنيو الأولى (هاي بتشتغل بس إذا ما في أقسام)
    // الدخول بالإيميل: القاعدة نسخة من السحابة، فما بنعبّي فيها إشي من عنا
    const seeds =
      deviceMode() === 'viewer'
        ? []
        : [seedIfEmpty().then(ensureOffers).then(ensureCoalReset), seedStockIfEmpty(), ensureGoal(), cleanupExtraWater()]
    Promise.all(seeds)
      .then(() => {
        done = true
        setState('ready')
        // التابلت المربوط بالسحابة: بيرفع اللي فاته بالخلفية (بدون ما يأثر على الحفظ المحلي)
        if (cloudConfigured && deviceMode() === 'cafe')
          void import('./lib/cloud/sync').then((m) => m.startSync())
      })
      .catch((e: unknown) => {
        done = true
        setState({ error: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => clearTimeout(slow))
    return () => {
      clearTimeout(slow)
      db.on('blocked').unsubscribe(onBlocked)
    }
  }, [])

  if (state === 'loading') return <div className="h-full bg-green" />
  if (state === 'blocked') return <RecoveryScreen title="التطبيق مفتوح بمكان تاني" detail="سكّر أي نسخة تانية من التطبيق (أو تبويب بالمتصفح) وأعد التشغيل." />
  if (state === 'slow') return <RecoveryScreen title="التطبيق بطّأ بالفتح" />
  if (typeof state === 'object') return <RecoveryScreen title="ما قدر التطبيق يفتح" detail={state.error} />
  return (
    <SessionProvider>
      <App />
      <UpdateManager />
    </SessionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Boot />
    </ErrorBoundary>
  </StrictMode>,
)
