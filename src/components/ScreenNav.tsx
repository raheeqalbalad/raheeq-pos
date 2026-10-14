export type View = 'tables' | 'history' | 'expenses' | 'stock' | 'close' | 'reports' | 'menu' | 'users'

const ITEMS: { view: View; label: string }[] = [
  { view: 'tables', label: 'الطاولات' },
  { view: 'history', label: 'الطلبات' },
  { view: 'expenses', label: 'مصاريف الدرج' },
  { view: 'stock', label: 'المخزون' },
  { view: 'close', label: 'تسكير الشيفت' },
  { view: 'reports', label: 'التقارير' },
  { view: 'menu', label: 'المنيو' },
  { view: 'users', label: 'المستخدمين' },
]

/** تبويبات المالك بس */
const OWNER_ONLY: View[] = ['reports', 'menu', 'users']

/** تبويبات الشاشات الرئيسية تحت الهيدر. */
export default function ScreenNav({
  view,
  onChange,
  showReports = false,
}: {
  view: View
  onChange: (v: View) => void
  /** التقارير والمنيو للمالك بس */
  showReports?: boolean
}) {
  return (
    <nav className="flex shrink-0 gap-2 overflow-x-auto bg-green px-4 pb-3">
      {ITEMS.filter((i) => showReports || !OWNER_ONLY.includes(i.view)).map((i) => (
        <button
          key={i.view}
          type="button"
          onClick={() => onChange(i.view)}
          className={`h-12 shrink-0 rounded-xl px-4 font-medium whitespace-nowrap ${
            view === i.view ? 'bg-gold text-green' : 'bg-green-700 text-cream active:bg-gold/40'
          }`}
        >
          {i.label}
        </button>
      ))}
    </nav>
  )
}
