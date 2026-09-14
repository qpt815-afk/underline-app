import { createContext, use, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'
import { hasStoredSession } from './bootHint.ts'

interface AuthState {
  session: Session | null
  user: User | null
  /** 아직 첫 세션 판정이 끝나지 않음 */
  loading: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // 저장된 세션이 있으면 로딩으로 시작한다. 없으면 곧장 로그인 화면을 그려도 되므로
  // 굳이 기다리게 하지 않는다.
  const [loading, setLoading] = useState(hasStoredSession)

  useEffect(() => {
    // INITIAL_SESSION 이 구독당 정확히 한 번 온다. 이게 앱 시작 시점의 세션 읽기이므로
    // getSession() 을 따로 부르지 않는다 (같은 일을 두 번 하게 된다).
    //
    // 콜백은 반드시 동기로 둔다. async 콜백은 deprecated 이고,
    // TOKEN_REFRESHED 안에서 refreshSession 을 부르면 데드락이 난다.
    // 부수효과가 필요하면 user.id 를 키로 하는 별도 useEffect 에서 한다.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => { data.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading]
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다')
  return ctx
}
