export type View = 'tables' | 'history' | 'expenses' | 'stock' | 'close' | 'reports' | 'daylog' | 'customers' | 'menu' | 'users' | 'settings'

const ITEMS: { view: View; label: string }[] = [
  { view: 'tables', label: 'الطاولات' },
  { view: 'history', label: 'الطلبات' },
  { view: 'expenses', label: 'مصاريف الدرج' },
  { view: 'stock', label: 'المخزون' },
  { view: 'close', label: 'تسكير الشيفت' },
  { view: 'reports', label: 'التقارير' },
  { view: 'daylog', label: 'سجل الأيام' },
  { view: 'customers', label: 'الزباين' },
  { view: 'menu', label: 'المنيو' },
  { view: 'users', label: 'المستخدمين' },
  { view: 'settings', label: 'الإعدادات' },
]

/** تبويبات المالك بس */
const OWNER_ONLY: View[] = ['reports', 'daylog', 'customers', 'menu', 'users', 'settings']

/** تبويبات الشاشات الرئيسية تحت الهيدر. */
export default function ScreenNav({
  view,
  onChange,
  showReports = false,
  only,
}: {
  view: View
  onChange: (v: View) => void
  /** التقارير والمنيو للمالك بس */
  showReports?: boolean
  /** إذا محددة: هالتبويبات بس */
  only?: View[]
}) {
  return (
    <nav className="flex shrink-0 gap-2 overflow-x-auto bg-green px-4 pb-3">
      {ITEMS.filter((i) => (only ? only.includes(i.view) : showReports || !OWNER_ONLY.includes(i.view))).map((i) => (
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
