// Formatação de datas em português, sempre a partir de 'YYYY-MM-DD' (sem depender do fuso do aparelho).

const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** 'quarta-feira, 28 de outubro' */
export function formatDay(day: string): string {
  return dayFmt.format(new Date(`${day}T12:00:00Z`))
}

/** '28/10/2026' */
export function formatShortDate(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function ageOn(birth: string, day: string): number {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = day.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** Soma dias a 'YYYY-MM-DD'. */
export function addDays(day: string, n: number): string {
  const t = new Date(`${day}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
