import { timingSafeEqual } from 'node:crypto'
import { verifyBearer } from './_lib/auth.js'
import { clientAsAdmin, clientAsUser } from './_lib/supabaseServer.js'
import { configureVapid, sendDailyTo } from './_lib/push.js'
import { seoulDateKey } from './_lib/dailyPick.js'
import type { PushOutcome } from './_lib/push.js'

/** 사용자가 많아져도 60초 안에는 끝나야 한다. Hobby 상한이다. */
export const maxDuration = 60

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function bearerMatches(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? ''
  const given = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * GET — Vercel Cron 이 매일 UTC 23:00(한국 08:00)에 부른다. vercel.json 의 crons 참고.
 *
 * Vercel 은 CRON_SECRET 환경변수가 있으면 `Authorization: Bearer <CRON_SECRET>` 을
 * 붙여 호출한다. 그걸로 외부에서 아무나 알림을 쏘는 것을 막는다.
 * 모든 사용자를 돌아야 하므로 RLS 를 건너뛰는 secret key 클라이언트를 쓴다.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return json({ ok: false, error: 'CRON_SECRET 환경변수가 없습니다.' }, 500)
  if (!bearerMatches(request, secret)) return json({ ok: false, error: 'unauthorized' }, 401)

  const vapidError = configureVapid()
  if (vapidError) return json({ ok: false, error: vapidError }, 500)

  const db = clientAsAdmin()
  if (!db) return json({ ok: false, error: 'SUPABASE_SECRET_KEY 환경변수가 없습니다.' }, 500)

  const { data: rows, error } = await db.from('push_subs').select('user_id').eq('enabled', true)
  if (error) return json({ ok: false, error: error.message }, 500)
  const userIds = [...new Set(rows.map((row) => row.user_id))]

  const dateKey = seoulDateKey()
  const summary = { ok: true, date: dateKey, users: userIds.length, sent: 0, removed: 0, errors: [] as string[] }
  for (const userId of userIds) {
    try {
      const outcome = await sendDailyTo(db, userId, dateKey)
      summary.sent += outcome.sent
      summary.removed += outcome.removed
      summary.errors.push(...outcome.errors)
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  // Vercel 로그에서 아침마다 한 줄로 확인할 수 있게.
  console.log(`[push] ${dateKey} users=${String(summary.users)} sent=${String(summary.sent)} removed=${String(summary.removed)} errors=${String(summary.errors.length)}`)
  return json(summary, 200)
}

interface TestResponse extends PushOutcome {
  ok: boolean
  message: string
}

/**
 * POST — 설정 화면의 "지금 테스트 알림". 로그인한 본인에게만, 본인 권한(RLS)으로 보낸다.
 * 아침 Cron 과 같은 함수를 타므로 여기서 오면 아침에도 온다.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await verifyBearer(request)
  if (!auth) return json({ ok: false, message: '로그인이 필요합니다.' }, 401)

  const vapidError = configureVapid()
  if (vapidError) {
    return json({ ok: false, message: `서버에 알림 키가 없습니다: ${vapidError}. Vercel 환경변수를 확인하세요.` }, 500)
  }

  const db = clientAsUser(auth.token)
  if (!db) return json({ ok: false, message: 'Supabase 환경변수가 없습니다.' }, 500)

  try {
    const outcome = await sendDailyTo(db, auth.userId, seoulDateKey())
    const body: TestResponse = {
      ...outcome,
      ok: outcome.sent > 0,
      message:
        outcome.sent > 0
          ? `${String(outcome.sent)}개 기기로 보냈어요. 몇 초 안에 알림이 와야 해요.`
          : outcome.reason === 'no-subs'
            ? '알림이 켜진 기기가 없어요. 위에서 먼저 켜 주세요.'
            : outcome.reason === 'no-highlights'
              ? '보낼 문장이 아직 없어요. 문장을 하나 찍어 두면 보낼 수 있어요.'
              : `보내지 못했어요: ${outcome.errors.join(' | ') || '알 수 없는 오류'}`,
    }
    return json(body, 200)
  } catch (err) {
    return json({ ok: false, message: err instanceof Error ? err.message : '보내지 못했어요.' }, 500)
  }
}
