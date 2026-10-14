import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { resolveGroups } from '../lib/options'
import type { Item, LineOption, OptionChoice, OptionGroup } from '../db/types'
import { formatJod } from '../lib/money'
import Sheet from './Sheet'

const toLineOption = (g: OptionGroup, c: OptionChoice): LineOption => ({
  groupId: g.id,
  groupName: g.name,
  choice: c.name,
  priceDelta: c.priceDelta,
  ...(c.costDelta ? { costDelta: c.costDelta } : {}),
})

/**
 * اختيار خيارات الصنف. إذا في مجموعة وحدة بس، الكبسة على الخيار بتضيف فورًا
 * (كبسة وحدة أقل). أكثر من مجموعة: بتختار وبعدين «إضافة».
 */
export default function OptionsSheet({
  item,
  onAdd,
  onClose,
}: {
  item: Item
  onAdd: (options: LineOption[]) => void
  onClose: () => void
}) {
  const lists = useLiveQuery(async () => new Map((await db.optionLists.toArray()).map((l) => [l.id, l])), [])
  const groups = resolveGroups(item, lists)
  const single = groups.length === 1
  const [picked, setPicked] = useState<Record<string, OptionChoice>>({})
  const ready = groups.every((g) => !g.required || picked[g.id])

  function pick(g: OptionGroup, c: OptionChoice) {
    if (single) return onAdd([toLineOption(g, c)])
    setPicked((p) => ({ ...p, [g.id]: c }))
  }

  return (
    <Sheet title={item.name} onClose={onClose} wide={groups.some((g) => g.choices.length > 8)}>
      <div className="flex flex-col gap-5">
        {groups.map((g) => {
          const sections = new Map<string, OptionChoice[]>()
          for (const c of g.choices) sections.set(c.group ?? '', [...(sections.get(c.group ?? '') ?? []), c])
          return (
            <section key={g.id}>
              <h3 className="mb-2 font-bold text-green">{g.name}</h3>
              <div className="flex flex-col gap-3">
                {[...sections].map(([label, choices]) => (
                  <div key={label}>
                    {label && <div className="mb-1.5 text-xs text-ink/50">{label}</div>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {choices.map((c) => {
                        const on = picked[g.id]?.id === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => pick(g, c)}
                            className={`flex min-h-14 items-center justify-between gap-2 rounded-xl px-4 py-2 text-start font-medium ${
                              on ? 'bg-green text-cream' : 'bg-white/80 text-green ring-1 ring-cream-200 active:bg-gold/40'
                            }`}
                          >
                            <span>{c.name}</span>
                            {c.priceDelta > 0 && <span className="num text-sm opacity-70">+{formatJod(c.priceDelta)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
        {!single && (
          <button
            type="button"
            disabled={!ready}
            onClick={() => onAdd(groups.flatMap((g) => (picked[g.id] ? [toLineOption(g, picked[g.id])] : [])))}
            className="h-14 rounded-2xl bg-gold font-bold text-green disabled:opacity-40"
          >
            إضافة
          </button>
        )}
      </div>
    </Sheet>
  )
}
