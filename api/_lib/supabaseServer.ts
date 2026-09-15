import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types.js'

export type ServerClient = SupabaseClient<Database>

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

function baseUrl(): string | null {
  return process.env.VITE_SUPABASE_URL?.trim() || null
}

/**
 * 로그인한 사용자 본인으로서 움직이는 클라이언트. RLS 가 그대로 적용된다.
 * 사용자가 시킨 일(테스트 알림)은 이걸로 충분하고, 비밀 키가 필요 없다.
 */
export function clientAsUser(token: string): ServerClient | null {
  const url = baseUrl()
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return null
  return createClient<Database>(url, key, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/**
 * RLS 를 건너뛰는 관리자 클라이언트. Cron 처럼 "모든 사용자" 를 돌아야 하는 곳에서만 쓴다.
 *
 * SUPABASE_SECRET_KEY 는 Supabase 대시보드의 secret key(sb_secret_…)다.
 * 절대 VITE_ 접두사를 붙이지 말 것 — 붙이는 순간 번들에 박혀 누구나 모든 행을 읽는다.
 */
export function clientAsAdmin(): ServerClient | null {
  const url = baseUrl()
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !key) return null
  return createClient<Database>(url, key, { auth: NO_SESSION })
}
