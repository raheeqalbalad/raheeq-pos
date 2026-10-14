import { useSyncExternalStore } from 'react'

// البطارية والشاحن (التطبيق بالشاشة الكاملة بيخبّي شريط أندرويد). إذا المتصفح ما بيدعم
// navigator.getBattery، الحالة بتضل null والمؤشر بيختفي.

export interface BatteryState {
  /** 0–100 */
  level: number
  charging: boolean
}

interface BatteryManagerLike extends EventTarget {
  level: number
  charging: boolean
}

let state: BatteryState | null = null
const listeners = new Set<() => void>()
let started = false

function set(next: BatteryState | null) {
  state = next
  for (const l of listeners) l()
}

function start() {
  if (started) return
  started = true
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }
  nav
    .getBattery?.()
    .then((b) => {
      const update = () => set({ level: Math.round(b.level * 100), charging: b.charging })
      b.addEventListener('levelchange', update)
      b.addEventListener('chargingchange', update)
      update()
    })
    .catch(() => set(null))
  // للتجربة وقت التطوير بس: window.__setBattery(15, false)
  if (import.meta.env.DEV)
    Object.assign(window, { __setBattery: (level: number, charging: boolean) => set({ level, charging }) })
}

const store = {
  subscribe(l: () => void) {
    start()
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => state,
}

export const useBattery = () => useSyncExternalStore(store.subscribe, store.get)
