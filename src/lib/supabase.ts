import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 가 설정되지 않았습니다. ' +
      'Vercel 대시보드 > Settings > Environment Variables 를 확인하세요.'
  )
}

/**
 * 세션이 저장되는 localStorage 키를 직접 못박는다.
 * supabase-js 의 기본값은 URL 호스트명에서 유도되는 내부 구현 세부사항이라,
 * 부팅 힌트(bootHint)가 같은 키를 읽으려면 상수로 고정하는 편이 안전하다.
 */
export const AUTH_STORAGE_KEY = 'underline-auth'

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // 리다이렉트 기반 로그인을 쓰지 않으므로 부팅 때 URL 을 파싱할 필요가 없다.
    detectSessionInUrl: false,
    storageKey: AUTH_STORAGE_KEY,
    // lock 옵션은 넘기지 않는다 — 2.112.4 부터 deprecated, v3 에서 제거된다.
    // userStorage 도 넘기지 않는다 — 세션과 user 가 분리 저장되어 bootHint 가 깨진다.
  },
})
