import { describe, expect, it } from 'vitest'
import { addDays, ageOn, capitalize, formatDay, formatShortDate } from './format'

describe('format', () => {
  it('formatDay escreve o dia por extenso', () => {
    expect(formatDay('2026-10-28')).toBe('quarta-feira, 28 de outubro')
  })
  it('formatShortDate usa dd/mm/aaaa', () => {
    expect(formatShortDate('2026-10-28')).toBe('28/10/2026')
  })
  it('ageOn calcula a idade considerando o aniversário', () => {
    expect(ageOn('1941-10-29', '2026-10-28')).toBe(84)
    expect(ageOn('1941-10-28', '2026-10-28')).toBe(85)
  })
})

describe('addDays', () => {
  it('soma e subtrai dias atravessando o mês', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })
})

describe('capitalize', () => {
  it('só a primeira letra fica maiúscula', () => {
    expect(capitalize('quarta-feira, 28 de outubro')).toBe('Quarta-feira, 28 de outubro')
  })
})
