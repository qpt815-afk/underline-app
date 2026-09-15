import { supabase } from './supabase.ts'

/**
 * 아침 8시 "오늘의 문장" 푸시 구독.
 *
 * 구독 자체는 브라우저(푸시 서비스)가 만들고, 우리는 그 주소와 키를 push_subs 에
 * 저장해 둔다. 서버 함수가 아침에 그 행을 읽어 web-push 로 보낸다.
 * 시각은 08:00 KST 고정이다 — Hobby 플랜의 Cron 이 하루 한 번뿐이라 사용자별
 * 시각을 받을 수 없다. 그래서 켜기/끄기만 있다.
 */

export type PushStatus =
  | 'unsupported'
  /** 서버에 공개키가 없어 구독을 만들 수 없다. 환경변수 문제. */
  | 'no-key'
  /** 사용자가 알림을 차단했다. 앱 안에서는 되돌릴 수 없다. */
  | 'denied'
  | 'on'
  | 'off'

const PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || null

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * serviceWorker.ready 는 워커가 등록된 적이 없으면 영원히 기다린다.
 * (개발 서버, 또는 등록이 실패한 경우.) 그래서 시간을 건다.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error('서비스워커가 아직 준비되지 않았어요. 앱을 새로고침한 뒤 다시 해보세요.')) }, 8_000)
  })
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (!PUBLIC_KEY) return 'no-key'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const sub = await (await registration()).pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** 알림을 켠다. 권한을 묻고, 구독을 만들고, 서버에 저장한다. 실패는 한국어 Error 로 던진다. */
export async function enablePush(userId: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (!PUBLIC_KEY) return 'no-key'

  // 권한은 사용자 제스처 안에서 물어야 한다. 이 함수는 버튼 onClick 에서만 부른다.
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'

  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // 크롬은 이게 true 가 아니면 구독을 거부한다. 조용한 푸시는 허용되지 않는다.
      userVisibleOnly: true,
      // base64url 문자열을 그대로 받는다. 직접 Uint8Array 로 바꿀 필요 없다.
      applicationServerKey: PUBLIC_KEY,
    }))

  const json = sub.toJSON()
  const keys = json.keys
  if (!keys?.p256dh || !keys.auth) {
    await sub.unsubscribe().catch(() => undefined)
    throw new Error('브라우저가 구독 키를 주지 않았어요. 다시 시도해 주세요.')
  }

  const { error } = await supabase
    .from('push_subs')
    .upsert(
      { endpoint: sub.endpoint, user_id: userId, keys: { p256dh: keys.p256dh, auth: keys.auth }, enabled: true },
      { onConflict: 'endpoint' }
    )
  if (error) {
    // 서버에 없으면 아침에 아무것도 안 온다. 반쯤 켜진 상태를 남기지 않는다.
    await sub.unsubscribe().catch(() => undefined)
    throw new Error(`서버에 저장하지 못했어요: ${error.message}`)
  }
  return 'on'
}

/** 알림을 끈다. 서버 행을 먼저 지우고 브라우저 구독을 푼다. */
export async function disablePush(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return 'off'
  const { error } = await supabase.from('push_subs').delete().eq('endpoint', sub.endpoint)
  if (error) throw new Error(`서버에서 지우지 못했어요: ${error.message}`)
  await sub.unsubscribe().catch(() => undefined)
  return 'off'
}

export interface TestPushResult {
  ok: boolean
  message: string
}

/** 서버에 "지금 나한테 오늘의 문장을 보내라" 고 한다. 아침 Cron 과 같은 경로다. */
export async function sendTestPush(): Promise<TestPushResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, message: '로그인이 필요해요.' }
  try {
    const response = await fetch('/api/push', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return { ok: false, message: `서버가 JSON 이 아닌 응답을 보냈어요 (${String(response.status)}).` }
    }
    const body = (await response.json()) as Partial<TestPushResult>
    return { ok: body.ok === true, message: body.message ?? '응답을 이해하지 못했어요.' }
  } catch {
    return { ok: false, message: '서버에 닿지 못했어요. 연결을 확인해 주세요.' }
  }
}
