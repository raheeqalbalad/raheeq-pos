import type { Shift } from '../db/types'
import { timeLabelOf } from './time'

// يوم الشغل = الشيفت: كل اشي صار بالشيفت بينحسب على يوم فتح الشيفت، حتى لو بعد نص الليل.
// اليوم الجديد ما بيبلّش إلا لما الشيفت يتسكّر وينفتح شيفت جديد.

const sameDate = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

/** "سكّر 1:30 بعد نص الليل" إذا الشيفت تسكّر بيوم تاني، وإلا فاضي */
export function afterMidnightNote(shift: Shift): string {
  if (!shift.closedAt || sameDate(shift.openedAt, shift.closedAt)) return ''
  return `سكّر ${timeLabelOf(shift.closedAt).replace(/^0/, '')} بعد نص الليل`
}

/** الشيفت المفتوح وصار بعد نص الليل؟ */
export const pastMidnight = (shift: Shift, now = Date.now()) => !shift.closedAt && !sameDate(shift.openedAt, now)

/** الشيفت اللي صار فيه هالوقت (لو في) */
export const shiftAt = (shifts: Shift[], ts: number) =>
  shifts.find((s) => ts >= s.openedAt && ts <= (s.closedAt ?? Number.MAX_SAFE_INTEGER))

/** يوم الشغل لهالوقت: وقت فتح الشيفت اللي صار فيه (وإلا الوقت نفسه) */
export const businessDayOf = (shifts: Shift[], ts: number) => shiftAt(shifts, ts)?.openedAt ?? ts
