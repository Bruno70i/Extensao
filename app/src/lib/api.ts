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

// Administração de usuários (Edge Function admin-users) -------------------------------

export type AdminUsersBody =
  | { action: 'list' }
  | { action: 'create'; email: string; full_name: string; role: Role; temp_password: string }
  | { action: 'reset_password'; user_id: string; temp_password: string }
  | { action: 'set_active'; user_id: string; active: boolean }

export interface AuthUserInfo {
  id: string
  email: string
  last_sign_in_at: string | null
}

export async function adminUsers(
  body: AdminUsersBody,
): Promise<{ user_id?: string; users?: AuthUserInfo[] }> {
  let res: { data: { ok: boolean; error?: string; user_id?: string; users?: AuthUserInfo[] } | null; error: unknown }
  try {
    res = await supabase.functions.invoke('admin-users', { body })
  } catch (e) {
    throw new ApiError(e)
  }
  if (res.error) {
    // Erros 4xx da função trazem a mensagem no corpo
    const ctx = (res.error as { context?: Response }).context
    const payload = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(payload?.error ?? friendlyError(res.error))
  }
  if (!res.data?.ok) throw new Error(res.data?.error ?? 'Algo deu errado. Tente novamente.')
  return res.data
}

export interface FamilyLink {
  resident_id: string
  relationship: string | null
  resident_name: string
}

export async function fetchLinks(familyId: string): Promise<FamilyLink[]> {
  const rows = (await run(
    supabase.from('family_links').select('resident_id, relationship, residents(full_name)').eq('family_id', familyId),
  )) as unknown as { resident_id: string; relationship: string | null; residents: { full_name: string } | null }[]
  return rows.map((r) => ({
    resident_id: r.resident_id,
    relationship: r.relationship,
    resident_name: r.residents?.full_name ?? '—',
  }))
}

export async function addLink(familyId: string, residentId: string, relationship: string): Promise<void> {
  await run(
    supabase
      .from('family_links')
      .insert({ family_id: familyId, resident_id: residentId, relationship: relationship.trim() || null }),
  )
}

export async function removeLink(familyId: string, residentId: string): Promise<void> {
  await run(supabase.from('family_links').delete().eq('family_id', familyId).eq('resident_id', residentId))
}

// Auditoria ---------------------------------------------------------------------------

export type AuditRow = Administration & { medication: string; dosage: string; resident_name: string; recorded_by_name: string }

export async function fetchAudit(filters: {
  residentId?: string
  nurseId?: string
  from: string
  to: string
}): Promise<AuditRow[]> {
  let q = supabase
    .from('administrations')
    .select('*, prescriptions!inner(medication, dosage, resident_id, residents(full_name)), profiles(full_name)')
    .gte('recorded_at', spInstant(filters.from, '00:00').toISOString())
    .lte('recorded_at', new Date(spInstant(filters.to, '23:59').getTime() + 59_999).toISOString())
    .order('recorded_at', { ascending: false })
    .limit(200)
  if (filters.residentId) q = q.eq('prescriptions.resident_id', filters.residentId)
  if (filters.nurseId) q = q.eq('recorded_by', filters.nurseId)
  const rows = (await run(q)) as unknown as (Administration & {
    prescriptions: { medication: string; dosage: string; residents: { full_name: string } | null }
    profiles: { full_name: string } | null
  })[]
  return rows.map(({ prescriptions, profiles, ...a }) => ({
    ...a,
    medication: prescriptions.medication,
    dosage: prescriptions.dosage,
    resident_name: prescriptions.residents?.full_name ?? '—',
    recorded_by_name: profiles?.full_name ?? '—',
  }))
}
