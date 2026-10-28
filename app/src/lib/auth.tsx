import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Profile, Role } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn(email: string, password: string): Promise<string | null>
  signOut(): Promise<void>
  refreshProfile(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function homeFor(role: Role): string {
  return { admin: '/admin', nurse: '/hoje', family: '/familia' }[role]
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, active, must_change_password')
    .eq('id', userId)
    .maybeSingle()
  return (data as Profile | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const apply = async (s: Session | null) => {
      const p = s ? await loadProfile(s.user.id) : null
      if (cancelled) return
      setSession(s)
      setProfile(p)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // Evita recarregar o perfil a cada renovação de token
      if (event === 'TOKEN_REFRESHED') {
        setSession(s)
        return
      }
      // Executa fora do callback do Supabase (recomendação da biblioteca)
      setTimeout(() => apply(s), 0)
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (!error) return null
    if (error.message.toLowerCase().includes('invalid')) return 'E-mail ou senha incorretos.'
    if (error.message.toLowerCase().includes('banned')) return 'Seu acesso está desativado. Fale com a clínica.'
    return 'Não foi possível entrar. Verifique sua conexão e tente novamente.'
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await loadProfile(session.user.id))
  }, [session])

  const value = useMemo(
    () => ({ session, profile, loading, signIn, signOut, refreshProfile }),
    [session, profile, loading, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
