import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { CafeTable, TableArea } from '../db/types'
import { AREA_LABEL } from '../lib/tables'
import { ownerEdit } from '../lib/ownerEdits'
import { useSession } from '../lib/session'
import { timeLabelOf } from '../lib/time'
import { dayLabel } from '../lib/reports'
import Sheet from './Sheet'

const AREAS: TableArea[] = ['balcony', 'inside']

/** أسماء الطاولات: تغيير اسم أو مكان، زيادة، شيل. (للمالك، من التابلت أو من بعيد) */
export default function TablesEditor() {
  const data = useLiveQuery(async () => {
    const [tables, log, users] = await Promise.all([
      db.cafeTables.orderBy('sort').toArray(),
      db.auditLog.filter((a) => a.kind === 'table').toArray(),
      db.users.toArray(),
    ])
    return {
      tables,
      log: log.sort((a, b) => b.at - a.at).slice(0, 8),
      names: new Map(users.map((u) => [u.id!, u.name])),
    }
  }, [])
  const [editing, setEditing] = useState<CafeTable | null>(null)
  if (!data) return null

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-cream-200">
      <h2 className="mb-1 font-display text-xl text-green">الطاولات</h2>
      <p className="mb-4 text-sm text-ink/60">كبسة على طاولة لتغيير اسمها أو مكانها أو شيلها. الطلبات القديمة بتضل بأسمائها.</p>
      {AREAS.map((area) => (
        <div key={area} className="mb-4">
          <h3 className="mb-2 font-bold text-green">{AREA_LABEL[area]}</h3>
          <div className="flex flex-wrap gap-2">
            {data.tables
              .filter((t) => t.area === area)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditing(t)}
                  className="h-12 min-w-16 rounded-xl bg-white px-4 font-bold text-green ring-1 ring-cream-200 active:bg-gold/30"
                >
                  {t.name}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setEditing({ name: '', area, sort: 0 })}
              className="h-12 rounded-xl bg-cream-200 px-4 font-medium text-green active:bg-green-100"
            >
              + طاولة
            </button>
          </div>
        </div>
      ))}
      {data.log.length > 0 && (
        <div className="border-t border-cream-200 pt-3">
          <h3 className="mb-1 text-sm font-bold text-green">آخر التعديلات</h3>
          <ul className="flex flex-col divide-y divide-cream-200">
            {data.log.map((a) => (
              <li key={a.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-ink/50">
                  {dayLabel(a.at)} <span className="num">{timeLabelOf(a.at)}</span>
                </span>
                <span className="flex-1">
                  {a.summary}
                  {a.remote && <span className="ms-2 rounded-md bg-cream-200 px-1.5 py-0.5 text-xs text-green">من بعيد</span>}
                </span>
                <span className="shrink-0 text-xs font-bold text-green">{data.names.get(a.byUserId)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && <TableSheet table={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function TableSheet({ table, onClose }: { table: CafeTable; onClose: () => void }) {
  const { user } = useSession()
  const [name, setName] = useState(table.name)
  const [area, setArea] = useState<TableArea>(table.area)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const isNew = table.id == null

  async function act(fn: () => Promise<void>) {
    setError('')
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ما زبط')
      setAsking(false)
    }
  }

  return (
    <Sheet title={isNew ? 'طاولة جديدة' : `طاولة «${table.name}»`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-bold text-green">الاسم</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={isNew}
            className="h-14 rounded-xl bg-white px-4 text-lg ring-1 ring-cream-200 outline-none focus:ring-2 focus:ring-green"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              className={`h-12 rounded-xl font-medium ${area === a ? 'bg-green text-cream' : 'bg-cream-200 text-green active:bg-green-100'}`}
            >
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
        {error && <p className="text-center font-bold text-red-700">{error}</p>}
        {asking ? (
          <div className="rounded-2xl bg-red-800/10 p-3">
            <p className="mb-3 text-red-900">«{table.name}» رح تنشال من شاشة الطاولات.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setAsking(false)} className="h-14 rounded-xl bg-cream-200 font-bold text-green">
                رجوع
              </button>
              <button
                type="button"
                onClick={() => act(() => ownerEdit({ op: 'table-delete', tableId: table.id! }, user!.id!))}
                className="h-14 rounded-xl bg-red-800 font-bold text-cream"
              >
                شيلها
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            {!isNew && (
              <button
                type="button"
                onClick={() => setAsking(true)}
                className="h-14 shrink-0 rounded-2xl px-5 font-medium text-red-800 ring-1 ring-red-800/30 active:bg-red-700/10"
              >
                شيل
              </button>
            )}
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => act(() => ownerEdit({ op: 'table-save', table: { ...table, name, area } }, user!.id!))}
              className="h-14 flex-1 rounded-2xl bg-gold text-lg font-bold text-green active:bg-gold-600 disabled:opacity-40"
            >
              {isNew ? 'زيد' : 'حفظ'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
