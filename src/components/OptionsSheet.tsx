import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { resolveGroups } from '../lib/options'
import type { Item, LineOption, OptionChoice, OptionGroup } from '../db/types'
import { formatJod } from '../lib/money'
import Sheet from './Sheet'

const toLineOption = (g: OptionGroup, c: OptionChoice, n = 1): LineOption => ({
  groupId: g.id,
  groupName: g.name,
  choice: n > 1 ? `${c.name} ×${n}` : c.name,
  priceDelta: c.priceDelta * n,
  ...(c.costDelta ? { costDelta: c.costDelta * n } : {}),
})

const pickOf = (g: OptionGroup) => g.pick ?? 1

/**
 * اختيار خيارات الصنف. إذا في مجموعة وحدة بس (واختيار واحد)، الكبسة على الخيار بتضيف فورًا
 * (كبسة وحدة أقل). غير هيك: بتختار وبعدين «إضافة».
 * المجموعة اللي فيها «كم واحد» (مثلًا 4 مشروبات بالعرض): كل كبسة بتزيد واحد، و«−» بتنقّص.
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
  const single = groups.length === 1 && pickOf(groups[0]) === 1
  // لكل مجموعة: كم مرة انختار كل خيار
  const [picked, setPicked] = useState<Record<string, Record<string, number>>>({})
  const countIn = (g: OptionGroup) => Object.values(picked[g.id] ?? {}).reduce((s, n) => s + n, 0)
  const ready = groups.every((g) => (g.required ? countIn(g) === pickOf(g) : countIn(g) === 0 || countIn(g) === pickOf(g)))

  function pick(g: OptionGroup, c: OptionChoice) {
    if (single) return onAdd([toLineOption(g, c)])
    setPicked((p) => {
      const current = p[g.id] ?? {}
      if (pickOf(g) === 1) return { ...p, [g.id]: { [c.id]: 1 } }
      if (Object.values(current).reduce((sum, n) => sum + n, 0) >= pickOf(g)) return p
      return { ...p, [g.id]: { ...current, [c.id]: (current[c.id] ?? 0) + 1 } }
    })
  }

  function unpick(g: OptionGroup, c: OptionChoice) {
    setPicked((p) => {
      const current = { ...(p[g.id] ?? {}) }
      if ((current[c.id] ?? 0) <= 1) delete current[c.id]
      else current[c.id]--
      return { ...p, [g.id]: current }
    })
  }

  function add() {
    onAdd(
      groups.flatMap((g) =>
        g.choices.filter((c) => picked[g.id]?.[c.id]).map((c) => toLineOption(g, c, picked[g.id][c.id])),
      ),
    )
  }

  return (
    <Sheet title={item.name} onClose={onClose} wide={groups.some((g) => g.choices.length > 8)}>
      <div className="flex flex-col gap-5">
        {groups.map((g) => {
          const sections = new Map<string, OptionChoice[]>()
          for (const c of g.choices) sections.set(c.group ?? '', [...(sections.get(c.group ?? '') ?? []), c])
          const multi = pickOf(g) > 1
          const full = countIn(g) >= pickOf(g)
          return (
            <section key={g.id}>
              <h3 className="mb-2 font-bold text-green">
                {g.name}
                {multi && (
                  <span className={`ms-2 text-sm font-medium ${full ? 'text-green' : 'text-ink/60'}`}>
                    اختار <span className="num">{pickOf(g)}</span> (<span className="num">{countIn(g)}</span>/
                    <span className="num">{pickOf(g)}</span>){full && ' ✓'}
                  </span>
                )}
              </h3>
              <div className="flex flex-col gap-3">
                {[...sections].map(([label, choices]) => (
                  <div key={label}>
                    {label && <div className="mb-1.5 text-xs text-ink/50">{label}</div>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {choices.map((c) => {
                        const n = picked[g.id]?.[c.id] ?? 0
                        return (
                          <div key={c.id} className="relative">
                            <button
                              type="button"
                              onClick={() => pick(g, c)}
                              className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-xl px-4 py-2 text-start font-medium ${
                                n ? 'bg-green text-cream' : `bg-white/80 text-green ring-1 ring-cream-200 ${multi && full ? 'opacity-40' : 'active:bg-gold/40'}`
                              }`}
                            >
                              <span>
                                {c.name}
                                {multi && n > 0 && <span className="num ms-1 text-gold">×{n}</span>}
                              </span>
                              {c.priceDelta > 0 && <span className="num text-sm opacity-70">+{formatJod(c.priceDelta)}</span>}
                            </button>
                            {multi && n > 0 && (
                              <button
                                type="button"
                                aria-label={`نقّص ${c.name}`}
                                onClick={() => unpick(g, c)}
                                className="absolute -top-2 -left-2 grid size-9 place-items-center rounded-full bg-gold text-xl font-bold text-green shadow"
                              >
                                −
                              </button>
                            )}
                          </div>
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
          <button type="button" disabled={!ready} onClick={add} className="h-14 rounded-2xl bg-gold font-bold text-green disabled:opacity-40">
            إضافة
          </button>
        )}
      </div>
    </Sheet>
  )
}
