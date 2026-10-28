import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { WifiOff } from 'lucide-react'
import { Button, Loading } from './components/ui'
import { homeFor, useAuth } from './lib/auth'
import { routeDecision } from './lib/rules'
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
import { AuditPage } from './pages/admin/Audit'
import { DashboardPage } from './pages/admin/Dashboard'
import { UserDetailPage } from './pages/admin/UserDetail'
import { UsersPage } from './pages/admin/Users'
import { FamilyHistoryPage, FamilyHomePage } from './pages/family/FamilyPages'
import { TodayPage } from './pages/nurse/Today'
import { PrescriptionFormPage } from './pages/residents/PrescriptionForm'
import { ResidentDetailPage } from './pages/residents/ResidentDetail'
import { ResidentFormPage } from './pages/residents/ResidentForm'
import { ResidentListPage } from './pages/residents/ResidentList'

function ProfileErrorScreen() {
  const { refreshProfile, signOut } = useAuth()
  return (
    <div className="center-screen">
      <div className="auth-card stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        <WifiOff size={36} color="var(--muted)" aria-hidden />
        <h1 style={{ fontSize: '1.35rem' }}>Sem conexão com o servidor</h1>
        <p className="muted">Não foi possível carregar seus dados. Verifique a internet e tente novamente.</p>
        <div className="row">
          <Button variant="secondary" onClick={signOut}>
            Sair
          </Button>
          <Button onClick={refreshProfile}>Tentar novamente</Button>
        </div>
      </div>
    </div>
  )
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session, profile, profileError, loading } = useAuth()
  const location = useLocation()

  switch (routeDecision({ loading, hasSession: !!session, profile, profileError, roles })) {
    case 'loading':
      return <Loading />
    case 'login':
      return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    case 'error':
      return <ProfileErrorScreen />
    case 'disabled':
      return <Navigate to="/desativado" replace />
    case 'first-access':
      return <Navigate to="/primeiro-acesso" replace />
    case 'home':
      return <Navigate to={homeFor(profile!.role)} replace />
    default:
      return <>{children}</>
  }
}

function Home() {
  const { profile, profileError, session, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (profileError) return <ProfileErrorScreen />
  if (!profile) return <Navigate to="/desativado" replace />
  return <Navigate to={homeFor(profile.role)} replace />
}

const ALL: Role[] = ['admin', 'nurse', 'family']
const STAFF: Role[] = ['admin', 'nurse']
const ADMIN: Role[] = ['admin']
const FAMILY: Role[] = ['family']

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
        <Route path="/hoje" element={<TodayPage />} />
        <Route path="/residentes" element={<ResidentListPage />} />
        <Route path="/residentes/novo" element={<ResidentFormPage />} />
        <Route path="/residentes/:id" element={<ResidentDetailPage />} />
        <Route path="/residentes/:id/editar" element={<ResidentFormPage />} />
        <Route path="/residentes/:id/prescricoes/nova" element={<PrescriptionFormPage />} />
        <Route path="/residentes/:id/prescricoes/:pid/editar" element={<PrescriptionFormPage />} />
      </Route>
      <Route element={<RequireRole roles={FAMILY}><Layout /></RequireRole>}>
        <Route path="/familia" element={<FamilyHomePage />} />
        <Route path="/familia/historico" element={<FamilyHistoryPage />} />
      </Route>
      <Route element={<RequireRole roles={ADMIN}><Layout /></RequireRole>}>
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/admin/usuarios" element={<UsersPage />} />
        <Route path="/admin/usuarios/:id" element={<UserDetailPage />} />
        <Route path="/admin/auditoria" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
