import { describe, expect, it } from 'vitest'
import { carriedOver, endDateFor, planPrescriptionEdit, routeDecision } from './rules'
import { buildSchedule, spInstant } from './schedule'
import type { Prescription, Profile } from './types'

function rx(over: Partial<Prescription> = {}): Prescription {
  return {
    id: 'p1',
    resident_id: 'r1',
    medication: 'Losartana',
    dosage: '50 mg',
    route: 'Oral',
    times: ['08:00', '23:30'],
    start_date: '2026-10-01',
    end_date: null,
    prescriber_name: 'Dra',
    prescriber_crm: 'CRM 1',
    instructions: null,
    active: true,
    ...over,
  }
}

describe('endDateFor', () => {
  it('encerra hoje uma prescrição em andamento', () => {
    expect(endDateFor(rx(), '2026-10-28')).toBe('2026-10-28')
  })
  it('prescrição que ainda não começou termina no próprio início (sem violar fim >= início)', () => {
    expect(endDateFor(rx({ start_date: '2026-11-05' }), '2026-10-28')).toBe('2026-11-05')
  })
})

describe('planPrescriptionEdit', () => {
  const old = rx()
  const TODAY = '2026-10-28'
  it('mudança só de instruções/médico/fim edita no lugar', () => {
    expect(planPrescriptionEdit(old, { ...old, instructions: 'Após o almoço' }, { anyRecords: true, recordsToday: true }, TODAY)).toEqual({ mode: 'update' })
  })
  it('mudança clínica sem nenhum registro edita no lugar', () => {
    expect(planPrescriptionEdit(old, { ...old, dosage: '100 mg' }, { anyRecords: false, recordsToday: false }, TODAY)).toEqual({ mode: 'update' })
  })
  it('mudança clínica com registros antigos encerra ontem e a nova vale hoje', () => {
    expect(planPrescriptionEdit(old, { ...old, times: ['09:00'] }, { anyRecords: true, recordsToday: false }, TODAY)).toEqual({
      mode: 'replace',
      endOld: '2026-10-27',
      startNew: '2026-10-28',
    })
  })
  it('mudança clínica com registros hoje passa a valer amanhã (evita dose dupla)', () => {
    expect(planPrescriptionEdit(old, { ...old, dosage: '100 mg' }, { anyRecords: true, recordsToday: true }, TODAY)).toEqual({
      mode: 'replace',
      endOld: '2026-10-28',
      startNew: '2026-10-29',
    })
  })
  it('ordem dos horários não conta como mudança', () => {
    expect(planPrescriptionEdit(old, { ...old, times: ['23:30', '08:00'] }, { anyRecords: true, recordsToday: true }, TODAY)).toEqual({ mode: 'update' })
  })
})

describe('carriedOver', () => {
  const YESTERDAY = '2026-10-27'
  it('mantém doses de ontem sem registro até 6 h depois do horário', () => {
    const items = buildSchedule([rx()], [], YESTERDAY, spInstant('2026-10-28', '00:05'))
    const kept = carriedOver(items, spInstant('2026-10-28', '00:05'))
    expect(kept.map((i) => i.scheduledFor.toISOString())).toEqual(['2026-10-28T02:30:00.000Z'])
    expect(kept[0].status).toBe('late')
  })
  it('descarta depois da janela de 6 h', () => {
    const items = buildSchedule([rx()], [], YESTERDAY, spInstant('2026-10-28', '06:00'))
    expect(carriedOver(items, spInstant('2026-10-28', '06:00'))).toHaveLength(0)
  })
})

describe('routeDecision', () => {
  const profile: Profile = { id: 'u', full_name: 'Ana', role: 'nurse', active: true, must_change_password: false }
  const base = { loading: false, hasSession: true, profile, profileError: false, roles: ['nurse' as const] }
  it('falha ao carregar o perfil mostra erro, não "desativado"', () => {
    expect(routeDecision({ ...base, profile: null, profileError: true })).toBe('error')
  })
  it('perfil inexistente ou inativo vai para desativado', () => {
    expect(routeDecision({ ...base, profile: null })).toBe('disabled')
    expect(routeDecision({ ...base, profile: { ...profile, active: false } })).toBe('disabled')
  })
  it('demais casos', () => {
    expect(routeDecision({ ...base, loading: true })).toBe('loading')
    expect(routeDecision({ ...base, hasSession: false })).toBe('login')
    expect(routeDecision({ ...base, profile: { ...profile, must_change_password: true } })).toBe('first-access')
    expect(routeDecision({ ...base, roles: ['admin'] })).toBe('home')
    expect(routeDecision(base)).toBe('ok')
  })
})
