import { AUTH_STORAGE_KEY } from '../lib/supabase.ts'

/**
 * 앱을 켤 때 로그인 화면이 번쩍였다가 홈으로 바뀌는 것을 막기 위한 힌트.
 *
 * onAuthStateChange 의 INITIAL_SESSION 은 내부 initialize() 가 끝난 뒤에 온다.
 * 오프라인이면 토큰 갱신 요청이 실패할 때까지 기다리므로 그동안 로딩 상태다.
 * 그 사이에 로그인 화면을 그리면, 이미 로그인돼 있는 사용자에게 매번 깜빡인다.
 *
 * 이건 힌트일 뿐이고 실제 판단은 INITIAL_SESSION 이 온 뒤에 한다.
 */
export function hasStoredSession(): boolean {
  try {
    const raw = globalThis.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return false

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return false

    const session = parsed as { refresh_token?: unknown; expires_at?: unknown }
    if (typeof session.refresh_token !== 'string' || session.refresh_token === '') return false

    // 리프레시 토큰이 아주 오래됐으면 어차피 서버가 거절한다.
    // 그럴 땐 스켈레톤을 보여주느니 바로 로그인 화면을 그리는 편이 덜 답답하다.
    if (typeof session.expires_at === 'number') {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
      if (Date.now() - session.expires_at * 1000 > THIRTY_DAYS_MS) return false
    }

    return true
  } catch {
    // 시크릿 모드, 저장소 차단, 깨진 JSON
    return false
  }
}
