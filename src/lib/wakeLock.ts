// الشاشة ما بتطفي لحالها والتطبيق مفتوح (Screen Wake Lock).
// المتصفح بيفك القفل لحاله لما التطبيق يختفي، فبنرجع نطلبه كل ما يرجع يبيّن،
// ومع أول لمسة إذا الطلب الأول انرفض.

type Sentinel = { released: boolean; release: () => Promise<void> }

let sentinel: Sentinel | null = null

async function acquire() {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock
  if (!wakeLock || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
  try {
    sentinel = await wakeLock.request('screen')
  } catch {
    // مرفوض هلق (مثلًا البطارية واطية أو ما في لمسة لسا): بنرجع نجرّب مع اللمسة الجاية
  }
}

export function keepScreenOn() {
  acquire()
  document.addEventListener('visibilitychange', acquire)
  document.addEventListener('pointerdown', acquire, { passive: true })
}
