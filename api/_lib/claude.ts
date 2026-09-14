import Anthropic from '@anthropic-ai/sdk'
import { EXTRACTION_PROMPT } from './prompt.ts'
import { ocrFailure } from './ocrTypes.ts'
import type { ExtractedParagraph, OcrResult } from './ocrTypes.ts'

/** 무료 Gemini 가 안 될 때의 대안. 비용은 장당 약 $0.015~0.037. */
const DEFAULT_MODEL = 'claude-sonnet-5'

const MAX_TOKENS = 8192

/**
 * 구조화 출력 스키마. 선택 필드를 쓸 수 없으므로 모든 속성이 required 여야 하고
 * additionalProperties 는 false 여야 한다.
 */
const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          uncertain: { type: 'boolean' },
        },
        required: ['text', 'uncertain'],
        additionalProperties: false,
      },
    },
  },
  required: ['paragraphs'],
  additionalProperties: false,
}

export async function extractWithClaude(
  imageBase64: string,
  mimeType: string,
  signal: AbortSignal
): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ocrFailure('not-configured')

  // 이미지 블록이 받는 MIME 은 네 가지뿐이다. 우리는 항상 JPEG 으로 인코딩한다.
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
    return ocrFailure('bad-request')
  }

  const model = process.env.CLAUDE_MODEL ?? DEFAULT_MODEL
  const client = new Anthropic({ apiKey })
  const startedAt = Date.now()

  let message
  try {
    message = await client.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        output_config: {
          // OCR 은 지각 작업이라 깊은 추론이 필요 없다. 기본값으로 두면
          // 생각 토큰이 비용과 지연을 지배한다.
          effort: 'low',
          format: { type: 'json_schema', schema: SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      },
      { signal }
    )
  } catch (error) {
    if (signal.aborted) return ocrFailure('timeout')
    if (error instanceof Anthropic.RateLimitError) return ocrFailure('quota-rate')
    return ocrFailure('upstream')
  }

  // stop_reason 은 예외로 오지 않는다. content 를 읽기 전에 확인해야 한다.
  if (message.stop_reason === 'refusal') return ocrFailure('blocked')
  if (message.stop_reason === 'max_tokens') return ocrFailure('truncated')

  const raw = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (raw === '') return ocrFailure('empty')

  let paragraphs: ExtractedParagraph[]
  try {
    const parsed: unknown = JSON.parse(raw)
    const list = (parsed as { paragraphs?: unknown }).paragraphs
    if (!Array.isArray(list)) return ocrFailure('empty')
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
    return ocrFailure('empty')
  }

  if (paragraphs.length === 0) return ocrFailure('empty')

  return {
    ok: true,
    paragraphs,
    provider: 'claude',
    model,
    usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
    elapsedMs: Date.now() - startedAt,
  }
}
