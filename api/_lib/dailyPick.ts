import type { ServerClient } from './supabaseServer.js'

/**
 * 서버 쪽 "오늘의 문장".
 *
 * 클라이언트(src/lib/dailyPick.ts)와 같은 표 daily_picks 를 쓴다. 아침 푸시가 먼저
 * 돌면서 오늘 행을 써 두면, 앱은 그 행을 읽어 같은 문장을 보여준다.
 * 이미 오늘 행이 있으면(사용자가 먼저 앱을 열었거나 테스트 알림을 눌렀거나) 그대로 쓴다.
 */

const LOOKBACK_DAYS = 30

/** 한국 시간 기준 YYYY-MM-DD. Cron 은 UTC 23시에 돌므로 UTC 날짜는 하루 전이다. */
export function seoulDateKey(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function daysBefore(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export interface DailyPick {
  id: string
  text: string
  page: number | null
  bookTitle: string | null
  author: string | null
}

const SELECT = 'id, text, page, book:books(title, author)' as const

export async function pickForUser(db: ServerClient, userId: string, dateKey: string): Promise<DailyPick | null> {
  const { data: history, error: historyError } = await db
    .from('daily_picks')
    .select('pick_date, highlight_id')
    .eq('user_id', userId)
    .gte('pick_date', daysBefore(dateKey, LOOKBACK_DAYS))
  if (historyError) throw new Error(historyError.message)

  const todayId = history.find((row) => row.pick_date === dateKey)?.highlight_id
  if (todayId) {
    const { data: existing, error } = await db.from('highlights').select(SELECT).eq('id', todayId).maybeSingle()
    if (error) throw new Error(error.message)
    if (existing) return toPick(existing)
    // 그 문장이 지워졌다. 아래에서 새로 뽑는다.
  }

  const { data: all, error: allError } = await db.from('highlights').select(SELECT).eq('user_id', userId)
  if (allError) throw new Error(allError.message)
  if (all.length === 0) return null

  const recent = new Set(history.map((row) => row.highlight_id))
  const pool = all.filter((h) => !recent.has(h.id))
  const source = pool.length > 0 ? pool : all
  const chosen = source[Math.floor(Math.random() * source.length)]
  if (!chosen) return null

  const { error: upsertError } = await db
    .from('daily_picks')
    .upsert({ user_id: userId, pick_date: dateKey, highlight_id: chosen.id }, { onConflict: 'user_id,pick_date' })
  if (upsertError) throw new Error(upsertError.message)
  return toPick(chosen)
}

function toPick(row: { id: string; text: string; page: number | null; book: { title: string; author: string | null } | null }): DailyPick {
  return { id: row.id, text: row.text, page: row.page, bookTitle: row.book?.title ?? null, author: row.book?.author ?? null }
}
