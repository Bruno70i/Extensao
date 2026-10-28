import { describe, expect, it } from 'vitest'
import {
  friendlyError,
  generateTempPassword,
  parseTimes,
  validateDose,
  validateNewPassword,
  validatePrescription,
} from './validation'

describe('validateNewPassword', () => {
  it('exige ao menos 8 caracteres', () => {
    expect(validateNewPassword('1234567', '1234567')).toBe('A senha precisa ter pelo menos 8 caracteres.')
  })
  it('exige confirmação igual', () => {
    expect(validateNewPassword('12345678', '12345679')).toBe('As senhas não são iguais.')
  })
  it('aceita senha válida', () => {
    expect(validateNewPassword('12345678', '12345678')).toBeNull()
  })
})

describe('validateDose', () => {
  it('exige motivo para recusa e não aplicação', () => {
    expect(validateDose({ status: 'refused', reason: '' })).toBe('Informe o motivo')
    expect(validateDose({ status: 'missed', reason: '   ' })).toBe('Informe o motivo')
  })
  it('aceita aplicada sem motivo', () => {
    expect(validateDose({ status: 'given' })).toBeNull()
    expect(validateDose({ status: 'refused', reason: 'Náusea' })).toBeNull()
  })
})

describe('friendlyError', () => {
  it('traduz erro de permissão', () => {
    expect(friendlyError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(
      'Você não tem acesso a esta informação',
    )
  })
  it('traduz falha de rede', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe('Sem conexão. Tente novamente.')
  })
  it('traduz dose já registrada por outra pessoa', () => {
    expect(friendlyError({ code: '23505', message: 'duplicate key value' })).toBe(
      'Esta dose já foi registrada por outra pessoa. A lista foi atualizada.',
    )
  })
  it('usa mensagem genérica para o resto', () => {
    expect(friendlyError(new Error('boom'))).toBe('Algo deu errado. Tente novamente.')
  })
})

describe('parseTimes', () => {
  it('ordena e remove duplicados', () => {
    expect(parseTimes(['20:00', '08:00', '08:00'])).toEqual({ times: ['08:00', '20:00'], error: null })
  })
  it('rejeita horário inválido', () => {
    expect(parseTimes(['25:00']).error).toBe('Horário inválido: 25:00')
  })
  it('exige ao menos um horário', () => {
    expect(parseTimes([]).error).toBe('Informe ao menos um horário')
    expect(parseTimes(['']).error).toBe('Informe ao menos um horário')
  })
})

describe('generateTempPassword', () => {
  it('tem 10 caracteres sem caracteres ambíguos', () => {
    for (let i = 0; i < 100; i++) {
      const p = generateTempPassword()
      expect(p).toHaveLength(10)
      expect(p).not.toMatch(/[0O1lI]/)
    }
  })
})

describe('validatePrescription', () => {
  const ok = {
    medication: 'Losartana',
    dosage: '50 mg',
    route: 'Oral',
    times: ['08:00'],
    start_date: '2026-10-28',
    end_date: '',
    prescriber_name: 'Dra. Ana',
    prescriber_crm: 'CRM-SP 1',
  }
  it('aceita prescrição completa', () => {
    expect(validatePrescription(ok)).toEqual({})
  })
  it('aponta campos obrigatórios', () => {
    const errors = validatePrescription({ ...ok, medication: ' ', dosage: '', prescriber_name: '', prescriber_crm: '', start_date: '' })
    expect(Object.keys(errors).sort()).toEqual(['dosage', 'medication', 'prescriber_crm', 'prescriber_name', 'start_date'])
  })
  it('valida horários e período', () => {
    expect(validatePrescription({ ...ok, times: [] }).times).toBe('Informe ao menos um horário')
    expect(validatePrescription({ ...ok, end_date: '2026-10-27' }).end_date).toBe('O fim não pode ser antes do início')
  })
})
