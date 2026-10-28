// Regras puras (sem acesso ao Supabase), testadas com Vitest.
import type { RecordStatus } from './types'

export function validateNewPassword(a: string, b: string): string | null {
  if (a.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (a !== b) return 'As senhas não são iguais.'
  return null
}

export function validateDose(input: { status: RecordStatus; reason?: string | null }): string | null {
  if (input.status !== 'given' && !input.reason?.trim()) return 'Informe o motivo'
  return null
}

/** Converte erros do Supabase/rede em mensagens simples para o usuário. */
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string; name?: string } | null
  const msg = err?.message?.toLowerCase() ?? ''
  if (err?.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied'))
    return 'Você não tem acesso a esta informação'
  if (err?.code === '23505') return 'Esta dose já foi registrada por outra pessoa. A lista foi atualizada.'
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed'))
    return 'Sem conexão. Tente novamente.'
  return 'Algo deu errado. Tente novamente.'
}

/** Valida, remove duplicados e ordena horários HH:MM. */
export function parseTimes(input: string[]): { times: string[]; error: string | null } {
  const values = input.map((t) => t.trim()).filter(Boolean)
  if (values.length === 0) return { times: [], error: 'Informe ao menos um horário' }
  for (const t of values) {
    const m = /^(\d{2}):(\d{2})$/.exec(t)
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { times: [], error: `Horário inválido: ${t}` }
  }
  return { times: [...new Set(values)].sort(), error: null }
}

const PASSWORD_CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Senha provisória legível (sem 0/O/1/l/I). */
export function generateTempPassword(): string {
  const bytes = new Uint32Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('')
}

export interface PrescriptionForm {
  medication: string
  dosage: string
  route: string
  times: string[]
  start_date: string
  end_date: string
  prescriber_name: string
  prescriber_crm: string
}

/** Erros por campo do formulário de prescrição ({} quando válido). */
export function validatePrescription(f: PrescriptionForm): Partial<Record<keyof PrescriptionForm, string>> {
  const errors: Partial<Record<keyof PrescriptionForm, string>> = {}
  if (!f.medication.trim()) errors.medication = 'Informe o medicamento'
  if (!f.dosage.trim()) errors.dosage = 'Informe a dose'
  if (!f.route) errors.route = 'Escolha a via'
  if (!f.prescriber_name.trim()) errors.prescriber_name = 'Informe o médico'
  if (!f.prescriber_crm.trim()) errors.prescriber_crm = 'Informe o CRM'
  if (!f.start_date) errors.start_date = 'Informe o início'
  else if (f.end_date && f.end_date < f.start_date) errors.end_date = 'O fim não pode ser antes do início'
  const t = parseTimes(f.times)
  if (t.error) errors.times = t.error
  return errors
}
