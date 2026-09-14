import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { BookWithCount, HighlightWithBook } from './types.ts'

/**
 * 오프라인 읽기 캐시와 촬영 대기열.
 *
 * Phase 1 의 범위는 "읽기 캐시" 와 "촬영 대기열" 두 가지다.
 * 일반적인 쓰기 동기화(책 수정, 문장 편집의 오프라인 반영)는 Phase 3 로 미뤘다.
 * 대신 촬영만 예외로 두는 이유: 지하철에서 찍은 사진이 사라지면 되돌릴 방법이
 * 없기 때문이다. 다른 작업은 온라인일 때 다시 하면 된다.
 */

/** 서버에서 받아 그대로 보관하는 캐시 행. */
interface CachedBook extends BookWithCount {
  cachedAt: number
}
interface CachedHighlight extends HighlightWithBook {
  cachedAt: number
}

/** 아직 OCR/저장을 마치지 못한 촬영. */
export interface PendingCapture {
  id: string
  /** 리사이즈까지 끝난 JPEG. IndexedDB 는 Blob 을 그대로 저장할 수 있다. */
  blob: Blob
  base64: string
  createdAt: number
  /** 마지막 실패 사유. UI 에 보여준다. */
  lastError: string | null
  attempts: number
}

class UnderlineDB extends Dexie {
  books!: EntityTable<CachedBook, 'id'>
  highlights!: EntityTable<CachedHighlight, 'id'>
  pending!: EntityTable<PendingCapture, 'id'>

  constructor() {
    super('underline')
    this.version(1).stores({
      books: 'id, created_at',
      highlights: 'id, book_id, created_at',
      pending: 'id, createdAt',
    })
  }
}

export const db = new UnderlineDB()

/** 다른 계정으로 로그인하면 이전 캐시가 남아 있으면 안 된다. */
export async function clearCache(): Promise<void> {
  await Promise.all([db.books.clear(), db.highlights.clear()])
}

export async function cacheBooks(rows: BookWithCount[]): Promise<void> {
  const now = Date.now()
  await db.books.clear()
  await db.books.bulkPut(rows.map((row) => ({ ...row, cachedAt: now })))
}

export async function readCachedBooks(): Promise<BookWithCount[]> {
  const rows = await db.books.orderBy('created_at').reverse().toArray()
  return rows.map(({ cachedAt: _cachedAt, ...book }) => book)
}

export async function cacheHighlights(rows: HighlightWithBook[]): Promise<void> {
  const now = Date.now()
  await db.highlights.clear()
  await db.highlights.bulkPut(rows.map((row) => ({ ...row, cachedAt: now })))
}

export async function readCachedHighlights(): Promise<HighlightWithBook[]> {
  const rows = await db.highlights.orderBy('created_at').reverse().toArray()
  return rows.map(({ cachedAt: _cachedAt, ...highlight }) => highlight)
}

export async function queueCapture(blob: Blob, base64: string): Promise<string> {
  const id = crypto.randomUUID()
  await db.pending.put({
    id,
    blob,
    base64,
    createdAt: Date.now(),
    lastError: null,
    attempts: 0,
  })
  return id
}

export async function listPending(): Promise<PendingCapture[]> {
  return db.pending.orderBy('createdAt').toArray()
}

export async function dropPending(id: string): Promise<void> {
  await db.pending.delete(id)
}

export async function markPendingFailed(id: string, error: string): Promise<void> {
  const row = await db.pending.get(id)
  if (!row) return
  await db.pending.put({ ...row, lastError: error, attempts: row.attempts + 1 })
}

/**
 * 저장 공간을 영속으로 요청한다.
 * 허락되지 않으면 브라우저가 압박을 받을 때 IndexedDB 를 비울 수 있고,
 * 그러면 대기 중인 촬영이 사라진다. 실패해도 앱은 계속 돌아가야 한다.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

