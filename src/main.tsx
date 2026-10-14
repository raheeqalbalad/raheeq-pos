import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedIfEmpty, seedStockIfEmpty } from './db/seed'
import { SessionProvider } from './lib/session'
import { db } from './db/db'
import { keepScreenOn } from './lib/wakeLock'

// للتجربة وقت التطوير بس (ما بيدخل بنسخة النشر)
if (import.meta.env.DEV) Object.assign(window, { db })

keepScreenOn()

Promise.all([seedIfEmpty(), seedStockIfEmpty()]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SessionProvider>
        <App />
      </SessionProvider>
    </StrictMode>,
  )
})
