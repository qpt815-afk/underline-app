import { getBook, listBooks, listHighlights, listHighlightsForBook } from './books.ts'
import {
  cacheBooks,
  cacheHighlights,
  readCachedBook,
  readCachedBooks,
  readCachedHighlights,
  readCachedHighlightsForBook,
} from './db.ts'
import type { Book, BookWithCount, Highlight, HighlightWithBook } from './types.ts'

/**
 * 캐시를 먼저 쓰고 네트워크로 갱신한다.
 *
 * 네트워크가 성공하면 캐시를 갱신하고 새 값을 돌려준다.
 * 실패했는데 캐시가 있으면 캐시를 돌려준다 — 비행기 모드에서도 읽을 수 있어야 한다.
 * 실패했고 캐시도 없으면 에러를 던진다. 그래야 UI 가 빈 상태가 아니라
 * 에러 상태를 보여준다(둘은 다른 일이다).
 */
async function readThrough<T>(
  fetchFresh: () => Promise<T[]>,
  writeCache: (rows: T[]) => Promise<void>,
  readCache: () => Promise<T[]>
): Promise<T[]> {
  try {
    const fresh = await fetchFresh()
    // 캐시 쓰기가 실패해도(용량 부족 등) 데이터는 돌려줘야 한다.
    await writeCache(fresh).catch(() => undefined)
    return fresh
  } catch (error) {
    const cached = await readCache().catch(() => [])
    if (cached.length > 0) return cached
    throw error
  }
}

export function booksWithCache(): Promise<BookWithCount[]> {
  return readThrough(listBooks, cacheBooks, readCachedBooks)
}

export function highlightsWithCache(limit = 200): Promise<HighlightWithBook[]> {
  return readThrough(() => listHighlights(limit), cacheHighlights, readCachedHighlights)
}

/** 책 상세. 서재 캐시에 그 책이 있으면 오프라인에서도 열린다. */
export async function bookWithCache(id: string): Promise<Book> {
  try {
    return await getBook(id)
  } catch (error) {
    const cached = await readCachedBook(id).catch(() => null)
    if (cached) return cached
    throw error
  }
}

/** 책의 문장. 오프라인이면 피드 캐시에서 그 책 것만 고른다(최근 200개 안에서). */
export async function bookHighlightsWithCache(bookId: string, order: 'created' | 'page'): Promise<Highlight[]> {
  try {
    return await listHighlightsForBook(bookId, order)
  } catch (error) {
    const cached = await readCachedHighlightsForBook(bookId, order).catch(() => [])
    if (cached.length > 0) return cached
    throw error
  }
}
