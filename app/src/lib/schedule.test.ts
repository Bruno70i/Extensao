import { describe, expect, it } from 'vitest'
import { buildSchedule, spInstant, timeSP, todaySP } from './schedule'
import type { Administration, Prescription } from './types'

const DAY = '2026-10-28'

function rx(over: Partial<Prescription> = {}): Prescription {
  return {
    id: 'p1',
    resident_id: 'r1',
    medication: 'Losartana',
    dosage: '50 mg',
    route: 'Oral',
    times: ['08:00', '20:00'],
    start_date: '2026-10-01',
    end_date: null,
    prescriber_name: 'Dra. Silva',
    prescriber_crm: 'CRM-SP 12345',
    instructions: null,
    active: true,
    ...over,
  }
}

function rec(over: Partial<Administration> = {}): Administration {
  return {
    id: 'a1',
    prescription_id: 'p1',
    scheduled_for: '2026-10-28T11:00:00.000Z',
    status: 'given',
    reason: null,
    notes: null,
    recorded_by: 'n1',
    recorded_at: '2026-10-28T11:05:00.000Z',
    supersedes: null,
    ...over,
  }
}

const morning = spInstant(DAY, '07:00')

describe('buildSchedule', () => {
  it('gera um item por horário', () => {
    const items = buildSchedule([rx()], [], DAY, morning)
    expect(items.map((i) => i.scheduledFor.toISOString())).toEqual([
      '2026-10-28T11:00:00.000Z',
      '2026-10-28T23:00:00.000Z',
    ])
  })

  it('normaliza horário vindo do Postgres', () => {
    const items = buildSchedule([rx({ times: ['08:00:00'] })], [], DAY, morning)
    expect(items[0].scheduledFor.toISOString()).toBe('2026-10-28T11:00:00.000Z')
  })

  it('ignora prescrição inativa ou fora do período', () => {
    expect(buildSchedule([rx({ active: false })], [], DAY, morning)).toHaveLength(0)
    expect(buildSchedule([rx({ start_date: '2026-10-29' })], [], DAY, morning)).toHaveLength(0)
  })

  it('inclui o último dia de end_date', () => {
    const p = rx({ end_date: '2026-10-28' })
    expect(buildSchedule([p], [], '2026-10-28', morning)).toHaveLength(2)
    expect(buildSchedule([p], [], '2026-10-29', morning)).toHaveLength(0)
  })

  it('pendente vira atrasada após 30 min', () => {
    const before = buildSchedule([rx()], [], DAY, spInstant(DAY, '08:29'))
    expect(before.map((i) => i.status)).toEqual(['pending', 'pending'])
    const after = buildSchedule([rx()], [], DAY, spInstant(DAY, '08:31'))
    expect(after.map((i) => i.status)).toEqual(['late', 'pending'])
  })

  it('usa o status do registro', () => {
    const items = buildSchedule([rx()], [rec()], DAY, spInstant(DAY, '09:00'))
    expect(items[0].status).toBe('given')
    expect(items[0].record?.id).toBe('a1')
  })

  it('usa o registro mais recente quando há correção', () => {
    const a = rec({ id: 'A' })
    const b = rec({ id: 'B', status: 'refused', reason: 'Recusou', supersedes: 'A', recorded_at: '2026-10-28T11:10:00.000Z' })
    const items = buildSchedule([rx()], [b, a], DAY, spInstant(DAY, '09:00'))
    expect(items[0].status).toBe('refused')
    expect(items[0].record?.id).toBe('B')
  })

  it('ordena por horário e medicamento', () => {
    const items = buildSchedule(
      [rx({ id: 'p1', medication: 'Losartana', times: ['08:00'] }), rx({ id: 'p2', medication: 'Dipirona', times: ['08:00'] })],
      [],
      DAY,
      morning,
    )
    expect(items.map((i) => i.prescription.medication)).toEqual(['Dipirona', 'Losartana'])
  })
})

describe('todaySP', () => {
  it('todaySP usa o fuso de São Paulo', () => {
    expect(todaySP(new Date('2026-10-29T02:30:00Z'))).toBe('2026-10-28')
    expect(todaySP(new Date('2026-10-29T03:30:00Z'))).toBe('2026-10-29')
  })
})

describe('timeSP', () => {
  it('mostra a hora no fuso de São Paulo', () => {
    expect(timeSP('2026-10-28T11:03:00.000Z')).toBe('08:03')
  })
})
