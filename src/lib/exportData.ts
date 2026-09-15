import { supabase } from './supabase.ts'
import { listBooks, createBook, createHighlights } from './books.ts'
import { localDateKey } from './daily.ts'
import type { Book, Highlight } from './types.ts'

/**
 * 내 문장은 내 것이어야 한다. Supabase 에 무슨 일이 생겨도 전부 들고 나올 수 있게.
 */

export interface ExportFile {
  app: 'underline'
  version: 1
  exportedAt: string
  books: Book[]
  highlights: Highlight[]
}

async function fetchAll(): Promise<{ books: Book[]; highlights: Highlight[] }> {
  const { data: books, error: e1 } = await supabase.from('books').select('*').order('created_at')
  if (e1) throw new Error(e1.message)
  const { data: highlights, error: e2 } = await supabase.from('highlights').select('*').order('created_at')
  if (e2) throw new Error(e2.message)
  // DB 의 status 는 text 라 BookStatus 로 좁혀 준다.
  return { books: books as Book[], highlights }
}

export async function buildJsonExport(): Promise<ExportFile> {
  const { books, highlights } = await fetchAll()
  return { app: 'underline', version: 1, exportedAt: new Date().toISOString(), books, highlights }
}

/** 책별로 문장을 묶은 마크다운. 옵시디언·노션에 붙여넣기 좋게. */
export async function buildMarkdownExport(): Promise<string> {
  const { books, highlights } = await fetchAll()
  const byBook = new Map<string, Highlight[]>()
  for (const h of highlights) {
    const list = byBook.get(h.book_id) ?? []
    list.push(h)
    byBook.set(h.book_id, list)
  }

  const out: string[] = ['# 밑줄', '', `내보낸 날: ${localDateKey()}`, '']
  for (const book of books) {
    const list = byBook.get(book.id) ?? []
    if (list.length === 0) continue
    out.push(`## ${book.title}${book.author ? ` — ${book.author}` : ''}`)
    const meta: string[] = []
    if (book.rating) meta.push(`${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}`)
    if (book.started_at) meta.push(`시작 ${book.started_at}`)
    if (book.finished_at) meta.push(`완독 ${book.finished_at}`)
    if (meta.length) out.push(meta.join(' · '))
    if (book.review) out.push('', `> ${book.review}`)
    out.push('')
    // 페이지 순, 페이지 없으면 저장 순.
    const sorted = [...list].sort((a, b) => {
      if (a.page !== null && b.page !== null) return a.page - b.page
      if (a.page !== null) return -1
      if (b.page !== null) return 1
      return a.created_at.localeCompare(b.created_at)
    })
    for (const h of sorted) {
      const page = h.page !== null ? ` (${String(h.page)}쪽)` : ''
      out.push(`- ${h.text}${page}`)
      if (h.note) out.push(`  - 메모: ${h.note}`)
      if (h.tags.length) out.push(`  - ${h.tags.map((t) => `#${t}`).join(' ')}`)
    }
    out.push('')
  }
  return out.join('\n')
}

function isExportFile(value: unknown): value is ExportFile {
  const v = value as Partial<ExportFile> | null
  return (
    typeof v === 'object' &&
    v !== null &&
    v.app === 'underline' &&
    v.version === 1 &&
    Array.isArray(v.books) &&
    Array.isArray(v.highlights)
  )
}

/** 책 + 본문으로 중복을 가리는 키. 구분자는 본문에 나올 리 없는 문자열. */
function dedupeKey(bookId: string, text: string): string {
  return `${bookId} :: ${text.trim()}`
}

/**
 * JSON 을 다시 들여온다. 제목이 같은 책은 기존 것에 합치고, 본문이 같은 문장은
 * 건너뛴다 — 두 번 눌러도 중복이 생기지 않게.
 */
export async function importJson(text: string): Promise<{ books: number; highlights: number }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('JSON 파일이 아닙니다.')
  }
  if (!isExportFile(parsed)) throw new Error('밑줄에서 내보낸 파일이 아닙니다.')

  const existingBooks = await listBooks()
  const titleToId = new Map(existingBooks.map((b) => [b.title.trim(), b.id]))
  const oldToNewBookId = new Map<string, string>()
  let newBooks = 0

  for (const book of parsed.books) {
    const key = book.title.trim()
    let id = titleToId.get(key)
    if (!id) {
      const created = await createBook({ title: book.title, author: book.author, status: book.status })
      id = created.id
      titleToId.set(key, id)
      newBooks++
    }
    oldToNewBookId.set(book.id, id)
  }

  const { data: existing, error } = await supabase.from('highlights').select('book_id, text')
  if (error) throw new Error(error.message)
  const seen = new Set(existing.map((h) => dedupeKey(h.book_id, h.text)))

  const toInsert = parsed.highlights.flatMap((h) => {
    const bookId = oldToNewBookId.get(h.book_id)
    if (!bookId) return []
    const key = dedupeKey(bookId, h.text)
    if (seen.has(key)) return []
    seen.add(key)
    return [{ book_id: bookId, text: h.text, page: h.page, image_path: null }]
  })
  const inserted = await createHighlights(toInsert)
  return { books: newBooks, highlights: inserted.length }
}

export function downloadText(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
}
