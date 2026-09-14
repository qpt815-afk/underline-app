import type { ReactNode } from 'react'

interface Props {
  text: string
  bookTitle?: string
  author?: string | null
  page?: number | null
  /** 길게 누르기 메뉴 등, 카드 아래에 붙일 것 */
  footer?: ReactNode
}

/**
 * 이 앱에서 문장이 주인공이다. 다른 UI 와 달리 세리프로 크게, 넉넉한 행간으로 보여준다.
 */
export default function SentenceCard({ text, bookTitle, author, page, footer }: Props) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-6">
      <p className="ko-prose font-serif text-lg text-ink">{text}</p>
      {bookTitle ? (
        <footer className="mt-5 flex items-baseline gap-2 border-t border-line pt-4">
          <cite className="ko-prose not-italic text-sm text-muted">
            {bookTitle}
            {author ? ` · ${author}` : ''}
          </cite>
          {page !== null && page !== undefined ? (
            <span className="ml-auto shrink-0 text-xs text-muted">{page}쪽</span>
          ) : null}
        </footer>
      ) : null}
      {footer}
    </article>
  )
}
