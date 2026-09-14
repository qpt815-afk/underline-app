import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'

/**
 * AuthError.code 의 타입은 `ErrorCode | (string & {}) | undefined` 라서
 * switch 의 case 문자열을 컴파일러가 검사해 주지 않는다. 오타를 내면 조용히
 * default 로 떨어진다. ErrorCode 타입 자체도 export 되지 않는다.
 * 그래서 키를 못박은 객체로 검사를 되살린다.
 */
const MESSAGES = {
  // 400 · 내장 SMTP 는 Supabase 조직 팀에 등록된 주소로만 보낸다
  email_address_not_authorized:
    '이 주소로는 메일을 보낼 수 없습니다. Supabase 조직 팀에 등록된 주소인지 확인하세요.',
  email_address_invalid: '메일 주소 형식이 올바르지 않습니다.',
  // 403 · 코드가 틀렸는지 만료됐는지 서버가 구분해 주지 않는다
  otp_expired: '코드가 틀렸거나 만료됐습니다. 새 코드를 받아 주세요.',
  otp_disabled: '등록되지 않은 주소입니다.',
  email_provider_disabled: '메일 로그인이 꺼져 있습니다.',
  over_request_rate_limit: '요청이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.',
  validation_failed: '입력값을 확인해 주세요.',
} as const

type KnownCode = keyof typeof MESSAGES

function isKnownCode(code: string | undefined): code is KnownCode {
  return code !== undefined && Object.prototype.hasOwnProperty.call(MESSAGES, code)
}

/** signInWithOtp / verifyOtp 의 에러를 한국어 한 줄로 바꾼다. */
export function authErrorToKorean(error: unknown): string {
  if (isAuthRetryableFetchError(error)) {
    return '네트워크에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.'
  }
  if (!isAuthApiError(error)) {
    return '알 수 없는 오류가 발생했습니다.'
  }

  const code: string | undefined = error.code

  // 60초 재발송 쿨다운과 시간당 발송 한도가 같은 코드로 온다.
  // 메시지에서 남은 초를 뽑아 알려주면 사용자가 기다릴지 판단할 수 있다.
  if (code === 'over_email_send_rate_limit') {
    const seconds = /after (\d+) seconds/.exec(error.message)?.[1]
    if (seconds) return `${seconds}초 뒤에 다시 요청할 수 있습니다.`
    return '메일 발송 한도를 넘었습니다. 한 시간 뒤에 다시 시도하거나, 커스텀 SMTP 를 설정하세요.'
  }

  if (!isKnownCode(code)) {
    return `로그인에 실패했습니다 (${code ?? String(error.status ?? 'unknown')}).`
  }
  return MESSAGES[code]
}
