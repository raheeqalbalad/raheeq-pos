import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedIfEmpty, seedStockIfEmpty } from './db/seed'
import { SessionProvider } from './lib/session'
import { db } from './db/db'
import { keepScreenOn } from './lib/wakeLock'
import { ErrorBoundary, RecoveryScreen } from './components/Recovery'
import UpdateManager from './components/UpdateManager'

// للتجربة وقت التطوير بس (ما بيدخل بنسخة النشر)
if (import.meta.env.DEV) Object.assign(window, { db })

keepScreenOn()

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
    Promise.all([seedIfEmpty(), seedStockIfEmpty()])
      .then(() => {
        done = true
        setState('ready')
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
