import type { ReactNode } from 'react'

/** نافذة من تحت على التلفون، وبالنص على التابلت. */
export default function Sheet({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90%] w-full flex-col rounded-t-3xl bg-cream shadow-xl md:rounded-3xl ${
          wide ? 'md:max-w-3xl' : 'md:max-w-lg'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-cream-200 px-5 py-3">
          <h2 className="font-display text-xl text-green">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="سكّر"
            className="size-12 rounded-xl text-2xl text-green active:bg-cream-200"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
