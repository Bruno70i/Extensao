import { ClipboardList } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Card, EmptyState, ErrorBox, Field, Loading, PageHead, StatusBadge } from '../../components/ui'
import { fetchAudit, fetchProfiles, fetchResidents, type AuditRow } from '../../lib/api'
import { addDays, formatShortDate } from '../../lib/format'
import { timeSP, todaySP } from '../../lib/schedule'
import type { Profile, Resident } from '../../lib/types'

export function AuditPage() {
  const today = todaySP(new Date())
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [residentId, setResidentId] = useState('')
  const [nurseId, setNurseId] = useState('')
  const [residents, setResidents] = useState<Resident[]>([])
  const [staff, setStaff] = useState<Profile[]>([])
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchResidents(), fetchProfiles()])
      .then(([r, p]) => {
        setResidents(r)
        setStaff(p.filter((x) => x.role !== 'family'))
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    fetchAudit({ from, to: to < from ? from : to, residentId: residentId || undefined, nurseId: nurseId || undefined })
      .then((r) => {
        setRows(r)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [from, to, residentId, nurseId])

  const correctedLater = useMemo(() => new Set(rows.map((r) => r.supersedes).filter(Boolean)), [rows])

  return (
    <div className="stack-lg">
      <PageHead title="Auditoria" sub="Todos os registros de doses, do mais recente para o mais antigo" />
      <Card>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Field label="De">
            <input className="input" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Até">
            <input className="input" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Residente">
            <select className="select" value={residentId} onChange={(e) => setResidentId(e.target.value)}>
              <option value="">Todos</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Registrado por">
            <select className="select" value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
              <option value="">Todos</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>
      {error && <ErrorBox message={error} />}
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClipboardList aria-hidden />} title="Nenhum registro no período" />
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Registrado em</th>
                  <th>Residente</th>
                  <th>Medicamento</th>
                  <th>Previsto</th>
                  <th>Status</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ opacity: correctedLater.has(r.id) ? 0.55 : 1 }}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatShortDate(todaySP(new Date(r.recorded_at)))} {timeSP(r.recorded_at)}
                    </td>
                    <td>{r.resident_name}</td>
                    <td>
                      {r.medication} <span className="muted small">· {r.dosage}</span>
                      {(r.reason || r.notes) && (
                        <div className="small muted">{[r.reason && `Motivo: ${r.reason}`, r.notes].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatShortDate(todaySP(new Date(r.scheduled_for)))} {timeSP(r.scheduled_for)}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.supersedes && <div className="small muted">correção</div>}
                      {correctedLater.has(r.id) && <div className="small muted">substituído</div>}
                    </td>
                    <td>{r.recorded_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 200 && <p className="small muted">Mostrando os 200 registros mais recentes. Use os filtros para refinar.</p>}
        </Card>
      )}
    </div>
  )
}
