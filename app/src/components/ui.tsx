import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  MinusCircle,
  XCircle,
} from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useEffect } from 'react'
import { statusLabel } from '../lib/schedule'
import type { DoseStatus } from '../lib/types'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({
  variant = 'primary',
  loading = false,
  block = false,
  small = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  block?: boolean
  small?: boolean
}) {
  const cls = ['btn', `btn-${variant}`, block && 'btn-block', small && 'btn-sm', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>
}

const statusIcon = {
  pending: Clock,
  late: AlertTriangle,
  given: CheckCircle2,
  refused: XCircle,
  missed: MinusCircle,
}

export function StatusBadge({ status }: { status: DoseStatus }) {
  const Icon = statusIcon[status]
  return (
    <span className={`badge badge-${status}`}>
      <Icon aria-hidden />
      {statusLabel[status]}
    </span>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function EmptyState({ title, text, icon }: { title: string; text?: string; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox aria-hidden />}
      <p className="empty-title">{title}</p>
      {text && <p className="small">{text}</p>}
    </div>
  )
}

const avatarColors = [
  ['#e6f4f2', '#0b5d57'],
  ['#e8eefc', '#2a4a9a'],
  ['#fdf0e6', '#8a4510'],
  ['#f3e9f8', '#6b2f86'],
  ['#e9f5e9', '#2f6b30'],
  ['#fbe9ee', '#8f2546'],
]

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p))
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const [bg, fg] = avatarColors[h % avatarColors.length]
  return (
    <span className={`avatar ${large ? 'avatar-lg' : ''}`} style={{ background: bg, color: fg }} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  )
}

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog stack" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Loading() {
  return (
    <div className="empty" role="status">
      <span className="spinner" style={{ display: 'inline-block', color: 'var(--primary)' }} />
      <p className="small" style={{ marginTop: 8 }}>
        Carregando…
      </p>
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error row-between" role="alert">
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" small onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  )
}
