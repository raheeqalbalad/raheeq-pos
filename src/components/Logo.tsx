export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-11 rounded-xl" />
      <div className="leading-tight">
        <div className="font-display text-2xl font-bold">رحيق البلد</div>
        <div className="text-xs opacity-70">كافيه · وسط البلد</div>
      </div>
    </div>
  )
}
