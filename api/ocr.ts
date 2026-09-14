import { extractWithGemini } from './_lib/gemini.ts'
import { extractWithClaude } from './_lib/claude.ts'
import { ocrFailure } from './_lib/ocrTypes.ts'
import type { OcrResult } from './_lib/ocrTypes.ts'

/**
 * Hobby 플랜의 상한이 60초다. 여유가 없으므로 클라이언트 쪽 abort 는 그보다 짧게 잡는다.
 * 배포가 이 값을 거부하면 30 으로 내리면 된다.
 */
export const maxDuration = 60

/** 함수 자체 타임아웃. maxDuration 보다 짧아야 우리 에러 메시지를 돌려줄 수 있다. */
const ABORT_MS = 45_000

/**
 * base64 길이 상한. Vercel 은 요청 본문을 4.5MB 로 자르고 413 을 주는데,
 * 그 응답은 우리 JSON 이 아니라 플랫폼 HTML 이라 폰에서는 원인을 알 수 없다.
 * 그 전에 우리가 막아서 한국어로 알려준다.
 */
const MAX_BASE64_CHARS = 4_000_000

interface OcrRequestBody {
  imageBase64?: unknown
  mimeType?: unknown
  /** 'gemini' | 'claude'. 없으면 서버 기본값. "다시 인식" 이 반대편을 지정한다. */
  provider?: unknown
}

function json(body: OcrResult, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/** 에러 종류에 맞는 HTTP 상태. 클라이언트는 본문의 code 로 판단하지만 상태도 맞춰 둔다. */
function statusFor(result: OcrResult): number {
  if (result.ok) return 200
  switch (result.code) {
    case 'bad-request':
      return 400
    case 'not-configured':
      return 500
    case 'quota-daily':
    case 'quota-rate':
      return 429
    case 'timeout':
      return 504
    default:
      return 200 // 모델이 읽지 못한 것은 서버 오류가 아니다. UI 가 본문으로 안내한다.
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: OcrRequestBody
  try {
    body = (await request.json()) as OcrRequestBody
  } catch {
    return json(ocrFailure('bad-request'), 400)
  }

  const { imageBase64, mimeType, provider } = body
  if (typeof imageBase64 !== 'string' || imageBase64 === '') {
    return json(ocrFailure('bad-request'), 400)
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    return json(ocrFailure('bad-request'), 413)
  }

  const type = typeof mimeType === 'string' && mimeType !== '' ? mimeType : 'image/jpeg'

  // 기본 공급자는 환경변수로 정한다. 요청이 지정하면 그쪽을 쓴다 —
  // "다시 인식" 버튼이 반대편 공급자로 한 번 더 시도할 수 있게 하기 위함이다.
  const configured = process.env.OCR_PROVIDER === 'claude' ? 'claude' : 'gemini'
  const chosen = provider === 'claude' || provider === 'gemini' ? provider : configured

  // abortSignal 은 클라이언트 쪽만 끊는다. 이미 시작된 요청은 그대로 과금되고
  // 무료 한도도 한 번 소모된다. 그래도 함수가 통째로 죽는 것보다는 낫다.
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, ABORT_MS)

  try {
    const result =
      chosen === 'claude'
        ? await extractWithClaude(imageBase64, type, controller.signal)
        : await extractWithGemini(imageBase64, type, controller.signal)
    return json(result, statusFor(result))
  } catch {
    // 공급자 모듈은 결과로 실패를 돌려주도록 되어 있지만, 예기치 못한 throw 도 막는다.
    return json(ocrFailure('upstream'), 200)
  } finally {
    clearTimeout(timer)
  }
}
