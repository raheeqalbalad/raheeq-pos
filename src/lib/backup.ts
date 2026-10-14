import { db } from '../db/db'

// نسخة احتياطية كاملة لكل الجداول بملف JSON واحد، والاسترجاع بيرجّع كل اشي زي ما كان.

const APP = 'raheeq-pos'

interface BackupFile {
  app: typeof APP
  /** نسخة قاعدة البيانات وقت التنزيل */
  dbVersion: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

export async function downloadBackup() {
  const tables: Record<string, unknown[]> = {}
  await db.transaction('r', db.tables, async () => {
    for (const t of db.tables) tables[t.name] = await t.toArray()
  })
  const backup: BackupFile = { app: APP, dbVersion: db.verno, exportedAt: Date.now(), tables }

  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const filename = `raheeq-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export interface BackupInfo {
  exportedAt: number
  counts: Record<string, number>
}

/** بيقرا الملف وبيتأكد إنه نسخة من هالسيستم، قبل أي مسح. */
export async function readBackup(file: File): Promise<{ backup: BackupFile; info: BackupInfo }> {
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('الملف مش نسخة احتياطية (مش JSON)')
  }
  const b = data as Partial<BackupFile>
  if (b?.app !== APP || typeof b.tables !== 'object' || !b.tables) throw new Error('الملف مش نسخة احتياطية من سيستم رحيق البلد')
  if ((b.dbVersion ?? 0) > db.verno) throw new Error('النسخة من إصدار أحدث من السيستم. حدّث التطبيق أول')
  const known = new Set(db.tables.map((t) => t.name))
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!known.has(name) || !Array.isArray(rows)) throw new Error(`جدول غريب بالملف: ${name}`)
  }
  if (!b.tables.items?.length) throw new Error('النسخة ما فيها منيو، شكلها فاضية')
  const counts = Object.fromEntries(Object.entries(b.tables).map(([k, v]) => [k, v.length]))
  return { backup: b as BackupFile, info: { exportedAt: b.exportedAt ?? 0, counts } }
}

/** بيمسح كل اشي وبيرجّع النسخة. كله بعملية وحدة: إذا فشل اشي، ولا اشي بيتغيّر. */
export async function restoreBackup(backup: BackupFile) {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear()
      const rows = backup.tables[t.name]
      if (rows?.length) await t.bulkAdd(rows)
    }
  })
}
