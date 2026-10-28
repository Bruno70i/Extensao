import { supabase } from './supabase'

/** Chama `onChange` quando um registro de dose é inserido para alguma das prescrições. Retorna o cancelamento. */
export function subscribeAdministrations(prescriptionIds: string[], onChange: () => void): () => void {
  if (prescriptionIds.length === 0) return () => {}
  const channel = supabase
    .channel(`administrations-${prescriptionIds.join(',').slice(0, 40)}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'administrations',
        filter: `prescription_id=in.(${prescriptionIds.join(',')})`,
      },
      onChange,
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
