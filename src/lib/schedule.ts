import type { ItemSchedule } from '../db/types'

// أوقات العروض للعرض (بدون قاعدة البيانات، عشان صفحة المنيو العامة كمان).

export const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** الوقت ("9:00–12:00") والأيام ("الجمعة، السبت") لعرضهم. فاضيين إذا طول الوقت */
export function scheduleParts(s: ItemSchedule | undefined): { time: string; days: string } {
  return {
    time: s?.from && s.to ? `${s.from.replace(/^0/, '')}–${s.to.replace(/^0/, '')}` : '',
    days:
      s?.days?.length && s.days.length < 7
        ? [...s.days]
            .sort()
            .map((d) => WEEK_DAYS[d])
            .join('، ')
        : '',
  }
}
