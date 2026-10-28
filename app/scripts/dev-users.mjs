// Cria usuários de teste no Supabase LOCAL (npx supabase start). Nunca use em produção.
// Uso: node scripts/dev-users.mjs
const API = 'http://127.0.0.1:54321'
// Chave service_role de demonstração do Supabase CLI (pública, só funciona localmente)
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
export const DEV_PASSWORD = 'teste1234'
export const DEV_USERS = [
  { email: 'admin@cuidar.test', full_name: 'Bruno Admin', role: 'admin' },
  { email: 'ana@cuidar.test', full_name: 'Ana Paula Costa', role: 'nurse' },
  { email: 'carla@cuidar.test', full_name: 'Carla Ferreira', role: 'family' },
]

const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

for (const u of DEV_USERS) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: u.email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
      app_metadata: { role: u.role },
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    console.log(`${u.email}: ${body.msg ?? body.message ?? res.status}`)
    continue
  }
  // Usuários de teste já entram sem precisar trocar a senha
  await fetch(`${API}/rest/v1/profiles?id=eq.${body.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ must_change_password: false }),
  })
  console.log(`${u.email}: criado`)
}

// Vincula a familiar ao primeiro residente (João)
const fam = await (await fetch(`${API}/rest/v1/profiles?role=eq.family&select=id`, { headers })).json()
const res = await (await fetch(`${API}/rest/v1/residents?select=id&order=full_name&limit=1&full_name=like.Jo*`, { headers })).json()
if (fam[0] && res[0]) {
  await fetch(`${API}/rest/v1/family_links`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ family_id: fam[0].id, resident_id: res[0].id, relationship: 'Filha' }),
  })
  console.log('Vínculo familiar criado')
}
