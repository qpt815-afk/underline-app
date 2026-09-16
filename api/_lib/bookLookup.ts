/**
 * ISBN 으로 책 정보를 찾는다.
 *
 * 한국 책은 카카오 책 검색이 가장 잘 찾는다(REST API 키 필요, 무료).
 * 키가 없거나 카카오가 못 찾으면 Google Books 로 한 번 더 본다(키 없이도 되지만
 * 공용 한도가 있어 종종 429 가 난다. GOOGLE_BOOKS_API_KEY 가 있으면 안정적이다).
 *
 * 알라딘·네이버 책 검색은 2026년에 종료돼 쓰지 않는다.
 */

export interface FoundBook {
  isbn: string
  title: string
  author: string | null
  publisher: string | null
  /** 작은 표지 이미지 URL. 클라이언트가 직접 받으면 CORS 에 막히므로 서버가 받아 준다. */
  thumbnailUrl: string | null
  source: 'kakao' | 'google'
}

export type LookupFailCode = 'not-found' | 'not-configured' | 'upstream'

export type LookupResult =
  | { ok: true; book: FoundBook }
  | { ok: false; code: LookupFailCode; detail?: string }

function env(name: string): string | null {
  return process.env[name]?.trim() || null
}

function clip(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

async function fromKakao(isbn: string, key: string, signal: AbortSignal): Promise<LookupResult> {
  const url = `https://dapi.kakao.com/v3/search/book?target=isbn&query=${encodeURIComponent(isbn)}`
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal })
  if (!response.ok) {
    return { ok: false, code: 'upstream', detail: `kakao ${String(response.status)}: ${clip(await response.text())}` }
  }
  const body = (await response.json()) as {
    documents?: Array<{
      title?: unknown
      authors?: unknown
      publisher?: unknown
      thumbnail?: unknown
      isbn?: unknown
    }>
  }
  const doc = body.documents?.[0]
  if (!doc || typeof doc.title !== 'string' || doc.title.trim() === '') return { ok: false, code: 'not-found' }
  const authors = Array.isArray(doc.authors) ? doc.authors.filter((a): a is string => typeof a === 'string') : []
  return {
    ok: true,
    book: {
      isbn,
      title: doc.title.trim(),
      author: authors.length > 0 ? authors.join(', ') : null,
      publisher: typeof doc.publisher === 'string' && doc.publisher.trim() !== '' ? doc.publisher.trim() : null,
      thumbnailUrl: typeof doc.thumbnail === 'string' && doc.thumbnail.startsWith('http') ? doc.thumbnail : null,
      source: 'kakao',
    },
  }
}

async function fromGoogle(isbn: string, key: string | null, signal: AbortSignal): Promise<LookupResult> {
  const url =
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1` +
    (key ? `&key=${encodeURIComponent(key)}` : '')
  const response = await fetch(url, { signal })
  if (!response.ok) {
    return { ok: false, code: 'upstream', detail: `google ${String(response.status)}: ${clip(await response.text())}` }
  }
  const body = (await response.json()) as {
    items?: Array<{
      volumeInfo?: {
        title?: unknown
        authors?: unknown
        publisher?: unknown
        imageLinks?: { thumbnail?: unknown; smallThumbnail?: unknown }
      }
    }>
  }
  const info = body.items?.[0]?.volumeInfo
  if (!info || typeof info.title !== 'string' || info.title.trim() === '') return { ok: false, code: 'not-found' }
  const authors = Array.isArray(info.authors) ? info.authors.filter((a): a is string => typeof a === 'string') : []
  const rawThumb = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail
  // Google 은 http:// 를 준다. 혼합 콘텐츠를 피하려면 https 로 바꿔야 한다.
  const thumbnailUrl = typeof rawThumb === 'string' ? rawThumb.replace(/^http:\/\//, 'https://') : null
  return {
    ok: true,
    book: {
      isbn,
      title: info.title.trim(),
      author: authors.length > 0 ? authors.join(', ') : null,
      publisher: typeof info.publisher === 'string' && info.publisher.trim() !== '' ? info.publisher.trim() : null,
      thumbnailUrl,
      source: 'google',
    },
  }
}

export async function lookupIsbn(isbn: string, signal: AbortSignal): Promise<LookupResult> {
  const kakaoKey = env('KAKAO_REST_API_KEY')
  const googleKey = env('GOOGLE_BOOKS_API_KEY')
  const details: string[] = []

  if (kakaoKey) {
    try {
      const result = await fromKakao(isbn, kakaoKey, signal)
      if (result.ok) return result
      if (result.detail) details.push(result.detail)
    } catch (error) {
      details.push(`kakao: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    const result = await fromGoogle(isbn, googleKey, signal)
    if (result.ok) return result
    if (result.detail) details.push(result.detail)
    if (result.code === 'not-found' && details.length === 0) return result
  } catch (error) {
    details.push(`google: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (details.length === 0) return { ok: false, code: 'not-found' }
  // 카카오가 못 찾고 구글이 429 인 경우처럼, "없다" 와 "못 물어봤다" 가 섞이면 후자로 본다.
  return { ok: false, code: 'upstream', detail: details.join(' | ') }
}

/** 표지 이미지를 받아 base64 로 넘긴다. 2MB 넘거나 이미지가 아니면 null. */
export async function fetchCover(url: string, signal: AbortSignal): Promise<{ mimeType: string; base64: string } | null> {
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return null
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!mimeType.startsWith('image/')) return null
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) return null
    return { mimeType, base64: Buffer.from(buffer).toString('base64') }
  } catch {
    return null
  }
}
