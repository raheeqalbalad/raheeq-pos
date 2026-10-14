/** خانة مبلغ بالدينار (أرقام ونقطة بس). */
export default function MoneyInput({
  value,
  onChange,
  placeholder = '0.00',
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <input
      inputMode="decimal"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      className="num h-14 w-full min-w-0 rounded-xl bg-white px-4 text-2xl ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
    />
  )
}
