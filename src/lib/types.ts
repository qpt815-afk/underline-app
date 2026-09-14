// supabase/migrations/0001_init.sql 의 스키마와 1:1로 대응한다.
// 스키마를 바꾸면 이 파일도 같이 바꿔야 한다.

export type BookStatus = 'reading' | 'finished' | 'wishlist'

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  reading: '읽는 중',
  finished: '완독',
  wishlist: '읽고 싶음',
}

export interface Book {
  id: string
  user_id: string
  title: string
  author: string | null
  /** Storage 내 경로. 표지는 직접 촬영한다. */
  cover_path: string | null
  status: BookStatus
  rating: number | null
  review: string | null
  /** YYYY-MM-DD */
  started_at: string | null
  /** YYYY-MM-DD */
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface Highlight {
  id: string
  user_id: string
  book_id: string
  text: string
  page: number | null
  note: string | null
  tags: string[]
  /** 원본 사진의 Storage 경로 */
  image_path: string | null
  created_at: string
  updated_at: string
}

/** 서재 목록용. 책 + 그 책에 달린 문장 수. */
export interface BookWithCount extends Book {
  highlight_count: number
}

/** 문장 피드용. 문장 + 어느 책인지. */
export interface HighlightWithBook extends Highlight {
  book: Pick<Book, 'id' | 'title' | 'author'>
}

/** OCR 함수가 돌려주는 문단 하나. */
export interface ExtractedParagraph {
  text: string
  /** 모델이 흐릿하다고 판단한 문단은 UI 에서 표시해 준다. */
  uncertain: boolean
}
