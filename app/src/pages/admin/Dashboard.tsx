import { AlertTriangle, CalendarCheck, CheckCircle2, HeartPulse, Stethoscope, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Card, EmptyState, ErrorBox, Loading, PageHead } from '../../components/ui'
import { fetchAdministrationsBetween, fetchPrescriptions, fetchProfiles, fetchResidents } from '../../lib/api'
import { addDays, capitalize, formatDay } from '../../lib/format'
import { carriedOver } from '../../lib/rules'
import { buildSchedule, timeSP, todaySP } from '../../lib/schedule'
import type { Administration, Prescription, Profile, Resident } from '../../lib/types'

export function DashboardPage() {
  const [now, setNow] = useState(() => new Date())
  const today = todaySP(now)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [records, setRecords] = useState<Administration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const today = todaySP(new Date())
      const yesterday = addDays(today, -1)
      const [p, r] = await Promise.all([fetchProfiles(), fetchResidents({ activeOnly: true })])
      const residentIds = new Set(r.map((x) => x.id))
      const rx = (await fetchPrescriptions(undefined, { from: yesterday, to: today })).filter((x) =>
        residentIds.has(x.resident_id),
      )
      const recs = await fetchAdministrationsBetween(yesterday, today)
      setProfiles(p)
      setResidents(r)
      setPrescriptions(rx)
      setRecords(recs)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => {
      setNow(new Date())
      load()
    }, 60_000)
    return () => clearInterval(t)
  }, [load])

  const items = useMemo(() => buildSchedule(prescriptions, records, today, now), [prescriptions, records, today, now])
  const fromYesterday = useMemo(
    () => carriedOver(buildSchedule(prescriptions, records, addDays(today, -1), now), now),
    [prescriptions, records, today, now],
  )
  const residentById = useMemo(() => new Map(residents.map((r) => [r.id, r])), [residents])

  if (loading) return <Loading />

  const given = items.filter((i) => i.status === 'given').length
  const late = [...fromYesterday, ...items.filter((i) => i.status === 'late')]
  const pct = items.length ? Math.round((given / items.length) * 100) : 0
  const activeCount = (role: Profile['role']) => profiles.filter((p) => p.active && p.role === role).length

  const stats = [
    { label: 'residentes ativos', value: residents.length, icon: HeartPulse, to: '/residentes' },
    { label: 'na enfermagem', value: activeCount('nurse'), icon: Stethoscope, to: '/admin/usuarios' },
    { label: 'familiares ativos', value: activeCount('family'), icon: Users, to: '/admin/usuarios' },
    { label: 'doses atrasadas agora', value: late.length, icon: AlertTriangle, to: '/hoje', alert: late.length > 0 },
  ]

  return (
    <div className="stack-lg">
      <PageHead title="Painel" sub={capitalize(formatDay(today))} />
      {error && <ErrorBox message={error} onRetry={load} />}

      <Card className="stack">
        <div className="row-between">
          <div className="row">
            <CheckCircle2 size={22} color="var(--ok)" aria-hidden />
            <h2>Doses de hoje</h2>
          </div>
          <Link to="/hoje" className="btn btn-ghost btn-sm">
            <CalendarCheck size={16} aria-hidden /> Abrir agenda
          </Link>
        </div>
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <span className="stat-value">{pct}%</span>
          <span className="muted">
            {given} de {items.length} aplicadas · {items.filter((i) => i.record && i.status !== 'given').length} recusadas
            ou não aplicadas
          </span>
        </div>
        <div className="progress" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <div className="stat-grid">
        {stats.map(({ label, value, icon: Icon, to, alert }) => (
          <Link key={label} to={to} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Icon size={22} color={alert ? 'var(--danger)' : 'var(--primary)'} aria-hidden />
            <div className="stat-value" style={{ marginTop: 8, color: alert ? 'var(--danger)' : undefined }}>
              {value}
            </div>
            <div className="stat-label">{label}</div>
          </Link>
        ))}
      </div>

      <Card className="stack">
        <h2>Atrasadas agora</h2>
        {late.length === 0 ? (
          <EmptyState icon={<CheckCircle2 aria-hidden />} title="Nenhuma dose atrasada" text="Tudo em dia por enquanto." />
        ) : (
          <div className="list">
            {late.map((i) => {
              const r = residentById.get(i.prescription.resident_id)
              return (
                <Link key={`${i.prescription.id}${i.scheduledFor.toISOString()}`} to="/hoje" className="list-item">
                  <Avatar name={r?.full_name ?? '?'} />
                  <div className="grow">
                    <strong>{r?.full_name}</strong>
                    <div className="small muted">
                      {i.prescription.medication} · {i.prescription.dosage}
                    </div>
                  </div>
                  <span className="badge badge-late">
                    <AlertTriangle aria-hidden /> {timeSP(i.scheduledFor)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
