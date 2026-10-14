import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useSession } from '../lib/session'

const CHECK_EVERY = 30 * 60 * 1000 // كل نص ساعة بيشيك إذا في نسخة جديدة

/**
 * التحديثات ما بتقاطع الشغل: النسخة الجديدة بتنزل بالخلفية وبتستنى.
 * - إذا ما في حدا داخل (شاشة الرمز): بتتثبت فورًا.
 * - إذا في حدا داخل: شريط صغير «حدّث هلق»، وإلا بتتثبت لحالها أول ما يطلع.
 * - إذا التطبيق تسكّر وانفتح: بيفتح عالنسخة الجديدة.
 */
export default function UpdateManager() {
  const { user } = useSession()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => registration.update().catch(() => {}), CHECK_EVERY)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      })
    },
  })

  useEffect(() => {
    if (needRefresh && !user) updateServiceWorker(true)
  }, [needRefresh, user, updateServiceWorker])

  if (!needRefresh || !user) return null
  return (
    <div className="fixed bottom-3 left-3 z-[60] flex items-center gap-3 rounded-2xl bg-ink/90 py-2 ps-4 pe-2 text-sm text-cream shadow-lg">
      <span>في نسخة جديدة، بتنزل لما تطلع</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="h-10 rounded-xl bg-gold px-4 font-bold text-green active:bg-gold-600"
      >
        حدّث هلق
      </button>
    </div>
  )
}
