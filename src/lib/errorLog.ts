// سجل الأخطاء (للتشخيص): أي غلط بيصير بالتطبيق بينحفظ على الجهاز مع وقته، وبيبيّن بالإعدادات.
// ما فيه بيانات زباين ولا رموز: بس رسالة الغلط ومكانه.

export interface ErrorEntry {
  at: number
  message: string
  where?: string
}

const KEY = 'raheeq-errors'
const MAX = 30

export function readErrors(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ErrorEntry[]
  } catch {
    return []
  }
}

export function logError(message: string, where?: string) {
  try {
    const list = [{ at: Date.now(), message: message.slice(0, 300), ...(where ? { where: where.slice(0, 200) } : {}) }, ...readErrors()]
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // ما في تخزين
  }
}

export function clearErrors() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ما في تخزين
  }
}

/** بيمسك أي غلط ما حدا مسكه (لازم تنادى مرة وحدة أول التطبيق). */
export function installErrorLog() {
  window.addEventListener('error', (e) => logError(e.message || String(e.error), e.error?.stack?.split('\n')[1]?.trim()))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined
    logError(r?.message ?? String(e.reason), r?.stack?.split('\n')[1]?.trim())
  })
}

/**
 * أي تعليق بالشاشة أطول من ثلث ثانية بينسجّل (مدته، وإذا المزامنة كانت شغّالة وقتها)،
 * عشان نعرف شو بيبطّئ التابلت.
 */
export function watchFreezes(context: () => string) {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (e.duration > 300) logError(`تعليق ${Math.round(e.duration)}ms`, context())
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // المتصفح ما بيدعمها
  }
}

/** رقم النسخة (وقت البناء) */
export const APP_VERSION: string = __APP_VERSION__
