import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider.tsx'
import Login from '../routes/Login.tsx'

/**
 * 로그인 여부에 따라 앱 본체와 로그인 화면을 가른다.
 *
 * loading 동안 빈 화면을 두는 이유: 저장된 세션이 있을 때만 loading 으로 시작하므로
 * (bootHint), 여기 걸리는 경우는 "곧 홈이 뜰 사람" 뿐이다. 로그인 화면을 그렸다가
 * 홈으로 바꾸면 켤 때마다 번쩍인다.
 */
export default function Gate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="min-h-dvh bg-bg" aria-busy="true" />
  }
  if (!session) {
    return <Login />
  }
  return <>{children}</>
}
