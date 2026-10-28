import { AlertTriangle, ChevronRight, Plus, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, EmptyState, ErrorBox, Loading, PageHead } from '../../components/ui'
import { fetchResidents } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ageOn } from '../../lib/format'
import { todaySP } from '../../lib/schedule'
import type { Resident } from '../../lib/types'

export function ResidentListPage() {
  const { profile } = useAuth()
  const [residents, setResidents] = useState<Resident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const load = () => {
    setLoading(true)
    fetchResidents()
      .then((r) => {
        setResidents(r)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const today = todaySP(new Date())
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return residents.filter(
      (r) =>
        (showInactive || r.active) &&
        (!q || r.full_name.toLowerCase().includes(q) || r.room?.toLowerCase().includes(q)),
    )
  }, [residents, query, showInactive])
  const inactiveCount = residents.filter((r) => !r.active).length

  return (
    <div className="stack-lg">
      <PageHead
        title="Residentes"
        sub={`${residents.filter((r) => r.active).length} residentes ativos`}
        actions={
          <Link to="/residentes/novo" className="btn btn-primary">
            <Plus size={20} aria-hidden /> Novo residente
          </Link>
        }
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      <div className="search">
        <Search size={18} aria-hidden />
        <input
          className="input"
          placeholder="Buscar por nome ou quarto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar residente"
        />
      </div>
      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title={residents.length === 0 ? 'Nenhum residente cadastrado' : 'Nenhum residente encontrado'}
          text={residents.length === 0 ? 'Comece cadastrando o primeiro residente.' : undefined}
        />
      ) : (
        <div className="list">
          {visible.map((r) => (
            <Link key={r.id} to={`/residentes/${r.id}`} className="list-item">
              <Avatar name={r.full_name} />
              <div className="grow">
                <strong>{r.full_name}</strong>
                <div className="small muted">
                  {[r.room && `Quarto ${r.room}`, r.birth_date && `${ageOn(r.birth_date, today)} anos`]
                    .filter(Boolean)
                    .join(' · ')}
                  {!r.active && ' · Inativo'}
                </div>
                {r.allergies && (
                  <div className="allergy small">
                    <AlertTriangle size={14} aria-hidden /> Alergia: {r.allergies}
                  </div>
                )}
              </div>
              <ChevronRight size={20} color="var(--muted)" aria-hidden />
            </Link>
          ))}
        </div>
      )}
      {profile?.role === 'admin' && inactiveCount > 0 && (
        <label className="row small muted">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar residentes inativos ({inactiveCount})
        </label>
      )}
    </div>
  )
}
