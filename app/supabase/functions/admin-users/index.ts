// Edge Function: operações de usuários que exigem a chave service_role.
// Só administradores ativos podem chamar. A chave secreta nunca vai para o navegador.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = ['admin', 'nurse', 'family']
const BAN_FOREVER = '876000h'

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const fail = (error: string, status = 400) => reply({ ok: false, error }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail('Método não permitido', 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Quem está chamando?
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await caller.auth.getUser()
  if (!auth.user) return fail('Sessão inválida', 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', auth.user.id).single()
  if (!me || me.role !== 'admin' || !me.active) return fail('Apenas administradores podem fazer isso', 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Requisição inválida')
  }

  switch (body.action) {
    case 'list': {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (error) return fail('Não foi possível listar os usuários', 500)
      return reply({
        ok: true,
        users: data.users.map((u) => ({ id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at })),
      })
    }

    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase()
      const fullName = String(body.full_name ?? '').trim()
      const role = String(body.role ?? '')
      const password = String(body.temp_password ?? '')
      if (!/^\S+@\S+\.\S+$/.test(email)) return fail('E-mail inválido')
      if (!fullName) return fail('Informe o nome')
      if (!ROLES.includes(role)) return fail('Perfil inválido')
      if (password.length < 8) return fail('Senha provisória muito curta')
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        // O papel vai no app_metadata: só o servidor consegue definir
        app_metadata: { role },
      })
      if (error) {
        const exists = /already|registered|exists/i.test(error.message)
        return fail(exists ? 'Já existe um usuário com este e-mail' : 'Não foi possível criar o usuário', exists ? 409 : 500)
      }
      return reply({ ok: true, user_id: data.user.id })
    }

    case 'reset_password': {
      const userId = String(body.user_id ?? '')
      const password = String(body.temp_password ?? '')
      if (password.length < 8) return fail('Senha provisória muito curta')
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return fail('Não foi possível redefinir a senha', 500)
      await admin.from('profiles').update({ must_change_password: true }).eq('id', userId)
      return reply({ ok: true })
    }

    case 'set_active': {
      const userId = String(body.user_id ?? '')
      const active = body.active === true
      if (userId === auth.user.id && !active) return fail('Você não pode desativar a sua própria conta')
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : BAN_FOREVER })
      if (error) return fail('Não foi possível alterar o acesso', 500)
      await admin.from('profiles').update({ active }).eq('id', userId)
      return reply({ ok: true })
    }

    default:
      return fail('Ação desconhecida')
  }
})
