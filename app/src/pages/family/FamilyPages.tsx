import { AlertTriangle, Clock, HeartHandshake, Radio } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DoseTimeline } from '../../components/DoseTimeline'
import { Avatar, Card, DayNav, EmptyState, ErrorBox, Loading, PageHead } from '../../components/ui'
import { fetchAdministrationsForDay, fetchPrescriptions, fetchStaffNames, type LinkedResident } from '../../lib/api'
import { ageOn, capitalize, formatDay, formatShortDate } from '../../lib/format'
import { subscribeAdministrations } from '../../lib/realtime'
import { buildSchedule, isActiveOn, timeSP, todaySP } from '../../lib/schedule'
import type { Administration, Prescription } from '../../lib/types'
import { useMyResidents } from './useMyResidents'

function ResidentPicker({
  residents,
  selectedId,
  onSelect,
}: {
  residents: LinkedResident[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  if (residents.length < 2) return null
  return (
    <div className="chips" role="tablist" aria-label="Escolher residente">
      {residents.map((r) => (
        <button key={r.id} className={`chip ${r.id === selectedId ? 'active' : ''}`} onClick={() => onSelect(r.id)}>
          {r.full_name.split(' ')[0]}
        </button>
      ))}
    </div>
  )
}

function NoLink() {
  return (
    <EmptyState
      icon={<HeartHandshake aria-hidden />}
      title="Nenhum residente vinculado"
      text="Fale com a clínica para vincular o seu familiar à sua conta."
    />
  )
}

/** Prescrições + registros de um residente em um dia, com atualização em tempo real. */
function useDay(residentId: string | undefined, day: string, live: boolean) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [records, setRecords] = useState<Administration[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!residentId) return
    try {
      const rx = await fetchPrescriptions([residentId])
      const recs = await fetchAdministrationsForDay(
        day,
        rx.map((p) => p.id),
      )
      setPrescriptions(rx)
      setRecords(recs)
      setNames(await fetchStaffNames(recs.map((r) => r.recorded_by)))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [residentId, day])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const ids = prescriptions.map((p) => p.id).join(',')
  useEffect(() => {
    if (!live || !ids) return
    return subscribeAdministrations(ids.split(','), load)
  }, [ids, live, load])

  return { prescriptions, records, names, loading, error, reload: load }
}

export function FamilyHomePage() {
  const { residents, selected, select, loading, error } = useMyResidents()
  const [now, setNow] = useState(() => new Date())
  const today = todaySP(now)
  const data = useDay(selected?.id, today, true)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const items = useMemo(
    () => buildSchedule(data.prescriptions, data.records, today, now),
    [data.prescriptions, data.records, today, now],
  )
  const given = items.filter((i) => i.status === 'given').length
  const next = items.find((i) => i.status === 'pending')
  const active = data.prescriptions.filter((p) => isActiveOn(p, today))

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!selected) return <NoLink />

  return (
    <div className="stack-lg">
      <ResidentPicker residents={residents} selectedId={selected.id} onSelect={select} />

      <Card className="stack">
        <div className="row">
          <Avatar name={selected.full_name} large />
          <div>
            <h1 style={{ fontSize: '1.4rem' }}>{selected.full_name}</h1>
            <p className="muted">
              {[
                selected.relationship,
                selected.room && `Quarto ${selected.room}`,
                selected.birth_date && `${ageOn(selected.birth_date, today)} anos`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        {selected.allergies && (
          <div className="allergy-box">
            <AlertTriangle size={20} style={{ flex: 'none' }} aria-hidden />
            <span>Alergias: {selected.allergies}</span>
          </div>
        )}
      </Card>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <Card>
          <div className="stat-value">
            {given}
            <span className="muted" style={{ fontSize: '1.1rem' }}>
              {' '}
              / {items.length}
            </span>
          </div>
          <div className="stat-label">doses aplicadas hoje</div>
          <div className="progress" aria-hidden>
            <span style={{ width: items.length ? `${(given / items.length) * 100}%` : 0 }} />
          </div>
        </Card>
        <Card>
          <div className="stat-value">{next ? timeSP(next.scheduledFor) : '—'}</div>
          <div className="stat-label">{next ? `próxima: ${next.prescription.medication}` : 'sem doses pendentes'}</div>
        </Card>
      </div>

      <Card className="stack">
        <div className="row-between">
          <h2>Hoje</h2>
          <span className="small muted row" style={{ gap: 6 }}>
            <Radio size={16} color="var(--ok)" aria-hidden /> Atualiza sozinho
          </span>
        </div>
        <p className="small muted">{capitalize(formatDay(today))}</p>
        {data.error && <ErrorBox message={data.error} onRetry={data.reload} />}
        {data.loading ? <Loading /> : <DoseTimeline items={items} names={data.names} />}
      </Card>

      <Card>
        <h2 style={{ marginBottom: 8 }}>Medicações em uso</h2>
        {active.length === 0 ? (
          <EmptyState title="Nenhuma medicação em uso" />
        ) : (
          active.map((p) => (
            <div key={p.id} className="rx">
              <div>
                <strong>{p.medication}</strong> <span className="muted">· {p.dosage} · {p.route}</span>
              </div>
              <div className="times">
                {p.times.map((t) => (
                  <span key={t} className="time-pill">
                    <Clock size={12} aria-hidden style={{ marginRight: 4, verticalAlign: -1 }} />
                    {t}
                  </span>
                ))}
              </div>
              {p.instructions && <p className="small">{p.instructions}</p>}
              <p className="small muted">
                Prescrito por {p.prescriber_name} · desde {formatShortDate(p.start_date)}
                {p.end_date && ` até ${formatShortDate(p.end_date)}`}
              </p>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

export function FamilyHistoryPage() {
  const { residents, selected, select, loading, error } = useMyResidents()
  const today = todaySP(new Date())
  const [day, setDay] = useState(today)
  const data = useDay(selected?.id, day, day === today)
  const items = useMemo(
    () => buildSchedule(data.prescriptions, data.records, day, new Date()),
    [data.prescriptions, data.records, day],
  )

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!selected) return <NoLink />

  return (
    <div className="stack-lg">
      <PageHead title="Histórico" sub={selected.full_name} />
      <ResidentPicker residents={residents} selectedId={selected.id} onSelect={select} />
      <Card className="stack">
        <div className="row-between">
          <h2>{capitalize(formatDay(day))}</h2>
          <DayNav day={day} max={today} onChange={setDay} />
        </div>
        {data.error && <ErrorBox message={data.error} onRetry={data.reload} />}
        {data.loading ? <Loading /> : <DoseTimeline items={items} names={data.names} />}
      </Card>
    </div>
  )
}
