import {
  CalendarCheck,
  ClipboardList,
  HeartPulse,
  History,
  LayoutDashboard,
  Plus,
  UserCircle,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/types'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const menus: Record<Role, NavItem[]> = {
  nurse: [
    { to: '/hoje', label: 'Hoje', icon: CalendarCheck },
    { to: '/residentes', label: 'Residentes', icon: Users },
    { to: '/conta', label: 'Conta', icon: UserCircle },
  ],
  family: [
    { to: '/familia', label: 'Meu idoso', icon: HeartPulse, end: true },
    { to: '/familia/historico', label: 'Histórico', icon: History },
    { to: '/conta', label: 'Conta', icon: UserCircle },
  ],
  admin: [
    { to: '/admin', label: 'Painel', icon: LayoutDashboard, end: true },
    { to: '/hoje', label: 'Hoje', icon: CalendarCheck },
    { to: '/residentes', label: 'Residentes', icon: Users },
    { to: '/admin/usuarios', label: 'Usuários', icon: UserCircle },
  ],
}

const roleLabel: Record<Role, string> = { admin: 'Administrador', nurse: 'Enfermagem', family: 'Familiar' }

export function Layout() {
  const { profile } = useAuth()
  if (!profile) return null
  const items = menus[profile.role]

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Cuidar+ — início">
          <span className="brand-mark">
            <Plus size={20} strokeWidth={3} aria-hidden />
          </span>
          Cuidar+
        </Link>
        <div className="row">
          {profile.role === 'admin' && (
            <Link to="/admin/auditoria" className="btn btn-ghost btn-sm" title="Auditoria">
              <ClipboardList size={18} aria-hidden />
              <span className="hide-sm">Auditoria</span>
            </Link>
          )}
          <Link to="/conta" className="row" style={{ textDecoration: 'none', color: 'inherit', gap: 8 }}>
            <span className="small" style={{ textAlign: 'right', lineHeight: 1.2 }}>
              <strong style={{ display: 'block' }}>{profile.full_name.split(' ')[0]}</strong>
              <span className="muted">{roleLabel[profile.role]}</span>
            </span>
          </Link>
        </div>
      </header>
      <nav className="nav" aria-label="Menu principal">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
