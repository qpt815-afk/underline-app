import { supabase } from './supabase.ts'
import type { Book, BookStatus, BookWithCount, Highlight, HighlightWithBook } from './types.ts'

/**
 * supabase-js 는 RLS 로 막힌 행을 "에러" 가 아니라 "없음" 으로 돌려준다.
 * 즉 정책 버그와 "아직 데이터 없음" 이 겉보기에 같다. 그래서 에러는 반드시
 * 따로 던져서, 빈 상태 화면이 정책 문제를 가리지 않게 한다.
 */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('데이터를 받지 못했습니다')
  return result.data
}

export async function listBooks(): Promise<BookWithCount[]> {
  const result = await supabase
    .from('books')
    // highlights(count) 는 { count: number }[] 형태로 돌아온다.
    .select('*, highlights(count)')
    .order('created_at', { ascending: false })
  const rows = unwrap(result)
  return rows.map((row) => {
    const { highlights, ...book } = row as typeof row & { highlights: { count: number }[] }
    return { ...(book as Book), highlight_count: highlights[0]?.count ?? 0 }
  })
}

export async function getBook(id: string): Promise<Book> {
  return unwrap(await supabase.from('books').select('*').eq('id', id).single())
}

export interface NewBook {
  title: string
  author?: string | null
  status?: BookStatus
}

export async function createBook(input: NewBook): Promise<Book> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('로그인이 필요합니다')

  return unwrap(
    await supabase
      .from('books')
      .insert({
        user_id: userId,
        title: input.title.trim(),
        author: input.author?.trim() ?? null,
        status: input.status ?? 'reading',
      })
      .select()
      .single()
  )
}

export async function updateBook(
  id: string,
  patch: Partial<Pick<Book, 'title' | 'author' | 'status' | 'rating' | 'review' | 'started_at' | 'finished_at' | 'cover_path'>>
): Promise<Book> {
  return unwrap(await supabase.from('books').update(patch).eq('id', id).select().single())
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await supabase.from('books').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** 책 상세: 저장 순 또는 페이지 순. */
export async function listHighlightsForBook(
  bookId: string,
  order: 'created' | 'page' = 'created'
): Promise<Highlight[]> {
  let query = supabase.from('highlights').select('*').eq('book_id', bookId)
  query =
    order === 'page'
      ? query.order('page', { ascending: true, nullsFirst: false }).order('created_at')
      : query.order('created_at', { ascending: false })
  return unwrap(await query)
}

/** 문장 피드: 전체를 시간순으로, 어느 책인지와 함께. */
export async function listHighlights(limit = 100, offset = 0): Promise<HighlightWithBook[]> {
  const result = await supabase
    .from('highlights')
    .select('*, book:books(id,title,author)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  return unwrap(result)
}

export interface NewHighlight {
  book_id: string
  text: string
  page?: number | null
  image_path?: string | null
}

/** 고른 문장들을 한 번에 저장한다. */
export async function createHighlights(items: NewHighlight[]): Promise<Highlight[]> {
  if (items.length === 0) return []
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('로그인이 필요합니다')

  return unwrap(
    await supabase
      .from('highlights')
      .insert(
        items.map((item) => ({
          user_id: userId,
          book_id: item.book_id,
          text: item.text.trim(),
          page: item.page ?? null,
          image_path: item.image_path ?? null,
        }))
      )
      .select()
  )
}

export async function deleteHighlight(id: string): Promise<void> {
  const { error } = await supabase.from('highlights').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
