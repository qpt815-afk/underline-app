/** OCR 함수가 클라이언트에 돌려주는 문단 하나. */
export interface ExtractedParagraph {
  text: string
  /** 모델이 흐릿해서 자신 없다고 표시한 문단. UI 에서 눈에 띄게 해 준다. */
  uncertain: boolean
}

export interface OcrSuccess {
  ok: true
  paragraphs: ExtractedParagraph[]
  provider: 'gemini' | 'claude'
  model: string
  /** 실제 사용량. 무료 한도를 얼마나 쓰는지 폰에서 확인할 수 있게 노출한다. */
  usage?: { input?: number; output?: number; thoughts?: number }
  elapsedMs: number
}

export type OcrErrorCode =
  | 'bad-request'
  | 'not-configured'
  | 'bad-key'
  | 'bad-model'
  | 'overloaded'
  | 'quota-daily'
  | 'quota-rate'
  | 'blocked'
  | 'recitation'
  | 'truncated'
  | 'empty'
  | 'upstream'
  | 'timeout'

export interface OcrFailure {
  ok: false
  code: OcrErrorCode
  /** 폰에 그대로 보여줄 한국어 한 줄. */
  message: string
  /** 재시도 가능 시각까지 남은 초. 알 수 있을 때만. */
  retryAfterSec?: number
  /**
   * 공급자가 실제로 돌려준 오류 한 줄 (HTTP 상태 + 메시지).
   * 진단 화면이 그대로 보여준다. 사진 내용이나 키는 절대 담지 않는다.
   */
  detail?: string
}

export type OcrResult = OcrSuccess | OcrFailure

export const OCR_ERROR_MESSAGE: Record<OcrErrorCode, string> = {
  'bad-request': '사진을 보내지 못했습니다.',
  'not-configured': 'OCR 키가 설정되지 않았습니다. 설정 화면의 안내를 확인하세요.',
  'bad-key': 'OCR 키가 잘못됐거나 권한이 없습니다. Vercel 의 GEMINI_API_KEY 값을 다시 확인하세요.',
  'bad-model': '설정된 OCR 모델을 찾을 수 없습니다. Vercel 의 GEMINI_MODEL 값을 확인하세요.',
  overloaded: '문장 추출 서버가 지금 붐빕니다. 잠시 뒤 다시 시도해 주세요.',
  'quota-daily': '오늘 무료 한도를 다 썼어요. 내일 다시 시도하거나 설정에서 공급자를 바꿔보세요.',
  'quota-rate': '요청이 너무 빠릅니다. 잠시 뒤 다시 시도해 주세요.',
  blocked: '이 사진은 처리할 수 없었어요. 다른 페이지를 찍어보세요.',
  // 저작물을 그대로 옮기는 것을 모델이 거부한 경우. 사용자 잘못이 아니므로 그렇게 말한다.
  recitation: '이 페이지는 그대로 옮길 수 없었어요. 다른 페이지이거나 일부만 찍어보면 될 수 있어요.',
  truncated: '글이 너무 많아 일부만 읽었어요. 한 페이지씩 찍어보세요.',
  empty: '글자를 찾지 못했어요. 조금 더 밝은 곳에서 또렷하게 찍어보세요.',
  upstream: '문장 추출 서버에 문제가 있었어요. 잠시 뒤 다시 시도해 주세요.',
  timeout: '시간이 너무 오래 걸렸어요. 다시 시도해 주세요.',
}

export function ocrFailure(code: OcrErrorCode, retryAfterSec?: number, detail?: string): OcrFailure {
  return {
    ok: false,
    code,
    message: OCR_ERROR_MESSAGE[code],
    ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
    ...(detail !== undefined && detail !== '' ? { detail } : {}),
  }
}
