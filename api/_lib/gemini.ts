import { GoogleGenAI, Type, ThinkingLevel, ApiError, FinishReason } from '@google/genai'
import type { Schema } from '@google/genai'
import { EXTRACTION_PROMPT } from './prompt.js'
import { ocrFailure } from './ocrTypes.js'
import type { ExtractedParagraph, OcrErrorCode, OcrResult } from './ocrTypes.js'

/**
 * 기본 모델. 환경변수로 바꿀 수 있게 해 둔 이유:
 * 모델 ID 는 타입으로 검사되지 않고(GenerateContentParameters.model 은 그냥 string),
 * 새 모델이 무료 티어에서 막혀 있을 수도 있다. 그럴 때 재빌드 없이
 * Vercel 대시보드에서 gemini-3.1-flash-lite 등으로 바꿀 수 있어야 한다.
 */
const DEFAULT_MODEL = 'gemini-3.8-flash'

/**
 * 기본 모델이 bad-model / overloaded / upstream 으로 실패했을 때 한 번 더 시도할 모델.
 * 키 문제·한도·타임아웃은 모델을 바꿔도 소용없으므로 재시도하지 않는다.
 */
const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite'

/** 환경변수는 공백을 다듬고, 비어 있으면 기본값을 쓴다. 대시보드에서 빈 값을 저장하는 일이 잦다. */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/** 응답이 JSON 중간에 잘리면 파싱이 실패한다. 한글은 토큰을 많이 먹으므로 넉넉히. */
const MAX_OUTPUT_TOKENS = 8192

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    paragraphs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          uncertain: { type: Type.BOOLEAN },
        },
        required: ['text', 'uncertain'],
        // 모델이 본문을 먼저 쓰고 확신 여부를 나중에 판단하도록 순서를 지정한다.
        propertyOrdering: ['text', 'uncertain'],
      },
    },
  },
  required: ['paragraphs'],
}

/**
 * 생각(thinking) 설정은 모델 세대마다 노브가 다르다.
 * Gemini 3 계열은 thinkingLevel, 그 이전은 thinkingBudget 을 받는다.
 * 모델을 환경변수로 바꿀 수 있게 해 놨으므로 여기도 모델을 따라가야 한다.
 * 안 그러면 2.5 로 내렸을 때 429 가 400 으로 바뀐다.
 */
function thinkingConfigFor(model: string) {
  if (/^gemini-3/.test(model)) {
    // OCR 은 지각 작업이라 깊은 추론이 필요 없다. 기본값으로 두면 생각 토큰이
    // 비용과 지연을 지배하고 출력 한도까지 갉아먹는다.
    // flash-lite 만 MINIMAL 을 받는다. 3.8 Flash 는 MINIMAL 을 거부한다.
    return { thinkingLevel: /flash-lite/.test(model) ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW }
  }
  if (/^gemini-2\.5/.test(model)) {
    return { thinkingBudget: 0 }
  }
  return undefined
}

interface ParsedApiError {
  status?: string
  message?: string
  /** google.rpc.ErrorInfo.reason — 예: API_KEY_INVALID */
  reason?: string
  retryAfterSec?: number
  isDailyQuota: boolean
}

/**
 * ApiError 는 { name, message, status } 뿐이고 message 는 구글이 준 에러 JSON 을
 * 통째로 문자열화한 것이다. code/details 를 보려면 직접 파싱해야 한다.
 */
function parseApiError(error: ApiError): ParsedApiError {
  const out: ParsedApiError = { isDailyQuota: false }
  try {
    const body: unknown = JSON.parse(error.message)
    const err = (body as { error?: Record<string, unknown> }).error
    if (!err) return out
    if (typeof err.status === 'string') out.status = err.status
    if (typeof err.message === 'string') out.message = err.message

    const details = Array.isArray(err.details) ? err.details : []
    for (const detail of details) {
      const d = detail as Record<string, unknown>
      const atType = typeof d['@type'] === 'string' ? d['@type'] : ''
      if (atType.includes('ErrorInfo') && typeof d.reason === 'string') {
        out.reason = d.reason
      }
      if (atType.includes('RetryInfo') && typeof d.retryDelay === 'string') {
        const seconds = /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay)?.[1]
        if (seconds) out.retryAfterSec = Math.ceil(Number(seconds))
      }
      if (atType.includes('QuotaFailure')) {
        const violations = Array.isArray(d.violations) ? d.violations : []
        for (const violation of violations) {
          const quotaId = (violation as { quotaId?: unknown }).quotaId
          // PerDay 접미사가 붙으면 분당 제한이 아니라 하루 한도가 끝난 것이다.
          if (typeof quotaId === 'string' && /PerDay/i.test(quotaId)) out.isDailyQuota = true
        }
      }
    }
  } catch {
    // message 가 JSON 이 아닐 수도 있다. 그러면 상태 코드만으로 판단한다.
  }
  return out
}

/** 공백을 다듬고 길이를 제한한다. 키처럼 생긴 문자열은 지운다. */
function compact(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

interface Classified {
  code: OcrErrorCode
  detail: string
  retryAfterSec?: number
}

/**
 * 공급자 오류를 우리 코드로 옮긴다.
 * 폰에서는 "키가 틀렸다" 와 "구글이 붐빈다" 를 구분할 수 있어야 다음 행동이 정해진다.
 */
export function classifyError(model: string, error: unknown): Classified {
  if (error instanceof ApiError) {
    const parsed = parseApiError(error)
    const detail = compact(
      `${model} → HTTP ${String(error.status)} ${parsed.status ?? ''}: ${parsed.message ?? error.message}`
    )
    if (error.status === 429 || parsed.status === 'RESOURCE_EXHAUSTED') {
      return { code: parsed.isDailyQuota ? 'quota-daily' : 'quota-rate', detail, retryAfterSec: parsed.retryAfterSec }
    }
    // 틀린 키는 400 INVALID_ARGUMENT 로 온다. 상태 코드만으로는 못 가르므로 reason 을 본다.
    if (
      error.status === 401 ||
      error.status === 403 ||
      parsed.reason === 'API_KEY_INVALID' ||
      /api key/i.test(parsed.message ?? '')
    ) {
      return { code: 'bad-key', detail }
    }
    if (error.status === 404) return { code: 'bad-model', detail }
    if (error.status >= 500) return { code: 'overloaded', detail, retryAfterSec: parsed.retryAfterSec }
    return { code: 'upstream', detail }
  }
  const e = error as { name?: unknown; message?: unknown } | null
  const name = typeof e?.name === 'string' ? e.name : 'Error'
  const message = typeof e?.message === 'string' ? e.message : String(error)
  return { code: 'upstream', detail: compact(`${model} → ${name}: ${message}`) }
}

/** 실패를 결과로 만들면서 Vercel Logs 에도 같은 줄을 남긴다. */
function fail(model: string, code: OcrErrorCode, detail: string, retryAfterSec?: number) {
  console.error(`[ocr] gemini ${model} failed (${code}): ${detail}`)
  return ocrFailure(code, retryAfterSec, detail)
}

/** 대체 모델로 다시 시도할 가치가 있는 실패인지. */
function isRetryableWithOtherModel(code: OcrErrorCode): boolean {
  return code === 'bad-model' || code === 'overloaded' || code === 'upstream'
}

export async function extractWithGemini(
  imageBase64: string,
  mimeType: string,
  signal: AbortSignal
): Promise<OcrResult> {
  const apiKey = env('GEMINI_API_KEY')
  if (!apiKey) return ocrFailure('not-configured')

  const model = env('GEMINI_MODEL') ?? DEFAULT_MODEL
  const fallbackModel = env('GEMINI_FALLBACK_MODEL') ?? DEFAULT_FALLBACK_MODEL
  // 키가 없어도 생성자는 throw 하지 않고 경고만 찍으므로 위에서 직접 확인했다.
  const ai = new GoogleGenAI({ apiKey })

  const primary = await callModel(ai, model, imageBase64, mimeType, signal)
  if (primary.ok) return primary
  if (signal.aborted) return primary
  if (!isRetryableWithOtherModel(primary.code) || fallbackModel === model) return primary

  console.error(`[ocr] gemini ${model} failed (${primary.code}); retrying with ${fallbackModel}`)
  const second = await callModel(ai, fallbackModel, imageBase64, mimeType, signal)
  if (second.ok) return second

  // 둘 다 실패하면 첫 실패를 앞세우고 대체 시도 내용을 덧붙인다.
  return {
    ...primary,
    detail: compact(`${primary.detail ?? primary.code} | 대체 시도 ${second.detail ?? second.code}`),
  }
}

async function callModel(
  ai: GoogleGenAI,
  model: string,
  imageBase64: string,
  mimeType: string,
  signal: AbortSignal
): Promise<OcrResult> {
  const startedAt = Date.now()

  let response
  try {
    response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: thinkingConfigFor(model),
        abortSignal: signal,
      },
    })
  } catch (error) {
    if (signal.aborted) return fail(model, 'timeout', `${model} → 제한 시간 초과`)
    const c = classifyError(model, error)
    return fail(model, c.code, c.detail, c.retryAfterSec)
  }

  // 프롬프트 단계에서 막히면 후보 자체가 없다.
  const blockReason = response.promptFeedback?.blockReason
  if (blockReason) {
    return fail(model, 'blocked', `${model} → blockReason=${String(blockReason)}`)
  }

  const candidate = response.candidates?.[0]
  const finishReason = candidate?.finishReason

  // RECITATION 은 이 앱에서 실제로 일어날 수 있다 — 출판된 책을 그대로 옮기는 중이다.
  // 사용자 잘못이 아니므로 '차단됨'과 구분해서 알려준다.
  const reasonDetail = `${model} → finishReason=${String(finishReason)}`
  if (finishReason === FinishReason.RECITATION) return fail(model, 'recitation', reasonDetail)
  if (
    finishReason === FinishReason.SAFETY ||
    finishReason === FinishReason.PROHIBITED_CONTENT ||
    finishReason === FinishReason.SPII
  ) {
    return fail(model, 'blocked', reasonDetail)
  }
  // MAX_TOKENS 면 JSON 이 중간에 끊겨 파싱이 실패한다. 파싱하기 전에 거른다.
  if (finishReason === FinishReason.MAX_TOKENS) return fail(model, 'truncated', reasonDetail)

  // text 는 게터다(메서드가 아니다). 여러 text 파트를 이어 붙여 준다 —
  // 직접 parts.find() 로 꺼내면 긴 응답에서 첫 조각만 얻고 JSON 이 깨진다.
  const raw = response.text
  if (!raw) return fail(model, 'empty', `${model} → 응답에 텍스트 없음 (finishReason=${String(finishReason)})`)

  let paragraphs: ExtractedParagraph[]
  try {
    const parsed: unknown = JSON.parse(raw)
    const list = (parsed as { paragraphs?: unknown }).paragraphs
    if (!Array.isArray(list)) return fail(model, 'empty', `${model} → paragraphs 배열 없음`)
    paragraphs = list
      .map((item): ExtractedParagraph | null => {
        const p = item as { text?: unknown; uncertain?: unknown }
        if (typeof p.text !== 'string') return null
        const text = p.text.trim()
        if (text === '') return null
        return { text, uncertain: p.uncertain === true }
      })
      .filter((p): p is ExtractedParagraph => p !== null)
  } catch {
    // 모델 출력은 사진 속 본문일 수 있으므로 내용은 싣지 않고 길이만 남긴다.
    return fail(model, 'empty', `${model} → JSON 파싱 실패 (${String(raw.length)}자)`)
  }

  if (paragraphs.length === 0) return fail(model, 'empty', `${model} → 문단 0개`)

  const usage = response.usageMetadata
  return {
    ok: true,
    paragraphs,
    provider: 'gemini',
    model,
    usage: {
      input: usage?.promptTokenCount,
      output: usage?.candidatesTokenCount,
      thoughts: usage?.thoughtsTokenCount,
    },
    elapsedMs: Date.now() - startedAt,
  }
}
