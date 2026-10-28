import type { Administration, DoseItem, DoseStatus, Prescription } from './types'

/** Minutos após o horário previsto para uma dose pendente ser considerada atrasada. */
export const LATE_TOLERANCE_MIN = 30

/** São Paulo não tem horário de verão desde 2019: o offset é fixo. */
const SP_OFFSET = '-03:00'
const SP_OFFSET_MS = -3 * 60 * 60 * 1000

export const statusLabel: Record<DoseStatus, string> = {
  pending: 'Pendente',
  late: 'Atrasada',
  given: 'Aplicada',
  refused: 'Recusou',
  missed: 'Não foi aplicada',
}

/** Instante de um horário (HH:MM ou HH:MM:SS) em um dia (YYYY-MM-DD) no fuso de São Paulo. */
export function spInstant(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm.slice(0, 5)}:00${SP_OFFSET}`)
}

/** Data (YYYY-MM-DD) de um instante no fuso de São Paulo. */
export function todaySP(now: Date): string {
  return new Date(now.getTime() + SP_OFFSET_MS).toISOString().slice(0, 10)
}

/** Hora (HH:MM) de um instante no fuso de São Paulo. */
export function timeSP(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Date(d.getTime() + SP_OFFSET_MS).toISOString().slice(11, 16)
}

function recordKey(prescriptionId: string, scheduledFor: string | Date): string {
  return `${prescriptionId}|${new Date(scheduledFor).toISOString()}`
}

/** Registro vigente de cada dose: ignora os que foram substituídos por uma correção. */
export function latestRecords(records: Administration[]): Map<string, Administration> {
  const superseded = new Set(records.map((r) => r.supersedes).filter(Boolean))
  const map = new Map<string, Administration>()
  for (const r of records) {
    if (superseded.has(r.id)) continue
    const key = recordKey(r.prescription_id, r.scheduled_for)
    const current = map.get(key)
    if (!current || r.recorded_at > current.recorded_at) map.set(key, r)
  }
  return map
}

export function isActiveOn(p: Prescription, day: string): boolean {
  return p.active && p.start_date <= day && (p.end_date === null || day <= p.end_date)
}

export function buildSchedule(
  prescriptions: Prescription[],
  records: Administration[],
  day: string,
  now: Date,
): DoseItem[] {
  const latest = latestRecords(records)
  const lateBefore = now.getTime() - LATE_TOLERANCE_MIN * 60 * 1000
  const items: DoseItem[] = []

  for (const p of prescriptions) {
    if (!isActiveOn(p, day)) continue
    for (const t of p.times) {
      const scheduledFor = spInstant(day, t)
      const record = latest.get(recordKey(p.id, scheduledFor)) ?? null
      const status: DoseStatus = record
        ? record.status
        : scheduledFor.getTime() < lateBefore
          ? 'late'
          : 'pending'
      items.push({ prescription: p, scheduledFor, status, record })
    }
  }

  return items.sort(
    (a, b) =>
      a.scheduledFor.getTime() - b.scheduledFor.getTime() ||
      a.prescription.medication.localeCompare(b.prescription.medication, 'pt-BR'),
  )
}
