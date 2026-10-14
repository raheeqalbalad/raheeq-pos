import { useBattery } from '../lib/battery'
import { useDeviceMode } from '../lib/cloud/useDeviceMode'

/**
 * تنبيه البطارية على التابلت: تحت 20% والشاحن مش شابك → شريط أحمر «اشبك الشاحن» بيضل لحد ما ينشبك.
 * على 10% وأقل → أكبر. ما بيغطّي ولا زر (بيدفش الشاشة لتحت) فما بيمنع البيع.
 */
export default function BatteryAlert() {
  const battery = useBattery()
  const mode = useDeviceMode()
  if (!battery || battery.charging || battery.level >= 20 || mode === 'viewer') return null
  const critical = battery.level <= 10
  return (
    <div
      role="alert"
      className={`flex shrink-0 items-center justify-center gap-3 bg-red-700 text-center font-bold text-white ${
        critical ? 'animate-pulse py-3 text-xl' : 'py-1.5 text-base'
      }`}
    >
      <span aria-hidden>{critical ? '🪫' : '🔋'}</span>
      <span>
        البطارية <span className="num">{battery.level}%</span> — اشبك الشاحن
        {critical && ' هلق، التابلت رح يطفي'}
      </span>
    </div>
  )
}
