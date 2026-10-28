// Acesso aos dados no Supabase. Todas as funções lançam Error com mensagem em português.
import { spInstant } from './schedule'
import { supabase } from './supabase'
import type { Administration, Prescription, Profile, RecordStatus, Resident, Role } from './types'
import { friendlyError } from './validation'

export const ROUTES_OPTIONS = ['Oral', 'Sublingual', 'Injetável', 'Tópica', 'Inalatória', 'Outra']

export class ApiError extends Error {
  code?: string
  constructor(cause: unknown) {
    super(friendlyError(cause))
    this.code = (cause as { code?: string } | null)?.code
  }
}

async function run<T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let result: { data: T | null; error: unknown }
  try {
    result = await promise
  } catch (e) {
    throw new ApiError(e)
  }
  if (result.error) throw new ApiError(result.error)
  return result.data as T
}

const RX_COLUMNS =
  'id, resident_id, medication, dosage, route, times, start_date, end_date, prescriber_name, prescriber_crm, instructions, active'

function normalizePrescription(p: Prescription): Prescription {
  return { ...p, times: p.times.map((t) => t.slice(0, 5)) }
}

// Residentes ------------------------------------------------------------------

export async function fetchResidents(opts: { activeOnly?: boolean } = {}): Promise<Resident[]> {
  let q = supabase.from('residents').select('*').order('full_name')
  if (opts.activeOnly) q = q.eq('active', true)
  return run(q)
}

export async function fetchResident(id: string): Promise<Resident | null> {
  return run(supabase.from('residents').select('*').eq('id', id).maybeSingle())
}

export async function saveResident(r: Partial<Resident> & { full_name: string }): Promise<Resident> {
  const row = {
    full_name: r.full_name.trim(),
    birth_date: r.birth_date || null,
    room: r.room?.trim() || null,
    allergies: r.allergies?.trim() || null,
    notes: r.notes?.trim() || null,
    ...(r.active !== undefined ? { active: r.active } : {}),
  }
  const q = r.id
    ? supabase.from('residents').update(row).eq('id', r.id).select().single()
    : supabase.from('residents').insert(row).select().single()
  return run(q)
}

// Prescrições -----------------------------------------------------------------

export async function fetchPrescriptions(residentIds?: string[]): Promise<Prescription[]> {
  let q = supabase.from('prescriptions').select(RX_COLUMNS).order('medication')
  if (residentIds) q = q.in('resident_id', residentIds)
  const rows = await run<Prescription[]>(q)
  return rows.map(normalizePrescription)
}

export async function fetchPrescription(id: string): Promise<Prescription | null> {
  const row = await run<Prescription | null>(supabase.from('prescriptions').select(RX_COLUMNS).eq('id', id).maybeSingle())
  return row ? normalizePrescription(row) : null
}

export type PrescriptionInput = Omit<Prescription, 'id' | 'active'> & { id?: string }

export async function savePrescription(p: PrescriptionInput): Promise<Prescription> {
  const row = {
    resident_id: p.resident_id,
    medication: p.medication.trim(),
    dosage: p.dosage.trim(),
    route: p.route,
    times: p.times,
    start_date: p.start_date,
    end_date: p.end_date || null,
    prescriber_name: p.prescriber_name.trim(),
    prescriber_crm: p.prescriber_crm.trim(),
    instructions: p.instructions?.trim() || null,
  }
  const q = p.id
    ? supabase.from('prescriptions').update(row).eq('id', p.id).select(RX_COLUMNS).single()
    : supabase.from('prescriptions').insert(row).select(RX_COLUMNS).single()
  return normalizePrescription(await run<Prescription>(q))
}

export async function endPrescription(id: string, today: string): Promise<void> {
  await run(supabase.from('prescriptions').update({ active: false, end_date: today }).eq('id', id))
}

// Administrações --------------------------------------------------------------

export async function fetchAdministrationsForDay(day: string, prescriptionIds: string[]): Promise<Administration[]> {
  if (prescriptionIds.length === 0) return []
  return run(
    supabase
      .from('administrations')
      .select('*')
      .in('prescription_id', prescriptionIds)
      .gte('scheduled_for', spInstant(day, '00:00').toISOString())
      .lte('scheduled_for', spInstant(day, '23:59').toISOString()),
  )
}

export async function fetchAdministrationsForResident(residentId: string, day: string): Promise<Administration[]> {
  const rx = await fetchPrescriptions([residentId])
  return fetchAdministrationsForDay(
    day,
    rx.map((p) => p.id),
  )
}

export interface DoseInput {
  prescription_id: string
  scheduled_for: string
  status: RecordStatus
  reason?: string
  notes?: string
  supersedes?: string
}

export async function recordDose(input: DoseInput): Promise<Administration> {
  const { data: auth } = await supabase.auth.getUser()
  return run(
    supabase
      .from('administrations')
      .insert({
        prescription_id: input.prescription_id,
        scheduled_for: input.scheduled_for,
        status: input.status,
        reason: input.status === 'given' ? null : input.reason?.trim() || null,
        notes: input.notes?.trim() || null,
        supersedes: input.supersedes ?? null,
        recorded_by: auth.user?.id,
      })
      .select()
      .single(),
  )
}

// Perfis ----------------------------------------------------------------------

export async function fetchStaffNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return {}
  const rows = await run<{ id: string; full_name: string }[]>(
    supabase.from('profiles').select('id, full_name').in('id', unique),
  )
  return Object.fromEntries(rows.map((r) => [r.id, r.full_name]))
}

export async function fetchProfiles(): Promise<Profile[]> {
  return run(supabase.from('profiles').select('id, full_name, role, active, must_change_password').order('full_name'))
}

export async function updateProfile(id: string, changes: { full_name?: string; role?: Role }): Promise<void> {
  await run(supabase.from('profiles').update(changes).eq('id', id))
}

// Familiar ----------------------------------------------------------------------

export type LinkedResident = Resident & { relationship: string | null }

export async function fetchMyResidents(): Promise<LinkedResident[]> {
  const { data: auth } = await supabase.auth.getUser()
  const rows = (await run(
    supabase.from('family_links').select('relationship, residents(*)').eq('family_id', auth.user?.id ?? ''),
  )) as unknown as { relationship: string | null; residents: Resident | null }[]
  return rows
    .filter((r) => r.residents && r.residents.active)
    .map((r) => ({ ...(r.residents as Resident), relationship: r.relationship }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
}
