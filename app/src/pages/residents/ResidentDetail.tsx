import { AlertTriangle, ArrowLeft, Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DoseTimeline } from '../../components/DoseTimeline'
import { Avatar, Button, Card, DayNav, Dialog, EmptyState, ErrorBox, Loading } from '../../components/ui'
import { useToast } from '../../components/toast'
import {
  endPrescription,
  fetchAdministrationsForDay,
  fetchPrescriptions,
  fetchResident,
  fetchStaffNames,
  saveResident,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ageOn, formatShortDate } from '../../lib/format'
import { endDateFor } from '../../lib/rules'
import { buildSchedule, todaySP } from '../../lib/schedule'
import type { Administration, Prescription, Resident } from '../../lib/types'

function PrescriptionItem({ p, onEnd, residentId }: { p: Prescription; onEnd?: () => void; residentId: string }) {
  return (
    <div className="rx">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong>{p.medication}</strong> <span className="muted">· {p.dosage} · {p.route}</span>
        </div>
        {onEnd && (
          <div className="row" style={{ gap: 4 }}>
            <Link to={`/residentes/${residentId}/prescricoes/${p.id}/editar`} className="btn btn-ghost btn-sm">
              <Pencil size={16} aria-hidden /> Editar
            </Link>
            <Button variant="ghost" small onClick={onEnd} style={{ color: 'var(--danger)' }}>
              Encerrar
            </Button>
          </div>
        )}
      </div>
      <div className="times">
        {p.times.map((t) => (
          <span key={t} className="time-pill">
            {t}
          </span>
        ))}
      </div>
      {p.instructions && <p className="small">{p.instructions}</p>}
      <p className="small muted">
        {p.prescriber_name} ({p.prescriber_crm}) · desde {formatShortDate(p.start_date)}
        {p.end_date ? ` até ${formatShortDate(p.end_date)}` : ' · uso contínuo'}
      </p>
    </div>
  )
}

export function ResidentDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const toast = useToast()
  const today = todaySP(new Date())
  const [resident, setResident] = useState<Resident | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [records, setRecords] = useState<Administration[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [day, setDay] = useState(today)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ending, setEnding] = useState<Prescription | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, rx] = await Promise.all([fetchResident(id!), fetchPrescriptions([id!])])
      setResident(r)
      setPrescriptions(rx)
      setError(r ? null : 'Residente não encontrado ou sem acesso.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (prescriptions.length === 0) return setRecords([])
    fetchAdministrationsForDay(
      day,
      prescriptions.map((p) => p.id),
    )
      .then(async (recs) => {
        setRecords(recs)
        setNames(await fetchStaffNames(recs.map((r) => r.recorded_by)))
      })
      .catch((e) => toast(e.message, 'error'))
  }, [day, prescriptions, toast])

  const active = prescriptions.filter((p) => p.active && (p.end_date === null || p.end_date >= today))
  const ended = prescriptions.filter((p) => !active.includes(p))
  const historyItems = useMemo(() => buildSchedule(prescriptions, records, day, new Date()), [prescriptions, records, day])

  async function confirmEnd() {
    if (!ending) return
    setBusy(true)
    try {
      await endPrescription(ending.id, endDateFor(ending, today))
      toast('Prescrição encerrada')
      setEnding(null)
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive() {
    if (!resident) return
    try {
      await saveResident({ ...resident, active: !resident.active })
      toast(resident.active ? 'Residente desativado' : 'Residente reativado')
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  if (loading) return <Loading />
  if (error || !resident) return <ErrorBox message={error ?? 'Residente não encontrado.'} />

  return (
    <div className="stack-lg">
      <Link to="/residentes" className="small row" style={{ gap: 4 }}>
        <ArrowLeft size={16} aria-hidden /> Residentes
      </Link>

      <Card className="stack">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div className="row">
            <Avatar name={resident.full_name} large />
            <div>
              <h1 style={{ fontSize: '1.4rem' }}>{resident.full_name}</h1>
              <p className="muted">
                {[
                  resident.room && `Quarto ${resident.room}`,
                  resident.birth_date && `${ageOn(resident.birth_date, today)} anos`,
                  !resident.active && 'Inativo',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <Link to={`/residentes/${resident.id}/editar`} className="btn btn-secondary btn-sm">
            <Pencil size={16} aria-hidden /> Editar
          </Link>
        </div>
        {resident.allergies && (
          <div className="allergy-box">
            <AlertTriangle size={20} style={{ flex: 'none' }} aria-hidden />
            <span>Alergias: {resident.allergies}</span>
          </div>
        )}
        {resident.notes && <p>{resident.notes}</p>}
      </Card>

      <Card>
        <div className="row-between" style={{ marginBottom: 4 }}>
          <h2>Medicações em uso</h2>
          {resident.active && (
            <Link to={`/residentes/${resident.id}/prescricoes/nova`} className="btn btn-primary btn-sm">
              <Plus size={18} aria-hidden /> Nova prescrição
            </Link>
          )}
        </div>
        {active.length === 0 ? (
          <EmptyState title="Nenhuma medicação em uso" />
        ) : (
          active.map((p) => <PrescriptionItem key={p.id} p={p} residentId={resident.id} onEnd={() => setEnding(p)} />)
        )}
        {ended.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              Prescrições encerradas ({ended.length})
            </summary>
            {ended.map((p) => (
              <PrescriptionItem key={p.id} p={p} residentId={resident.id} />
            ))}
          </details>
        )}
      </Card>

      <Card className="stack">
        <div className="row-between">
          <h2>Histórico de doses</h2>
          <DayNav day={day} max={today} onChange={setDay} />
        </div>
        <DoseTimeline items={historyItems} names={names} />
      </Card>

      {profile?.role === 'admin' && (
        <div>
          <Button variant={resident.active ? 'danger' : 'secondary'} onClick={toggleActive}>
            {resident.active ? 'Desativar residente' : 'Reativar residente'}
          </Button>
        </div>
      )}

      {ending && (
        <Dialog title="Encerrar prescrição?" onClose={() => setEnding(null)}>
          <p>
            <strong>{ending.medication}</strong> ({ending.dosage}) sai da agenda agora mesmo: as doses pendentes
            deixam de aparecer. As doses já registradas continuam no histórico.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setEnding(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmEnd}>
              Encerrar
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
