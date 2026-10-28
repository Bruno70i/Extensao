import { ArrowLeft, KeyRound, Link2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Button, Card, Dialog, EmptyState, ErrorBox, Field, Loading } from '../../components/ui'
import { useToast } from '../../components/toast'
import {
  addLink,
  adminUsers,
  fetchLinks,
  fetchResidents,
  removeLink,
  updateProfile,
  type FamilyLink,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Resident, Role } from '../../lib/types'
import { generateTempPassword } from '../../lib/validation'
import { loadUsers, roleLabel, TempPasswordBox, type UserRow } from './Users'

function FamilyLinks({ familyId }: { familyId: string }) {
  const toast = useToast()
  const [links, setLinks] = useState<FamilyLink[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [residentId, setResidentId] = useState('')
  const [relationship, setRelationship] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [l, r] = await Promise.all([fetchLinks(familyId), fetchResidents({ activeOnly: true })])
    setLinks(l)
    setResidents(r)
  }, [familyId])
  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'))
  }, [load, toast])

  const available = residents.filter((r) => !links.some((l) => l.resident_id === r.id))

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!residentId) return
    setBusy(true)
    try {
      await addLink(familyId, residentId, relationship)
      setResidentId('')
      setRelationship('')
      toast('Vínculo criado')
      await load()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(l: FamilyLink) {
    try {
      await removeLink(familyId, l.resident_id)
      toast('Vínculo removido')
      await load()
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <Card className="stack">
      <div className="row">
        <Link2 size={20} color="var(--primary)" aria-hidden />
        <h2>Residentes que acompanha</h2>
      </div>
      <p className="small muted">O familiar só vê as medicações dos residentes listados aqui.</p>
      {links.length === 0 ? (
        <EmptyState title="Nenhum vínculo ainda" text="Sem vínculo, o familiar não vê nenhuma informação." />
      ) : (
        <div className="list">
          {links.map((l) => (
            <div key={l.resident_id} className="list-item">
              <Avatar name={l.resident_name} />
              <div className="grow">
                <strong>{l.resident_name}</strong>
                {l.relationship && <div className="small muted">{l.relationship}</div>}
              </div>
              <Button variant="ghost" className="icon-btn" aria-label={`Remover vínculo com ${l.resident_name}`} onClick={() => remove(l)}>
                <Trash2 size={18} color="var(--danger)" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <form className="form-grid two" onSubmit={add} style={{ alignItems: 'end' }}>
          <Field label="Residente">
            <select className="select" value={residentId} onChange={(e) => setResidentId(e.target.value)}>
              <option value="">Escolha…</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                  {r.room ? ` (quarto ${r.room})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parentesco (opcional)">
            <input className="input" value={relationship} placeholder="Ex.: Filha" onChange={(e) => setRelationship(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" variant="secondary" loading={busy} disabled={!residentId}>
              Adicionar vínculo
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

export function UserDetailPage() {
  const { id } = useParams()
  const { profile: me } = useAuth()
  const toast = useToast()
  const [user, setUser] = useState<UserRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('family')
  const [busy, setBusy] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'reset' | 'toggle' | null>(null)

  const load = useCallback(async () => {
    try {
      const u = (await loadUsers()).find((x) => x.id === id) ?? null
      setUser(u)
      if (u) {
        setName(u.full_name)
        setRole(u.role)
      }
      setError(u ? null : 'Usuário não encontrado.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])
  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading />
  if (error || !user) return <ErrorBox message={error ?? 'Usuário não encontrado.'} />
  const isMe = user.id === me?.id

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy('save')
    try {
      await updateProfile(user!.id, { full_name: name.trim(), role })
      toast('Dados salvos')
      await load()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function resetPassword() {
    setBusy('reset')
    const password = generateTempPassword()
    try {
      await adminUsers({ action: 'reset_password', user_id: user!.id, temp_password: password })
      setConfirm(null)
      setTempPassword(password)
      await load()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function toggleActive() {
    setBusy('toggle')
    try {
      await adminUsers({ action: 'set_active', user_id: user!.id, active: !user!.active })
      toast(user!.active ? 'Acesso desativado' : 'Acesso reativado')
      setConfirm(null)
      await load()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <Link to="/admin/usuarios" className="small row" style={{ gap: 4 }}>
        <ArrowLeft size={16} aria-hidden /> Usuários
      </Link>

      <Card className="stack">
        <div className="row">
          <Avatar name={user.full_name} large />
          <div className="grow">
            <h1 style={{ fontSize: '1.4rem' }}>{user.full_name}</h1>
            <p className="muted">{user.email}</p>
          </div>
          <span className={`badge ${user.active ? 'badge-ok' : 'badge-missed'}`}>{user.active ? 'Ativo' : 'Inativo'}</span>
        </div>
        <p className="small muted">
          {user.last_sign_in_at
            ? `Último acesso em ${new Date(user.last_sign_in_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
            : 'Ainda não acessou o sistema'}
          {user.must_change_password && ' · precisa criar a própria senha no próximo acesso'}
        </p>
      </Card>

      <Card>
        <form className="stack" onSubmit={save}>
          <h2>Dados</h2>
          <div className="form-grid two">
            <Field label="Nome">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Perfil" hint={isMe ? 'Você não pode mudar o seu próprio perfil' : undefined}>
              <select className="select" value={role} disabled={isMe} onChange={(e) => setRole(e.target.value as Role)}>
                {(['family', 'nurse', 'admin'] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div>
            <Button type="submit" variant="secondary" loading={busy === 'save'}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </Card>

      {user.role === 'family' && <FamilyLinks familyId={user.id} />}

      <Card className="stack">
        <h2>Acesso</h2>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setConfirm('reset')}>
            <KeyRound size={18} aria-hidden /> Redefinir senha
          </Button>
          {!isMe && (
            <Button variant={user.active ? 'danger' : 'secondary'} onClick={() => setConfirm('toggle')}>
              {user.active ? 'Desativar acesso' : 'Reativar acesso'}
            </Button>
          )}
        </div>
      </Card>

      {confirm === 'reset' && (
        <Dialog title="Redefinir senha?" onClose={() => setConfirm(null)}>
          <p>Uma nova senha provisória será gerada. A senha atual de {user.full_name.split(' ')[0]} deixa de funcionar.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button loading={busy === 'reset'} onClick={resetPassword}>
              Gerar nova senha
            </Button>
          </div>
        </Dialog>
      )}
      {confirm === 'toggle' && (
        <Dialog title={user.active ? 'Desativar acesso?' : 'Reativar acesso?'} onClose={() => setConfirm(null)}>
          <p>
            {user.active
              ? `${user.full_name} não conseguirá mais entrar nem ver nenhuma informação. O histórico de registros é mantido.`
              : `${user.full_name} voltará a ter acesso ao sistema.`}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant={user.active ? 'danger' : 'primary'} loading={busy === 'toggle'} onClick={toggleActive}>
              {user.active ? 'Desativar' : 'Reativar'}
            </Button>
          </div>
        </Dialog>
      )}
      {tempPassword && (
        <Dialog title="Nova senha provisória" onClose={() => setTempPassword(null)}>
          <TempPasswordBox email={user.email} password={tempPassword} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={() => setTempPassword(null)}>Concluir</Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
