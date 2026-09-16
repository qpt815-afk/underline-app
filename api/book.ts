import { verifyBearer } from './_lib/auth.js'
import { fetchCover, lookupIsbn } from './_lib/bookLookup.js'
import type { LookupFailCode } from './_lib/bookLookup.js'

/**
 * GET /api/book?isbn=9788936434267
 *
 * 바코드로 읽은 ISBN 으로 제목·저자·출판사·표지를 찾는다. 로그인이 필요하다 —
 * 카카오 키의 하루 한도를 아무나 쓰게 둘 수 없다.
 */
export const maxDuration = 30

const MESSAGE: Record<LookupFailCode | 'bad-request' | 'unauthorized' | 'timeout', string> = {
  'bad-request': 'ISBN 이 올바르지 않아요. 978 또는 979 로 시작하는 13자리 숫자여야 해요.',
  unauthorized: '로그인이 필요합니다.',
  'not-found': '이 ISBN 으로 등록된 책을 찾지 못했어요. 제목을 직접 입력해 주세요.',
  'not-configured': '책 검색 키가 설정되지 않았어요.',
  upstream: '책 정보 서비스에 문제가 있어요. 잠시 뒤 다시 시도하거나 제목을 직접 입력해 주세요.',
  timeout: '책 정보를 가져오는 데 시간이 너무 걸려요. 다시 시도해 주세요.',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function fail(code: keyof typeof MESSAGE, status: number, detail?: string): Response {
  return json({ ok: false, code, message: MESSAGE[code], detail }, status)
}

export async function GET(request: Request): Promise<Response> {
  const auth = await verifyBearer(request)
  if (!auth) return fail('unauthorized', 401)

  const isbn = new URL(request.url).searchParams.get('isbn')?.replace(/[^0-9]/g, '') ?? ''
  if (!/^97[89]\d{10}$/.test(isbn)) return fail('bad-request', 400)

  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 20_000)
  try {
    const result = await lookupIsbn(isbn, controller.signal)
    if (!result.ok) {
      const status = result.code === 'not-found' ? 404 : result.code === 'not-configured' ? 500 : 502
      if (result.detail) console.warn(`[book] ${isbn} ${result.code}: ${result.detail}`)
      return fail(result.code, status, result.detail)
    }
    const cover = result.book.thumbnailUrl ? await fetchCover(result.book.thumbnailUrl, controller.signal) : null
    return json({ ok: true, book: { ...result.book, cover } }, 200)
  } catch (error) {
    if (controller.signal.aborted) return fail('timeout', 504)
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[book] ${isbn} threw: ${detail}`)
    return fail('upstream', 502, detail)
  } finally {
    clearTimeout(timer)
  }
}
