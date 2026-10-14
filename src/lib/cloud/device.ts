// وضع الجهاز مع السحابة (محفوظ على الجهاز نفسه):
//   - بدون: كل إشي محلي زي ما هو (الافتراضي).
//   - cafe: التابلت المربوط بحساب الكافيه. بيحفظ محليًا أول، وبيرفع نسخة للسحابة.
//   - viewer: دخول بالإيميل من تلفون أو لابتوب. بيسحب نسخة من السحابة. المالك بيشوف كل إشي وبيبعت
//     تعديلات المنيو والإعدادات للتابلت، والباقي تقارير بس.

export type DeviceMode = 'cafe' | 'viewer'

const MODE_KEY = 'raheeq-cloud-mode'
const ROLE_KEY = 'raheeq-cloud-role'
const DEVICE_KEY = 'raheeq-device-id'

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // بدون تخزين: الجهاز بيضل محلي
  }
}

export function deviceMode(): DeviceMode | null {
  const m = read(MODE_KEY)
  return m === 'cafe' || m === 'viewer' ? m : null
}

export function setDeviceMode(mode: DeviceMode | null) {
  write(MODE_KEY, mode)
  window.dispatchEvent(new Event('raheeq-cloud-mode'))
}

/** رقم ثابت لهالجهاز (عشان حساب الكافيه ما ينربط بجهازين). */
export function deviceId(): string {
  let id = read(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    write(DEVICE_KEY, id)
  }
  return id
}

export type ViewerRole = 'owner' | 'partner' | 'cafe'

/** دور الحساب الداخل بالإيميل على هالجهاز */
export function viewerRole(): ViewerRole | null {
  const r = read(ROLE_KEY)
  return r === 'owner' || r === 'partner' || r === 'cafe' ? r : null
}

export function setViewerRole(role: ViewerRole | null) {
  write(ROLE_KEY, role)
}

/** المالك داخل من بعيد (بيشوف كل إشي وبيعدّل المنيو والإعدادات) */
export const isRemoteOwner = () => deviceMode() === 'viewer' && viewerRole() === 'owner'
