import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Loading } from './components/ui'
import { homeFor, useAuth } from './lib/auth'
import type { Role } from './lib/types'
import {
  AccountPage,
  DisabledPage,
  FirstAccessPage,
  ForgotPasswordPage,
  LoginPage,
  PrivacyPage,
  ResetPasswordPage,
} from './pages/auth'

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (!profile || !profile.active) return <Navigate to="/desativado" replace />
  if (profile.must_change_password) return <Navigate to="/primeiro-acesso" replace />
  if (!roles.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />
  return <>{children}</>
}

function Home() {
  const { profile, session, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/desativado" replace />
  return <Navigate to={homeFor(profile.role)} replace />
}

const ALL: Role[] = ['admin', 'nurse', 'family']
const STAFF: Role[] = ['admin', 'nurse']
const ADMIN: Role[] = ['admin']
const FAMILY: Role[] = ['family']

function Soon({ name }: { name: string }) {
  return <h1>{name}</h1>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/primeiro-acesso" element={<FirstAccessPage />} />
      <Route path="/desativado" element={<DisabledPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />

      <Route element={<RequireRole roles={ALL}><Layout /></RequireRole>}>
        <Route path="/conta" element={<AccountPage />} />
      </Route>
      <Route element={<RequireRole roles={STAFF}><Layout /></RequireRole>}>
        <Route path="/hoje" element={<Soon name="Hoje" />} />
        <Route path="/residentes" element={<Soon name="Residentes" />} />
      </Route>
      <Route element={<RequireRole roles={FAMILY}><Layout /></RequireRole>}>
        <Route path="/familia" element={<Soon name="Meu idoso" />} />
        <Route path="/familia/historico" element={<Soon name="Histórico" />} />
      </Route>
      <Route element={<RequireRole roles={ADMIN}><Layout /></RequireRole>}>
        <Route path="/admin" element={<Soon name="Painel" />} />
        <Route path="/admin/usuarios" element={<Soon name="Usuários" />} />
        <Route path="/admin/auditoria" element={<Soon name="Auditoria" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
