import { AlertTriangle, Check, MoreHorizontal, Pencil, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Button, EmptyState, ErrorBox, Loading, PageHead, StatusBadge } from '../../components/ui'
import { useToast } from '../../components/toast'
import {
  ApiError,
  fetchAdministrationsBetween,
  fetchPrescriptions,
  fetchResidents,
  fetchStaffNames,
  recordDose,
} from '../../lib/api'
import { addDays, capitalize, formatDay } from '../../lib/format'
import { carriedOver } from '../../lib/rules'
import { buildSchedule, timeSP, todaySP } from '../../lib/schedule'
import type { Administration, DoseItem, Prescription, RecordStatus, Resident } from '../../lib/types'
import { friendlyError } from '../../lib/validation'
import { RecordDoseDialog } from './RecordDoseDialog'

type Filter = 'todo' | 'all'

function doseKey(item: DoseItem): string {
  return `${item.prescription.id}|${item.scheduledFor.toISOString()}`
}

export function TodayPage() {
  const toast = useToast()
  const [now, setNow] = useState(() => new Date())
  const day = todaySP(now)
  const [residents, setResidents] = useState<Resident[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [records, setRecords] = useState<Administration[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('todo')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<{ item: DoseItem; initial: RecordStatus } | null>(null)
  const savingRef = useRef(new Set<string>())

  const load = useCallback(async () => {
    try {
      const today = todaySP(new Date())
      const yesterday = addDays(today, -1)
      const res = await fetchResidents({ activeOnly: true })
      const residentIds = new Set(res.map((r) => r.id))
      const rx = (await fetchPrescriptions(undefined, { from: yesterday, to: today })).filter((p) =>
        residentIds.has(p.resident_id),
      )
      // Ontem também: doses da madrugada que ficaram sem registro continuam registráveis
      const recs = await fetchAdministrationsBetween(yesterday, today)
      setResidents(res)
      setPrescriptions(rx)
      setRecords(recs)
      setNames(await fetchStaffNames(recs.map((r) => r.recorded_by)))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const tick = setInterval(() => {
      setNow(new Date())
      load()
    }, 60_000)
    return () => clearInterval(tick)
  }, [load])

  const residentById = useMemo(() => new Map(residents.map((r) => [r.id, r])), [residents])
  const items = useMemo(
    () => [
      ...carriedOver(buildSchedule(prescriptions, records, addDays(day, -1), now), now),
      ...buildSchedule(prescriptions, records, day, now),
    ],
    [prescriptions, records, day, now],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (filter === 'todo' && i.record) return false
      if (!q) return true
      const r = residentById.get(i.prescription.resident_id)
      return (
        r?.full_name.toLowerCase().includes(q) ||
        r?.room?.toLowerCase().includes(q) ||
        i.prescription.medication.toLowerCase().includes(q)
      )
    })
  }, [items, filter, query, residentById])

  const late = visible.filter((i) => i.status === 'late')
  const groups = useMemo(() => {
    const map = new Map<string, DoseItem[]>()
    for (const i of visible) {
      if (i.status === 'late') continue
      const t = timeSP(i.scheduledFor)
      map.set(t, [...(map.get(t) ?? []), i])
    }
    return [...map.entries()]
  }, [visible])

  const done = items.filter((i) => i.record).length

  function handleError(e: unknown) {
    const code = (e as { code?: string }).code
    toast(e instanceof ApiError ? e.message : friendlyError(e), 'error')
    if (code === '23505') load()
  }

  async function quickGive(item: DoseItem) {
    const key = doseKey(item)
    // Evita registro duplicado por toque duplo
    if (savingRef.current.has(key)) return
    savingRef.current.add(key)
    setSaving(new Set(savingRef.current))
    try {
      await recordDose({ prescription_id: item.prescription.id, scheduled_for: item.scheduledFor.toISOString(), status: 'given' })
      toast('Dose registrada')
      await load()
    } catch (e) {
      handleError(e)
    } finally {
      savingRef.current.delete(key)
      setSaving(new Set(savingRef.current))
    }
  }

  if (loading) return <Loading />

  function renderItem(item: DoseItem) {
    const r = residentById.get(item.prescription.resident_id)
    const p = item.prescription
    const key = doseKey(item)
    return (
      <div key={key} className={`dose ${item.status === 'late' ? 'dose-late' : ''}`}>
        <div className="dose-main">
          <Avatar name={r?.full_name ?? '?'} />
          <div className="grow">
            <div className="dose-title">
              <strong>{r?.full_name}</strong>
              {r?.room && <span className="muted small"> · Quarto {r.room}</span>}
            </div>
            <div className="dose-med">
              {p.medication} <span className="muted">· {p.dosage} · {p.route}</span>
            </div>
            {p.instructions && <div className="small muted">{p.instructions}</div>}
            {r?.allergies && (
              <div className="allergy small">
                <AlertTriangle size={14} aria-hidden /> Alergia: {r.allergies}
              </div>
            )}
          </div>
          <div className="dose-side">
            <span className="dose-time">
              {todaySP(item.scheduledFor) !== day && <span className="small muted">ontem </span>}
              {timeSP(item.scheduledFor)}
            </span>
            <StatusBadge status={item.status} />
          </div>
        </div>
        {item.record ? (
          <div className="dose-foot">
            <span className="small muted">
              por {names[item.record.recorded_by] ?? '—'} às {timeSP(item.record.recorded_at)}
              {item.record.reason && ` · ${item.record.reason}`}
              {item.record.supersedes && ' · corrigido'}
            </span>
            <Button variant="ghost" small onClick={() => setDialog({ item, initial: item.record!.status })}>
              <Pencil size={16} aria-hidden /> Corrigir
            </Button>
          </div>
        ) : (
          <div className="dose-actions">
            <Button loading={saving.has(key)} onClick={() => quickGive(item)}>
              <Check size={20} aria-hidden /> Aplicada
            </Button>
            <Button variant="secondary" onClick={() => setDialog({ item, initial: 'refused' })} disabled={saving.has(key)}>
              <MoreHorizontal size={20} aria-hidden /> Outro
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="stack-lg">
      <PageHead
        title="Hoje"
        sub={
          <>
            {capitalize(formatDay(day))} · {done} de {items.length} doses
            registradas
          </>
        }
      />
      {error && <ErrorBox message={error} onRetry={load} />}

      <div className="stack">
        <div className="search">
          <Search size={18} aria-hidden />
          <input
            className="input"
            placeholder="Buscar residente, quarto ou remédio"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar"
          />
        </div>
        <div className="chips" role="tablist">
          <button className={`chip ${filter === 'todo' ? 'active' : ''}`} onClick={() => setFilter('todo')}>
            A fazer ({items.length - done})
          </button>
          <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Todas ({items.length})
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma dose prevista para hoje" text="Cadastre prescrições na ficha dos residentes." />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === 'todo' && !query ? 'Tudo em dia!' : 'Nada encontrado'}
          text={filter === 'todo' && !query ? 'Todas as doses de hoje já foram registradas.' : undefined}
        />
      ) : (
        <>
          {late.length > 0 && (
            <section className="stack">
              <h2 className="group-title late-title">
                <AlertTriangle size={18} aria-hidden /> Atrasadas ({late.length})
              </h2>
              {late.map(renderItem)}
            </section>
          )}
          {groups.map(([time, list]) => (
            <section key={time} className="stack">
              <h2 className="group-title">{time}</h2>
              {list.map(renderItem)}
            </section>
          ))}
        </>
      )}

      {dialog && (
        <RecordDoseDialog
          item={dialog.item}
          initial={dialog.initial}
          resident={residentById.get(dialog.item.prescription.resident_id)}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            toast('Registro salvo')
            load()
          }}
          onError={(e) => {
            setDialog(null)
            handleError(e)
          }}
        />
      )}
    </div>
  )
}
