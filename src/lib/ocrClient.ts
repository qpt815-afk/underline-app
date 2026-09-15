import type { ExtractedParagraph } from './types.ts'
import { supabase } from './supabase.ts'

export type OcrProvider = 'gemini' | 'claude'

export interface OcrOk {
  ok: true
  paragraphs: ExtractedParagraph[]
  provider: OcrProvider
  model: string
  elapsedMs: number
}
export interface OcrFail {
  ok: false
  code: string
  message: string
  retryAfterSec?: number
  /** 공급자가 실제로 돌려준 오류 한 줄. 진단·에러 화면에 작게 보여준다. */
  detail?: string
}
export type OcrResponse = OcrOk | OcrFail

/** 서버 함수가 45초에 끊으므로 클라이언트는 그보다 조금 여유를 준다. */
const CLIENT_TIMEOUT_MS = 55_000

export async function requestOcr(
  imageBase64: string,
  provider?: OcrProvider
): Promise<OcrResponse> {
  // 서버가 세션을 검증하므로 토큰을 실어 보낸다. 없으면 서버가 401 을 준다.
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, CLIENT_TIMEOUT_MS)
  try {
    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg', provider }),
      signal: controller.signal,
    })

    // SPA 폴백이 /api 를 삼키면 JSON 대신 HTML 이 온다. 그대로 파싱하면
    // "Unexpected token <" 이 뜨는데 폰에서는 원인을 알 수 없다.
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        code: 'upstream',
        message: `서버가 JSON 이 아닌 응답을 보냈습니다 (${String(response.status)}).`,
      }
    }
    return (await response.json()) as OcrResponse
  } catch {
    if (controller.signal.aborted) {
      return { ok: false, code: 'timeout', message: '시간이 너무 오래 걸렸어요. 다시 시도해 주세요.' }
    }
    return {
      ok: false,
      code: 'offline',
      message: '네트워크에 연결할 수 없어요. 연결되면 다시 시도해 주세요.',
    }
  } finally {
    clearTimeout(timer)
  }
}
