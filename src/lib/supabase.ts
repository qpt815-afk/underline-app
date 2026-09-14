import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * 환경변수가 없을 때 import 시점에 throw 하면 화면이 하얗게 뜨고 끝난다.
 * 폰에는 개발자 도구가 없어서 원인을 볼 방법이 없으므로, 대신 여기에 담아두고
 * 앱이 안내 화면을 그리게 한다.
 */
export const SUPABASE_CONFIG_ERROR: string | null =
  !url || !key
    ? `환경변수가 설정되지 않았습니다: ${[!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_PUBLISHABLE_KEY']
        .filter(Boolean)
        .join(', ')}`
    : null

/**
 * 세션이 저장되는 localStorage 키를 직접 못박는다.
 * supabase-js 의 기본값은 URL 호스트명에서 유도되는 내부 구현 세부사항이라,
 * 부팅 힌트(bootHint)가 같은 키를 읽으려면 상수로 고정하는 편이 안전하다.
 */
export const AUTH_STORAGE_KEY = 'underline-auth'

// 설정이 없으면 이 클라이언트는 쓰이지 않는다(안내 화면이 먼저 뜬다).
// 자리표시자를 넘기는 것은 import 가 폭발하지 않게 하려는 것뿐이다.
export const supabase = createClient<Database>(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 리다이렉트 기반 로그인을 쓰지 않으므로 부팅 때 URL 을 파싱할 필요가 없다.
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
      // lock 옵션은 넘기지 않는다 — 2.112.4 부터 deprecated, v3 에서 제거된다.
      // userStorage 도 넘기지 않는다 — 세션과 user 가 분리 저장되어 bootHint 가 깨진다.
    },
  }
)
