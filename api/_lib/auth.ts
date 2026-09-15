import { createClient } from '@supabase/supabase-js'

/**
 * 요청의 Bearer 토큰이 유효한 Supabase 세션인지 확인한다.
 *
 * 이게 없으면 URL 만 알면 누구나 OCR 을 호출해 Gemini 한도를 쓸 수 있다.
 * getUser(jwt) 는 Supabase 인증 서버에 토큰을 보내 검증하므로 서명 검사를
 * 직접 구현하지 않아도 된다.
 *
 * 서버 함수에서는 VITE_ 접두사 변수도 그대로 읽힌다(Vercel 은 모든 환경변수를
 * 함수에 노출한다). 별도 이름을 두면 두 군데 넣어야 하므로 같은 것을 쓴다.
 */
export async function verifyBearer(request: Request): Promise<{ userId: string } | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
  if (!token) return null

  const url = process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return null

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return { userId: data.user.id }
}
