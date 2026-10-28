import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'ok' | 'error'
type Notify = (msg: string, kind?: Kind) => void

const ToastContext = createContext<Notify>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: Kind }[]>([])

  const notify = useCallback<Notify>((msg, kind = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((list) => [...list, { id, msg, kind }])
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast-error' : ''}`}>
            {t.kind === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): Notify {
  return useContext(ToastContext)
}
