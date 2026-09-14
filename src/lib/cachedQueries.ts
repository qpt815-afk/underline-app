import { listBooks, listHighlights } from './books.ts'
import { cacheBooks, cacheHighlights, readCachedBooks, readCachedHighlights } from './db.ts'
import type { BookWithCount, HighlightWithBook } from './types.ts'

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
