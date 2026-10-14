import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSession } from './lib/session'
import { getOpenShift } from './lib/shift'
import LoginScreen from './screens/LoginScreen'
import SetupScreen from './screens/SetupScreen'
import { db } from './db/db'
import ReportsScreen from './screens/ReportsScreen'
import InventoryScreen from './screens/InventoryScreen'
import MenuEditorScreen from './screens/MenuEditorScreen'
import UsersScreen from './screens/UsersScreen'
import TablesScreen, { type OpenRequest } from './screens/TablesScreen'
import OrderScreen from './screens/OrderScreen'
import OpenShiftScreen from './screens/OpenShiftScreen'
import HistoryScreen from './screens/HistoryScreen'
import ExpensesScreen from './screens/ExpensesScreen'
import CloseShiftScreen, { ClosedShiftScreen } from './screens/CloseShiftScreen'
import Header from './components/Header'
import ScreenNav, { type View } from './components/ScreenNav'

export default function App() {
  const { user } = useSession()
  const userCount = useLiveQuery(() => db.users.count(), [])

  if (!user) {
    if (userCount === undefined) return null
    return userCount === 0 ? <SetupScreen /> : <LoginScreen />
  }
  // key: كل دخول بيبلّش من الطاولات بحالة نظيفة (ما بيرجع لطلب أو شاشة من الجلسة اللي قبل)
  return <SignedIn key={user.id} />
}

function SignedIn() {
  const { user: currentUser, logout } = useSession()
  const user = currentUser!
  // null = ما في شيفت مفتوح، undefined = لسا بيحمّل
  const shift = useLiveQuery(async () => (await getOpenShift()) ?? null, [])
  const [view, setView] = useState<View>('tables')
  const [open, setOpen] = useState<OpenRequest | null>(null)
  const [message, setMessage] = useState<string>()
  const [justClosed, setJustClosed] = useState<number | null>(null)

  const owner = user.role === 'owner'

  // الشريك بيشوف التقارير بس
  if (user.role === 'partner')
    return (
      <div className="flex h-full flex-col">
        <Header />
        <ReportsScreen />
      </div>
    )

  if (justClosed)
    return (
      <ClosedShiftScreen
        shiftId={justClosed}
        onDone={() => {
          setJustClosed(null)
          setView('tables')
          logout()
        }}
      />
    )

  if (shift === undefined) return null
  if (shift === null) {
    if (owner && view === 'reports')
      return (
        <div className="flex h-full flex-col">
          <Header title="التقارير" onBack={() => setView('tables')} backLabel="→ فتح الشيفت" />
          <ReportsScreen />
        </div>
      )
    return <OpenShiftScreen onReports={owner ? () => setView('reports') : undefined} />
  }

  if (open) {
    const done = (msg?: string) => {
      setOpen(null)
      setMessage(msg)
      if (msg) setTimeout(() => setMessage(undefined), 4000)
    }
    const onMoved: Parameters<typeof OrderScreen>[0]['onMoved'] = (table, orderId) =>
      setOpen({ kind: 'table', table, orderId })
    return open.kind === 'table' ? (
      <OrderScreen
        key={`t${open.table.id}`}
        orderId={open.orderId}
        target={{ tableId: open.table.id!, label: open.table.name }}
        title={open.table.name}
        onDone={done}
        onMoved={onMoved}
      />
    ) : (
      <OrderScreen
        key={`k${open.orderId ?? 'new'}`}
        orderId={open.orderId}
        target={{ takeaway: true }}
        title={open.label ?? 'تيك أواي جديد'}
        onDone={done}
        onMoved={onMoved}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Header />
      <ScreenNav view={view} onChange={setView} showReports={owner} />
      {view === 'tables' && <TablesScreen onOpen={setOpen} message={message} />}
      {view === 'history' && <HistoryScreen shift={shift} />}
      {view === 'expenses' && <ExpensesScreen shift={shift} />}
      {view === 'stock' && <InventoryScreen />}
      {view === 'close' && <CloseShiftScreen shift={shift} onClosed={setJustClosed} />}
      {view === 'reports' && owner && <ReportsScreen />}
      {view === 'menu' && owner && <MenuEditorScreen />}
      {view === 'users' && owner && <UsersScreen />}
    </div>
  )
}
