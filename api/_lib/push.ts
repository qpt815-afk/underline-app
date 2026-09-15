import webpush from 'web-push'
import { pickForUser } from './dailyPick.js'
import type { ServerClient } from './supabaseServer.js'

/**
 * 한 사용자에게 오늘의 문장을 푸시로 보낸다.
 *
 * Cron(모든 사용자)과 테스트 버튼(본인)이 같은 함수를 쓴다. 그래야 테스트에서
 * 보이는 것이 아침에 올 것과 정확히 같다.
 */

export interface PushOutcome {
  sent: number
  /** 푸시 서비스가 "이 구독은 죽었다"(404/410) 고 해서 지운 수. */
  removed: number
  /** 보내지 않은 이유. 보냈으면 null. */
  reason: 'no-subs' | 'no-highlights' | null
  errors: string[]
}

/** VAPID 환경변수를 읽어 web-push 에 넣는다. 빠진 게 있으면 그 이름을 돌려준다. */
export function configureVapid(): string | null {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim()
  const missing = [
    !publicKey && 'VITE_VAPID_PUBLIC_KEY',
    !privateKey && 'VAPID_PRIVATE_KEY',
    !subject && 'VAPID_SUBJECT',
  ].filter((name): name is string => typeof name === 'string')
  if (missing.length > 0) return missing.join(', ')
  try {
    // 키 길이·subject 형식이 틀리면 여기서 던진다. 보내다 실패하는 것보다 낫다.
    webpush.setVapidDetails(subject as string, publicKey as string, privateKey as string)
  } catch (error) {
    return `VAPID 설정이 잘못됐습니다: ${error instanceof Error ? error.message : String(error)}`
  }
  return null
}

interface SubKeys {
  p256dh: string
  auth: string
}

function parseKeys(value: unknown): SubKeys | null {
  if (typeof value !== 'object' || value === null) return null
  const { p256dh, auth } = value as { p256dh?: unknown; auth?: unknown }
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null
  return { p256dh, auth }
}

/** 알림 본문은 짧아야 한다. 안드로이드는 대략 여섯 줄 뒤를 자른다. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export async function sendDailyTo(db: ServerClient, userId: string, dateKey: string): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, removed: 0, reason: null, errors: [] }

  const { data: subs, error } = await db
    .from('push_subs')
    .select('endpoint, keys')
    .eq('user_id', userId)
    .eq('enabled', true)
  if (error) throw new Error(error.message)
  if (subs.length === 0) {
    outcome.reason = 'no-subs'
    return outcome
  }

  const pick = await pickForUser(db, userId, dateKey)
  if (!pick) {
    outcome.reason = 'no-highlights'
    return outcome
  }

  const payload = JSON.stringify({
    title: pick.bookTitle ? `오늘의 문장 · ${clip(pick.bookTitle, 30)}` : '오늘의 문장',
    body: clip(pick.text, 200),
    url: '/',
    // 같은 태그면 알림이 쌓이지 않고 교체된다. 날짜를 넣어 하루 한 장으로 만든다.
    tag: `daily-${dateKey}`,
  })

  for (const sub of subs) {
    const keys = parseKeys(sub.keys)
    if (!keys) {
      // 형식이 깨진 행은 어차피 못 보내니 지운다.
      await db.from('push_subs').delete().eq('endpoint', sub.endpoint)
      outcome.removed++
      continue
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys },
        payload,
        // 폰이 꺼져 있으면 푸시 서비스가 이 시간까지 들고 있다가 전달한다. 저녁까지면 충분하다.
        { TTL: 12 * 60 * 60, urgency: 'normal', timeout: 10_000 }
      )
      outcome.sent++
    } catch (err) {
      const status = err instanceof webpush.WebPushError ? err.statusCode : 0
      if (status === 404 || status === 410) {
        // 사용자가 브라우저에서 알림을 껐거나 앱을 지웠다. 다시 보낼 방법이 없다.
        await db.from('push_subs').delete().eq('endpoint', sub.endpoint)
        outcome.removed++
      } else {
        const message = err instanceof Error ? err.message : String(err)
        outcome.errors.push(status ? `${String(status)}: ${clip(message, 120)}` : clip(message, 120))
      }
    }
  }
  return outcome
}
