import { useState, type FormEvent } from 'react'
import { Button, Dialog, Field } from '../../components/ui'
import { recordDose } from '../../lib/api'
import { statusLabel, timeSP } from '../../lib/schedule'
import type { DoseItem, RecordStatus, Resident } from '../../lib/types'
import { validateDose } from '../../lib/validation'

const OPTIONS: { value: RecordStatus; hint: string }[] = [
  { value: 'given', hint: 'O residente tomou o medicamento' },
  { value: 'refused', hint: 'O residente não quis tomar' },
  { value: 'missed', hint: 'Não foi possível aplicar (ex.: em jejum, ausente, falta do remédio)' },
]

export function RecordDoseDialog({
  item,
  resident,
  initial,
  onClose,
  onSaved,
  onError,
}: {
  item: DoseItem
  resident: Resident | undefined
  initial: RecordStatus
  onClose: () => void
  onSaved: () => void
  onError: (e: unknown) => void
}) {
  const correcting = item.record !== null
  const [status, setStatus] = useState<RecordStatus>(initial)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = validateDose({ status, reason })
    if (v) return setError(v)
    setBusy(true)
    try {
      await recordDose({
        prescription_id: item.prescription.id,
        scheduled_for: item.scheduledFor.toISOString(),
        status,
        reason,
        notes,
        supersedes: item.record?.id,
      })
      onSaved()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  const p = item.prescription
  return (
    <Dialog title={correcting ? 'Corrigir registro' : 'Registrar dose'} onClose={onClose}>
      <div className="card" style={{ background: 'var(--bg)', boxShadow: 'none' }}>
        <strong>{resident?.full_name}</strong>
        <p className="muted small">
          {p.medication} · {p.dosage} · {p.route} · {timeSP(item.scheduledFor)}
        </p>
        {correcting && item.record && (
          <p className="small" style={{ marginTop: 6 }}>
            Registro atual: <strong>{statusLabel[item.record.status]}</strong>
          </p>
        )}
      </div>
      <form className="stack" onSubmit={submit}>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>
            O que aconteceu?
          </legend>
          {OPTIONS.map((o) => (
            <label key={o.value} className={`choice ${status === o.value ? 'choice-on' : ''}`}>
              <input
                type="radio"
                name="status"
                value={o.value}
                checked={status === o.value}
                onChange={() => {
                  setStatus(o.value)
                  setError(null)
                }}
              />
              <span>
                <strong>{statusLabel[o.value]}</strong>
                <span className="small muted" style={{ display: 'block' }}>
                  {o.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {status !== 'given' && (
          <Field label="Motivo" error={error}>
            <input
              className="input"
              value={reason}
              autoFocus
              placeholder="Ex.: estava com náusea"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        <Field label="Observação (opcional)">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            {correcting ? 'Salvar correção' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
