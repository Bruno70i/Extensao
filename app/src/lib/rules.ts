// Regras de negócio puras usadas pelas telas (testadas em rules.test.ts).
import { addDays } from './format'
import type { DoseItem, Prescription, Profile, Role } from './types'

/** Por quantas horas uma dose de ontem sem registro continua na lista de atrasadas. */
export const CARRY_OVER_HOURS = 6

/** Data de fim ao encerrar: hoje, ou o próprio início se a prescrição ainda não começou. */
export function endDateFor(p: Prescription, today: string): string {
  return p.start_date > today ? p.start_date : today
}

type Clinical = Pick<Prescription, 'medication' | 'dosage' | 'route' | 'times'>

function clinicalChanged(a: Clinical, b: Clinical): boolean {
  const norm = (t: string[]) => [...t].map((x) => x.slice(0, 5)).sort().join(',')
  return (
    a.medication.trim() !== b.medication.trim() ||
    a.dosage.trim() !== b.dosage.trim() ||
    a.route !== b.route ||
    norm(a.times) !== norm(b.times)
  )
}

export type EditPlan = { mode: 'update' } | { mode: 'replace'; endOld: string; startNew: string }

/**
 * Como salvar a edição de uma prescrição sem reescrever o histórico:
 * mudanças clínicas (remédio, dose, via, horários) numa prescrição que já tem registros
 * viram "encerrar a antiga + criar nova". Se já houve registro hoje, a nova vale amanhã.
 */
export function planPrescriptionEdit(
  old: Prescription,
  next: Clinical & Partial<Prescription>,
  records: { anyRecords: boolean; recordsToday: boolean },
  today: string,
): EditPlan {
  if (!clinicalChanged(old, next) || !records.anyRecords) return { mode: 'update' }
  if (records.recordsToday) return { mode: 'replace', endOld: today, startNew: addDays(today, 1) }
  return { mode: 'replace', endOld: addDays(today, -1), startNew: today }
}

/** Doses de ontem ainda sem registro e dentro da janela de tolerância (para registrar após a meia-noite). */
export function carriedOver(yesterdayItems: DoseItem[], now: Date): DoseItem[] {
  const limit = now.getTime() - CARRY_OVER_HOURS * 60 * 60 * 1000
  return yesterdayItems.filter((i) => !i.record && i.scheduledFor.getTime() >= limit && i.scheduledFor < now)
}

export type RouteDecision = 'loading' | 'login' | 'error' | 'disabled' | 'first-access' | 'home' | 'ok'

export function routeDecision(s: {
  loading: boolean
  hasSession: boolean
  profile: Profile | null
  profileError: boolean
  roles: Role[]
}): RouteDecision {
  if (s.loading) return 'loading'
  if (!s.hasSession) return 'login'
  if (s.profileError) return 'error'
  if (!s.profile || !s.profile.active) return 'disabled'
  if (s.profile.must_change_password) return 'first-access'
  if (!s.roles.includes(s.profile.role)) return 'home'
  return 'ok'
}
