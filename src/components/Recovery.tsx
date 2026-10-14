import { logError } from '../lib/errorLog'
import { Component, type ReactNode } from 'react'
import Logo from './Logo'

/** شاشة بدل الشاشة الفاضية لما يصير خطأ: رسالة واضحة وزر إعادة تشغيل. البيانات ما بتنمس. */
export function RecoveryScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto bg-green px-6 py-8 text-center text-cream">
      <Logo />
      <h1 className="font-display text-2xl text-gold">{title}</h1>
      <p className="max-w-md opacity-80">البيانات محفوظة على الجهاز وما بتنمسح. اكبس «أعد التشغيل».</p>
      {detail && <p className="num max-w-md text-xs break-all opacity-50">{detail}</p>}
      <button
        type="button"
        onClick={() => location.reload()}
        className="h-14 rounded-2xl bg-gold px-8 text-lg font-bold text-green active:bg-gold-600"
      >
        أعد التشغيل
      </button>
    </div>
  )
}

/** أي خطأ بالعرض بيطلّع شاشة الإصلاح بدل ما التطبيق يصير فاضي. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    logError(error.message, error.stack?.split('\n')[1]?.trim())
    console.error('خطأ بالتطبيق:', error)
  }

  render() {
    return this.state.error ? <RecoveryScreen title="صار خطأ" detail={this.state.error.message} /> : this.props.children
  }
}
