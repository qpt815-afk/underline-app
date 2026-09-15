import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { Book, BookWithCount, Highlight, HighlightWithBook } from './types.ts'

/**
 * 오프라인 읽기 캐시, 촬영 대기열, 쓰기 대기열(outbox).
 *
 * - 읽기 캐시: 서재·피드를 마지막으로 받은 그대로 보관한다. 비행기 모드에서도 읽힌다.
 * - 촬영 대기열: 오프라인에서 찍은 사진. 연결되면 촬영 화면에서 이어서 처리한다.
 * - 쓰기 대기열: 오프라인에서 한 수정·삭제. 캐시에 먼저 반영해 화면에 보이게 하고,
 *   연결되면 순서대로 서버에 보낸다(src/lib/sync.ts).
 *   새 문장 만들기는 여기 없다 — OCR 자체가 온라인이라 촬영 대기열이 그 역할이다.
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

export type HighlightPatch = Partial<Pick<Highlight, 'text' | 'note' | 'tags' | 'page'>>
export type BookPatch = Partial<
  Pick<Book, 'title' | 'author' | 'status' | 'rating' | 'review' | 'started_at' | 'finished_at' | 'cover_path'>
>

/** 서버에 아직 보내지 못한 쓰기 하나. 종류별로 필요한 것만 담는다. */
export type OutboxOp =
  | { kind: 'highlight.update'; id: string; patch: HighlightPatch }
  | { kind: 'highlight.delete'; id: string }
  | { kind: 'book.update'; id: string; patch: BookPatch }
  | { kind: 'book.delete'; id: string }

export interface OutboxItem {
  id: string
  createdAt: number
  op: OutboxOp
  attempts: number
  lastError: string | null
}

class UnderlineDB extends Dexie {
  books!: EntityTable<CachedBook, 'id'>
  highlights!: EntityTable<CachedHighlight, 'id'>
  pending!: EntityTable<PendingCapture, 'id'>
  outbox!: EntityTable<OutboxItem, 'id'>

  constructor() {
    super('underline')
    this.version(1).stores({
      books: 'id, created_at',
      highlights: 'id, book_id, created_at',
      pending: 'id, createdAt',
    })
    // Phase 3: 쓰기 대기열. 기존 표는 그대로, 새 표만 더한다.
    this.version(2).stores({
      books: 'id, created_at',
      highlights: 'id, book_id, created_at',
      pending: 'id, createdAt',
      outbox: 'id, createdAt',
    })
  }
}

export const db = new UnderlineDB()

/**
 * 다른 계정으로 로그인하면 이전 캐시가 남아 있으면 안 된다.
 * 대기 중인 쓰기도 이전 계정의 것이라 함께 버린다. 촬영 대기열은 계정과 무관한
 * 사진이므로 남긴다.
 */
export async function clearCache(): Promise<void> {
  await Promise.all([db.books.clear(), db.highlights.clear(), db.outbox.clear()])
}

// ── 읽기 캐시 ────────────────────────────────────────────────────────────────

export async function cacheBooks(rows: BookWithCount[]): Promise<void> {
  const now = Date.now()
  await db.books.clear()
  await db.books.bulkPut(rows.map((row) => ({ ...row, cachedAt: now })))
}

export async function readCachedBooks(): Promise<BookWithCount[]> {
  const rows = await db.books.orderBy('created_at').reverse().toArray()
  return rows.map(({ cachedAt: _cachedAt, ...book }) => book)
}

export async function readCachedBook(id: string): Promise<Book | null> {
  const row = await db.books.get(id)
  if (!row) return null
  const { cachedAt: _cachedAt, highlight_count: _count, ...book } = row
  return book
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

/** 책 상세용. 피드 캐시(최근 200개)에서 그 책 것만 고르므로 오래된 문장은 빠질 수 있다. */
export async function readCachedHighlightsForBook(bookId: string, order: 'created' | 'page'): Promise<Highlight[]> {
  const rows = await db.highlights.where('book_id').equals(bookId).toArray()
  const list = rows.map(({ cachedAt: _cachedAt, book: _book, ...highlight }) => highlight)
  if (order === 'page') {
    list.sort((a, b) => {
      if (a.page !== null && b.page !== null) return a.page - b.page
      if (a.page !== null) return -1
      if (b.page !== null) return 1
      return a.created_at.localeCompare(b.created_at)
    })
  } else {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return list
}

// ── 오프라인 쓰기를 캐시에 먼저 반영 ────────────────────────────────────────
// 서버에 가기 전이라도 화면은 바뀌어야 한다. 없는 행이면 조용히 넘어간다.

export async function patchCachedHighlight(id: string, patch: HighlightPatch): Promise<void> {
  await db.highlights.update(id, patch)
}

export async function removeCachedHighlight(id: string): Promise<void> {
  const row = await db.highlights.get(id)
  await db.highlights.delete(id)
  if (row) await db.books.where('id').equals(row.book_id).modify((book) => { book.highlight_count = Math.max(0, book.highlight_count - 1) })
}

export async function patchCachedBook(id: string, patch: BookPatch): Promise<void> {
  await db.books.update(id, patch)
  if (patch.title !== undefined || patch.author !== undefined) {
    // 피드 카드에 박힌 책 이름도 같이 바꾼다.
    await db.highlights.where('book_id').equals(id).modify((h) => {
      if (patch.title !== undefined) h.book.title = patch.title
      if (patch.author !== undefined) h.book.author = patch.author
    })
  }
}

export async function removeCachedBook(id: string): Promise<void> {
  // 서버는 on delete cascade 로 문장도 지운다. 캐시도 똑같이.
  await Promise.all([db.books.delete(id), db.highlights.where('book_id').equals(id).delete()])
}

// ── 쓰기 대기열 ──────────────────────────────────────────────────────────────

export async function enqueueOutbox(op: OutboxOp): Promise<void> {
  await db.outbox.put({ id: crypto.randomUUID(), createdAt: Date.now(), op, attempts: 0, lastError: null })
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return db.outbox.orderBy('createdAt').toArray()
}

export async function countOutbox(): Promise<number> {
  return db.outbox.count()
}

export async function dropOutbox(id: string): Promise<void> {
  await db.outbox.delete(id)
}

export async function markOutboxFailed(id: string, error: string): Promise<void> {
  await db.outbox.where('id').equals(id).modify((item) => {
    item.attempts += 1
    item.lastError = error
  })
}

// ── 촬영 대기열 ──────────────────────────────────────────────────────────────

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
