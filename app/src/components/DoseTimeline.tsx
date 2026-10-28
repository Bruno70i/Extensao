import { CalendarX } from 'lucide-react'
import { timeSP } from '../lib/schedule'
import type { DoseItem } from '../lib/types'
import { EmptyState, StatusBadge } from './ui'

/** Lista das doses de um dia, em ordem de horário, com quem registrou. */
export function DoseTimeline({
  items,
  names,
  emptyText = 'Nenhuma dose prevista para este dia.',
}: {
  items: DoseItem[]
  names: Record<string, string>
  emptyText?: string
}) {
  if (items.length === 0) return <EmptyState title={emptyText} icon={<CalendarX aria-hidden />} />
  return (
    <ol className="timeline">
      {items.map((i) => {
        const p = i.prescription
        return (
          <li key={`${p.id}|${i.scheduledFor.toISOString()}`} className={`tl-item tl-${i.status}`}>
            <span className="tl-time">{timeSP(i.scheduledFor)}</span>
            <span className="tl-dot" aria-hidden />
            <div className="tl-body">
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <strong>{p.medication}</strong> <span className="muted">· {p.dosage}</span>
                </div>
                <StatusBadge status={i.status} />
              </div>
              {i.record && (
                <p className="small muted">
                  {i.record.status === 'given' ? 'Aplicada' : 'Registrado'} às {timeSP(i.record.recorded_at)} por{' '}
                  {names[i.record.recorded_by] ?? 'equipe'}
                  {i.record.reason && ` · Motivo: ${i.record.reason}`}
                  {i.record.notes && ` · ${i.record.notes}`}
                  {i.record.supersedes && ' · corrigido'}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
