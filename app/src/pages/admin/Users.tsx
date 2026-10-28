import { ChevronRight, Copy, Search, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Button, Dialog, EmptyState, ErrorBox, Field, Loading, PageHead } from '../../components/ui'
import { useToast } from '../../components/toast'
import { adminUsers, fetchProfiles, type AuthUserInfo } from '../../lib/api'
import type { Profile, Role } from '../../lib/types'
import { generateTempPassword } from '../../lib/validation'

export const roleLabel: Record<Role, string> = { admin: 'Administrador', nurse: 'Enfermagem', family: 'Familiar' }
type Filter = 'all' | Role

export type UserRow = Profile & { email: string; last_sign_in_at: string | null }

export async function loadUsers(): Promise<UserRow[]> {
  const [profiles, auth] = await Promise.all([fetchProfiles(), adminUsers({ action: 'list' })])
  const byId = new Map((auth.users ?? []).map((u: AuthUserInfo) => [u.id, u]))
  return profiles.map((p) => ({
    ...p,
    email: byId.get(p.id)?.email ?? '',
    last_sign_in_at: byId.get(p.id)?.last_sign_in_at ?? null,
  }))
}

export function TempPasswordBox({ email, password }: { email?: string; password: string }) {
  const toast = useToast()
  const text = email ? `Acesso ao Cuidar+\nE-mail: ${email}\nSenha provisória: ${password}` : password
  return (
    <div className="stack">
      <div className="alert alert-info">
        Anote ou copie a senha provisória agora: <strong>ela não será mostrada de novo</strong>. No primeiro acesso a
        pessoa vai criar a própria senha.
      </div>
      <div className="temp-pass">{password}</div>
      <Button
        variant="secondary"
        onClick={() =>
          navigator.clipboard
            ?.writeText(text)
            .then(() => toast('Copiado'))
            .catch(() => toast('Não foi possível copiar', 'error'))
        }
      >
        <Copy size={18} aria-hidden /> Copiar dados de acesso
      </Button>
    </div>
  )
}

function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', role: 'family' as Role })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ id: string; password: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) return setError('Preencha nome e e-mail.')
    setBusy(true)
    setError(null)
    const password = generateTempPassword()
    try {
      const res = await adminUsers({ action: 'create', ...form, temp_password: password })
      setCreated({ id: res.user_id!, password })
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (created)
    return (
      <Dialog title="Usuário criado" onClose={onClose}>
        <p>
          <strong>{form.full_name}</strong> já pode entrar com o e-mail <strong>{form.email}</strong>.
        </p>
        <TempPasswordBox email={form.email} password={created.password} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {form.role === 'family' && (
            <Button variant="secondary" onClick={() => navigate(`/admin/usuarios/${created.id}`)}>
              Vincular a um residente
            </Button>
          )}
          <Button onClick={onClose}>Concluir</Button>
        </div>
      </Dialog>
    )

  return (
    <Dialog title="Novo usuário" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Nome completo">
          <input className="input" value={form.full_name} autoFocus onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Perfil">
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="family">Familiar — acompanha um residente</option>
            <option value="nurse">Enfermagem — registra doses e prescrições</option>
            <option value="admin">Administrador — acesso total</option>
          </select>
        </Field>
        <p className="small muted">Uma senha provisória será gerada automaticamente.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Criar usuário
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    loadUsers()
      .then((u) => {
        setUsers(u)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(
      (u) =>
        (filter === 'all' || u.role === filter) &&
        (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    )
  }, [users, filter, query])

  const count = (r: Role) => users.filter((u) => u.role === r).length

  return (
    <div className="stack-lg">
      <PageHead
        title="Usuários"
        sub={`${users.filter((u) => u.active).length} ativos`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus size={20} aria-hidden /> Novo usuário
          </Button>
        }
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      <div className="search">
        <Search size={18} aria-hidden />
        <input className="input" placeholder="Buscar por nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar usuário" />
      </div>
      <div className="chips">
        {(
          [
            ['all', `Todos (${users.length})`],
            ['nurse', `Enfermagem (${count('nurse')})`],
            ['family', `Familiares (${count('family')})`],
            ['admin', `Admins (${count('admin')})`],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState title="Nenhum usuário encontrado" />
      ) : (
        <div className="list">
          {visible.map((u) => (
            <Link key={u.id} to={`/admin/usuarios/${u.id}`} className="list-item" style={{ opacity: u.active ? 1 : 0.6 }}>
              <Avatar name={u.full_name} />
              <div className="grow">
                <strong>{u.full_name}</strong>
                <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.email}
                </div>
              </div>
              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                <span className="badge badge-neutral">{roleLabel[u.role]}</span>
                {!u.active && <span className="badge badge-missed">Inativo</span>}
                {u.active && u.must_change_password && <span className="small muted">aguardando 1º acesso</span>}
              </div>
              <ChevronRight size={20} color="var(--muted)" aria-hidden />
            </Link>
          ))}
        </div>
      )}
      {creating && <NewUserDialog onClose={() => setCreating(false)} onCreated={load} />}
    </div>
  )
}
