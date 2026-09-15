import { supabase } from './supabase.ts'
import { localDateKey, pickForDate } from './daily.ts'
import type { HighlightWithBook } from './types.ts'

/**
 * 오늘의 문장을 정하고 daily_picks 에 남긴다.
 *
 * 이력을 서버에 두는 이유는 두 가지다.
 * 1. 최근 30일 안에 보여준 문장은 다시 뽑지 않는다(명세).
 * 2. 아침 8시 푸시가 보낸 문장과 앱을 열었을 때의 문장이 같아야 한다.
 *    푸시를 보내는 서버 함수가 같은 표에 먼저 써 두면 여기서는 그걸 읽기만 한다.
 *
 * 서버에 닿지 못하면(오프라인) 날짜 시드로 뽑되 기록은 남기지 않는다.
 */

const LOOKBACK_DAYS = 30

function daysAgo(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`)
  d.setDate(d.getDate() - days)
  return localDateKey(d)
}

export async function resolveDailyPick(
  candidates: readonly HighlightWithBook[],
  userId: string,
  nonce: number
): Promise<HighlightWithBook | null> {
  if (candidates.length === 0) return null
  const today = localDateKey()
  const byId = new Map(candidates.map((h) => [h.id, h]))

  try {
    const { data: history, error } = await supabase
      .from('daily_picks')
      .select('pick_date, highlight_id')
      .gte('pick_date', daysAgo(today, LOOKBACK_DAYS))
    if (error) throw new Error(error.message)

    const todayRow = history.find((row) => row.pick_date === today)
    // "다른 문장" 을 누르지 않았고 오늘 것이 이미 있으면(푸시가 정했거나 아까 정했거나) 그대로.
    if (nonce === 0 && todayRow) {
      const existing = byId.get(todayRow.highlight_id)
      if (existing) return existing
      // 그 문장이 지워졌으면 아래로 내려가 새로 뽑는다.
    }

    // 최근 30일에 나온 것(오늘 것 포함)은 빼고 뽑는다. 다 빠지면 전체에서 뽑는다.
    const recent = new Set(history.map((row) => row.highlight_id))
    const pool = candidates.filter((h) => !recent.has(h.id))
    const pick = pickForDate(pool.length > 0 ? pool : candidates, today, nonce)
    if (!pick) return null

    const { error: upsertError } = await supabase
      .from('daily_picks')
      .upsert({ user_id: userId, pick_date: today, highlight_id: pick.id }, { onConflict: 'user_id,pick_date' })
    if (upsertError) throw new Error(upsertError.message)
    return pick
  } catch {
    // 오프라인이거나 표가 아직 없다. 그래도 오늘의 문장은 떠야 한다.
    return pickForDate(candidates, today, nonce)
  }
}
