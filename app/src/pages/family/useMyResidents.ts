import { useEffect, useState } from 'react'
import { fetchMyResidents, type LinkedResident } from '../../lib/api'

const KEY = 'cuidar:familia:residente'

function readSaved(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Residentes vinculados ao familiar logado + qual está selecionado (lembrado neste aparelho). */
export function useMyResidents() {
  const [residents, setResidents] = useState<LinkedResident[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(readSaved)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyResidents()
      .then(setResidents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const selected = residents.find((r) => r.id === selectedId) ?? residents[0] ?? null

  function select(id: string) {
    setSelectedId(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      // armazenamento indisponível (modo privado): só não lembra a escolha
    }
  }

  return { residents, selected, select, loading, error }
}
