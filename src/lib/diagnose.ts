import { supabase, SUPABASE_CONFIG_ERROR } from './supabase.ts'
import { requestOcr } from './ocrClient.ts'
import { isStandalone } from './pwa.ts'

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip'

export interface CheckResult {
  status: CheckStatus
  /** 무슨 일이 일어났는지 한 줄. */
  detail: string
  /** 실패했을 때 무엇을 해야 하는지. */
  fix?: string
}

export interface Check {
  id: string
  label: string
  run: () => Promise<CheckResult>
  /**
   * 이 시간을 넘기면 실패로 처리한다.
   * supabase-js 는 주소가 응답하지 않으면 자체 타임아웃 없이 매달려 있어서,
   * 그대로 두면 뒤의 검사가 영영 시작되지 않는다.
   */
  timeoutMs?: number
}

/** 검사 하나를 제한 시간 안에 끝낸다. */
export async function runWithTimeout(check: Check): Promise<CheckResult> {
  const limit = check.timeoutMs ?? 10_000
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(
      () =>
        { resolve({
          status: 'fail',
          detail: `${String(Math.round(limit / 1000))}초 안에 응답이 없습니다.`,
          fix: '주소가 맞는지, 네트워크가 연결돼 있는지 확인하세요. Supabase 무료 플랜은 일주일 쉬면 프로젝트가 일시정지됩니다.',
        }) },
      limit
    )
  })
  try {
    return await Promise.race([check.run(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** 환경변수가 클라이언트 번들에 박혔는지. */
const envCheck: Check = {
  id: 'env',
  label: '환경변수',
  run: () => {
    if (SUPABASE_CONFIG_ERROR) {
      return Promise.resolve({
        status: 'fail' as const,
        detail: SUPABASE_CONFIG_ERROR,
        fix: 'Vercel > Settings > Environment Variables 에 넣고 재배포하세요. VITE_ 변수는 빌드 때 박히므로 재배포해야 반영됩니다.',
      })
    }
    return Promise.resolve({ status: 'pass' as const, detail: 'Supabase 주소와 키가 들어 있습니다.' })
  },
}

/** 서버리스 함수가 SPA 폴백에 삼켜지지 않았는지. */
const apiCheck: Check = {
  id: 'api',
  label: '서버 함수',
  run: async () => {
    try {
      const response = await fetch('/api/health')
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        return {
          status: 'fail',
          detail: `JSON 이 아닌 ${contentType || '알 수 없는'} 응답 (HTTP ${String(response.status)})`,
          fix: 'vercel.json 의 rewrites 가 /api 를 삼키고 있습니다. source 가 /((?!api(?:/|$)).*) 인지 확인하세요.',
        }
      }
      const body = (await response.json()) as { ok?: boolean }
      return body.ok === true
        ? { status: 'pass', detail: '정상 응답' }
        : { status: 'fail', detail: JSON.stringify(body) }
    } catch (error) {
      return {
        status: 'fail',
        detail: error instanceof Error ? error.message : '요청 실패',
        fix: '네트워크 연결을 확인하세요.',
      }
    }
  },
}

const authCheck: Check = {
  id: 'auth',
  label: '로그인',
  run: async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) return { status: 'fail', detail: error.message }
    const session = data.session
    if (!session) {
      return { status: 'fail', detail: '로그인되어 있지 않습니다.', fix: '로그인 후 다시 실행하세요.' }
    }
    const expiresAt = session.expires_at
    const remainMin = expiresAt ? Math.round((expiresAt * 1000 - Date.now()) / 60000) : null
    return {
      status: 'pass',
      detail: `${session.user.email ?? '알 수 없음'}${remainMin !== null ? ` · 토큰 ${String(remainMin)}분 남음` : ''}`,
    }
  },
}

/** RLS 정책이 자기 행을 읽게 해 주는지. */
const dbCheck: Check = {
  id: 'db',
  label: '데이터베이스',
  run: async () => {
    const { count, error } = await supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
    if (error) {
      return {
        status: 'fail',
        detail: error.message,
        fix: 'supabase/migrations/0001_init.sql 을 SQL Editor 에서 실행했는지 확인하세요.',
      }
    }
    return { status: 'pass', detail: `책 ${String(count ?? 0)}권을 읽을 수 있습니다.` }
  },
}

/** Storage 정책이 <user_id>/ 경로 쓰기를 허용하는지. 실제로 올렸다 지운다. */
const storageCheck: Check = {
  id: 'storage',
  label: '사진 저장소',
  run: async () => {
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (!userId) return { status: 'skip', detail: '로그인이 필요합니다.' }

    const path = `${userId}/__diagnose-${String(Date.now())}.jpg`
    const probe = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })

    const { error: uploadError } = await supabase.storage
      .from('page-photos')
      .upload(path, probe, { contentType: 'image/jpeg' })
    if (uploadError) {
      return {
        status: 'fail',
        detail: uploadError.message,
        fix: 'supabase/migrations/0002_storage.sql 을 실행했는지, page-photos 버킷이 있는지 확인하세요.',
      }
    }

    const { error: signError } = await supabase.storage.from('page-photos').createSignedUrl(path, 60)
    // 흔적을 남기지 않는다.
    await supabase.storage.from('page-photos').remove([path])

    if (signError) {
      return { status: 'warn', detail: `업로드는 되지만 읽기 URL 생성 실패: ${signError.message}` }
    }
    return { status: 'pass', detail: '업로드와 읽기 모두 정상입니다.' }
  },
}

/** 코드별로 폰에서 할 수 있는 조치 한 줄. */
const OCR_FIX: Record<string, string> = {
  'not-configured': 'Vercel > Settings > Environment Variables 에 GEMINI_API_KEY 를 넣고 재배포하세요.',
  'bad-key': 'GEMINI_API_KEY 값이 틀렸습니다. aistudio.google.com 에서 키를 다시 복사해 Vercel 에 넣고 재배포하세요.',
  'bad-model': 'GEMINI_MODEL 값의 모델이 없습니다. Vercel 에서 그 값을 지우거나(기본값 사용) 다른 모델 ID 로 바꾸고 재배포하세요.',
  overloaded: '구글 쪽이 붐비는 상태입니다. 몇 분 뒤 "다시 검사"를 눌러보세요. 대체 모델도 함께 시도했습니다.',
  'quota-daily': '오늘 무료 한도를 다 썼습니다. 한도는 미국 태평양 자정(한국 오후 4~5시경)에 초기화됩니다.',
  'quota-rate': '요청이 너무 잦습니다. 1분쯤 뒤에 다시 검사하세요.',
  upstream: '위 상세 메시지가 원인입니다. Vercel > 프로젝트 > Logs 에서 [ocr] 로 시작하는 줄에도 같은 내용이 남습니다.',
  timeout: '응답이 너무 늦었습니다. 네트워크를 확인하고 다시 검사하세요.',
}

/**
 * OCR 전체 경로. 이 앱에서 가장 깨지기 쉬운 곳이다 —
 * 모델 ID 는 타입 검사가 안 되고, 무료 한도와 키 설정도 여기서만 드러난다.
 * 합성 이미지를 만들어 실제로 한 번 돌린다.
 */
const ocrCheck: Check = {
  id: 'ocr',
  label: '문장 추출 (OCR)',
  // 모델 호출은 정상적으로도 수십 초가 걸릴 수 있다.
  timeoutMs: 70_000,
  run: async () => {
    const canvas = new OffscreenCanvas(1200, 600)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { status: 'skip', detail: '캔버스를 만들 수 없습니다.' }

    const EXPECTED = '오래 바라보면 아름다워진다.'
    ctx.fillStyle = '#f6f1e6'
    ctx.fillRect(0, 0, 1200, 600)
    ctx.fillStyle = '#1a1a1a'
    ctx.font = '48px serif'
    ctx.fillText(EXPECTED, 90, 300)

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }

    const started = Date.now()
    const result = await requestOcr(btoa(binary))
    const elapsed = Date.now() - started

    if (!result.ok) {
      return {
        status: 'fail',
        detail: `${result.message} (${result.code})${result.detail ? ` — ${result.detail}` : ''}`,
        fix: OCR_FIX[result.code],
      }
    }

    const got = result.paragraphs.map((p) => p.text).join(' ')
    const matched = got.replace(/\s/g, '').includes(EXPECTED.replace(/\s/g, '').slice(0, 8))
    return {
      status: matched ? 'pass' : 'warn',
      detail: matched
        ? `${result.model} · ${String(elapsed)}ms · "${got}"`
        : `읽긴 했지만 예상과 다릅니다 — "${got}" (${result.model})`,
    }
  },
}

const pwaCheck: Check = {
  id: 'pwa',
  label: '앱 설치 · 오프라인',
  run: async () => {
    const parts: string[] = [isStandalone() ? '설치된 앱으로 실행 중' : '브라우저 탭에서 실행 중']
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      parts.push(registration ? '서비스워커 등록됨' : '서비스워커 없음')
      const keys = await caches.keys()
      parts.push(`캐시 ${String(keys.length)}개`)
      return {
        status: registration ? 'pass' : 'warn',
        detail: parts.join(' · '),
        fix: registration ? undefined : '앱을 완전히 닫았다가 다시 열어보세요.',
      }
    } catch {
      return { status: 'warn', detail: parts.join(' · ') }
    }
  },
}

export const CHECKS: Check[] = [
  envCheck,
  apiCheck,
  authCheck,
  dbCheck,
  storageCheck,
  ocrCheck,
  pwaCheck,
]
