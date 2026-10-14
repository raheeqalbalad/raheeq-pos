import { db } from '../db/db'
import type { CheckMark, ChecklistTask } from '../db/types'

// مهام الفتح والتسكير: المالك بيكتبها من الإعدادات، والموظف لازم يعلّم عليها كلها قبل ما يكمّل.
// كل علامة بينحفظ معها مين علّم ومتى.

export interface Checklists {
  open: ChecklistTask[]
  close: ChecklistTask[]
}

export type ChecklistKind = keyof Checklists

const KEY = 'checklists'

export async function getChecklists(): Promise<Checklists> {
  return { open: [], close: [], ...((await db.settings.get(KEY))?.value as Partial<Checklists> | undefined) }
}

export async function saveChecklists(c: Checklists) {
  const clean = (tasks: ChecklistTask[]) => tasks.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text)
  await db.settings.put({ key: KEY, value: { open: clean(c.open), close: clean(c.close) } })
}

/** كل المهام متعلّم عليها؟ */
export const allChecked = (tasks: ChecklistTask[], marks: CheckMark[] | undefined) =>
  tasks.every((t) => marks?.some((m) => m.taskId === t.id))

/** بيعلّم (أو بيشيل العلامة) على مهمة تسكير، وبتنحفظ على الشيفت فورًا. */
export async function toggleCloseCheck(shiftId: number, task: ChecklistTask, by: number) {
  await db.transaction('rw', 'shifts', async () => {
    const shift = await db.shifts.get(shiftId)
    if (!shift || shift.closedAt) return
    const marks = shift.closeChecks ?? []
    const next = marks.some((m) => m.taskId === task.id)
      ? marks.filter((m) => m.taskId !== task.id)
      : [...marks, { taskId: task.id, text: task.text, by, at: Date.now() }]
    await db.shifts.update(shiftId, { closeChecks: next })
  })
}
