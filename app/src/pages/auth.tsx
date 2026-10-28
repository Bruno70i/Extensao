import { Lock, Plus, ShieldOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Field, PageHead } from '../components/ui'
import { useToast } from '../components/toast'
import { homeFor, useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { validateNewPassword } from '../lib/validation'

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="center-screen">
      <div className="auth-card stack-lg">
        <div className="brand" style={{ justifyContent: 'center', fontSize: '1.4rem' }}>
          <span className="brand-mark" style={{ width: 40, height: 40 }}>
            <Plus size={24} strokeWidth={3} aria-hidden />
          </span>
          Cuidar+
        </div>
        <Card>{children}</Card>
        <p className="small muted" style={{ textAlign: 'center' }}>
          <Link to="/privacidade">Privacidade e uso dos dados</Link>
        </p>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { session, profile, signIn } = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session && profile) return <Navigate to={params.get('next') || homeFor(profile.role)} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await signIn(email, password))
    setBusy(false)
  }

  return (
    <AuthShell>
      <form className="stack" onSubmit={submit}>
        <div>
          <h1 style={{ fontSize: '1.35rem' }}>Entrar</h1>
          <p className="muted small">Acompanhamento de medicamentos da clínica</p>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" block loading={busy}>
          Entrar
        </Button>
        <Link to="/esqueci-senha" className="small" style={{ textAlign: 'center' }}>
          Esqueci minha senha
        </Link>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setBusy(false)
    setSent(true)
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="stack">
          <h1 style={{ fontSize: '1.35rem' }}>Verifique seu e-mail</h1>
          <p className="muted">Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.</p>
          <Link to="/login">Voltar para o login</Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <h1 style={{ fontSize: '1.35rem' }}>Esqueci minha senha</h1>
          <p className="muted small">Informe seu e-mail para receber um link de redefinição.</p>
          <Field label="E-mail">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" block loading={busy}>
            Enviar link
          </Button>
          <Link to="/login" className="small" style={{ textAlign: 'center' }}>
            Voltar
          </Link>
        </form>
      )}
    </AuthShell>
  )
}

function NewPasswordForm({ title, text }: { title: string; text: string }) {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = validateNewPassword(a, b)
    if (v) return setError(v)
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: a })
    if (err) {
      setBusy(false)
      return setError(
        err.message.toLowerCase().includes('different')
          ? 'A nova senha precisa ser diferente da atual.'
          : 'Não foi possível salvar a senha. Tente novamente.',
      )
    }
    await supabase.rpc('mark_password_changed')
    await refreshProfile()
    setBusy(false)
    toast('Senha salva')
    navigate(profile ? homeFor(profile.role) : '/', { replace: true })
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="row">
        <Lock size={22} color="var(--primary)" aria-hidden />
        <h1 style={{ fontSize: '1.35rem' }}>{title}</h1>
      </div>
      <p className="muted small">{text}</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <Field label="Nova senha" hint="Mínimo de 8 caracteres">
        <input className="input" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} />
      </Field>
      <Field label="Repita a nova senha">
        <input className="input" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} />
      </Field>
      <Button type="submit" block loading={busy}>
        Salvar senha
      </Button>
    </form>
  )
}

export function FirstAccessPage() {
  const { session, loading } = useAuth()
  if (!loading && !session) return <Navigate to="/login" replace />
  return (
    <AuthShell>
      <NewPasswordForm title="Crie sua senha" text="Por segurança, troque a senha provisória que você recebeu da clínica." />
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session)
    return (
      <AuthShell>
        <div className="stack">
          <h1 style={{ fontSize: '1.35rem' }}>Link inválido ou expirado</h1>
          <Link to="/esqueci-senha">Pedir um novo link</Link>
        </div>
      </AuthShell>
    )
  return (
    <AuthShell>
      <NewPasswordForm title="Nova senha" text="Escolha uma nova senha para acessar o sistema." />
    </AuthShell>
  )
}

export function DisabledPage() {
  const { signOut } = useAuth()
  return (
    <AuthShell>
      <div className="stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        <ShieldOff size={36} color="var(--danger)" aria-hidden />
        <h1 style={{ fontSize: '1.35rem' }}>Acesso desativado</h1>
        <p className="muted">Seu acesso foi desativado pela clínica. Se acha que é um engano, entre em contato com a administração.</p>
        <Button variant="secondary" onClick={signOut}>
          Sair
        </Button>
      </div>
    </AuthShell>
  )
}

export function AccountPage() {
  const { profile, session, signOut, refreshProfile } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'name' | 'pw' | null>(null)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy('name')
    const { error } = await supabase.rpc('update_my_name', { new_name: name })
    await refreshProfile()
    setBusy(null)
    toast(error ? 'Não foi possível salvar o nome' : 'Nome atualizado', error ? 'error' : 'ok')
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    const v = validateNewPassword(a, b)
    setPwError(v)
    if (v) return
    setBusy('pw')
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(null)
    if (error) return setPwError('Não foi possível trocar a senha. Tente novamente.')
    setA('')
    setB('')
    toast('Senha alterada')
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 560 }}>
      <PageHead title="Minha conta" sub={session?.user.email} />
      <Card>
        <form className="stack" onSubmit={saveName}>
          <h2>Dados</h2>
          <Field label="Nome">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" variant="secondary" loading={busy === 'name'}>
              Salvar nome
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <form className="stack" onSubmit={savePassword}>
          <h2>Trocar senha</h2>
          {pwError && <div className="alert alert-error">{pwError}</div>}
          <Field label="Nova senha" hint="Mínimo de 8 caracteres">
            <input className="input" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} />
          </Field>
          <Field label="Repita a nova senha">
            <input className="input" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" variant="secondary" loading={busy === 'pw'}>
              Trocar senha
            </Button>
          </div>
        </form>
      </Card>
      <div className="row-between">
        <Link to="/privacidade" className="small">
          Privacidade e uso dos dados
        </Link>
        <Button variant="danger" onClick={signOut}>
          Sair
        </Button>
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <div className="center-screen" style={{ alignItems: 'flex-start' }}>
      <div className="stack-lg" style={{ maxWidth: 680 }}>
        <Link to="/" className="small">
          ← Voltar
        </Link>
        <h1>Privacidade e uso dos dados</h1>
        <Card className="stack">
          <h2>Quais dados guardamos</h2>
          <p>
            Nome, data de nascimento, quarto, alergias e observações de saúde dos residentes; as prescrições
            (medicamento, dose, horários e médico responsável) e o registro de cada dose administrada. Dos usuários,
            guardamos nome, e-mail e perfil de acesso.
          </p>
          <h2>Para que usamos</h2>
          <p>
            Exclusivamente para organizar a administração de medicamentos na clínica e permitir que os familiares
            acompanhem o cuidado. Os dados não são vendidos nem compartilhados com terceiros.
          </p>
          <h2>Quem acessa</h2>
          <p>
            A equipe de enfermagem acessa os dados clínicos. Cada familiar vê somente o(s) residente(s) vinculado(s) a
            ele pela administração. Os registros de doses não podem ser apagados, para manter o histórico do cuidado.
          </p>
          <h2>Seus direitos</h2>
          <p>
            Dados de saúde são dados sensíveis pela LGPD (Lei 13.709/2018). Para consultar, corrigir ou pedir a exclusão
            de dados, procure a administração da clínica.
          </p>
        </Card>
      </div>
    </div>
  )
}
