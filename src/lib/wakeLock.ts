import { useEffect } from 'react'

// الشاشة ما بتطفي لحالها طول ما في شيفت مفتوح (Screen Wake Lock). بعد تسكير الشيفت بنفكّه،
// فالتابلت بيقفل عادي. المتصفح بيفك القفل لحاله لما التطبيق يختفي، فبنرجع نطلبه كل ما يرجع
// يبيّن، ومع أول لمسة إذا الطلب الأول انرفض. إذا الميزة مش مدعومة، ما بيصير إشي.

type Sentinel = { released: boolean; release: () => Promise<void> }

let sentinel: Sentinel | null = null
let wanted = false

async function acquire() {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock
  if (!wanted || !wakeLock || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
  try {
    sentinel = await wakeLock.request('screen')
    // انطلب وإحنا بنفكّه (الشيفت تسكّر بالنص)
    if (!wanted) void release()
  } catch {
    // مرفوض هلق (مثلًا البطارية واطية أو ما في لمسة لسا): بنرجع نجرّب مع اللمسة الجاية
  }
}

async function release() {
  const s = sentinel
  sentinel = null
  try {
    await s?.release()
  } catch {
    // انفك أصلًا
  }
}

let listening = false

/** الشاشة ما تطفي (true) أو ترجع تطفي عادي (false). */
export function keepScreenOn(on: boolean) {
  wanted = on
  if (!listening) {
    listening = true
    document.addEventListener('visibilitychange', () => void acquire())
    document.addEventListener('pointerdown', () => void acquire(), { passive: true })
  }
  if (on) void acquire()
  else void release()
}

/** طول ما المكوّن معروض والشرط صح، الشاشة ما بتطفي. */
export function useKeepScreenOn(on: boolean) {
  useEffect(() => {
    keepScreenOn(on)
    return () => keepScreenOn(false)
  }, [on])
}
