import { useEffect, useState } from 'react'
import { deviceMode, type DeviceMode } from './device'

/** وضع الجهاز مع السحابة (بيتحدّث لما يتغيّر) */
export function useDeviceMode(): DeviceMode | null {
  const [mode, setMode] = useState(deviceMode)
  useEffect(() => {
    const update = () => setMode(deviceMode())
    window.addEventListener('raheeq-cloud-mode', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('raheeq-cloud-mode', update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return mode
}

/** الجهاز داخل بالإيميل من بعيد (القاعدة نسخة من السحابة، والبيع على التابلت بس) */
export const useRemote = () => useDeviceMode() === 'viewer'
