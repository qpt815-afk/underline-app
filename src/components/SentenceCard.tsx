import type { ReactNode } from 'react'

interface Props {
  text: string
  bookTitle?: string
  author?: string | null
  page?: number | null
  /** 길게 누르기 메뉴 등, 카드 아래에 붙일 것 */
  footer?: ReactNode
  /** 넘기면 카드에 삭제 버튼이 생긴다. 확인은 호출하는 쪽이 한다. */
  onDelete?: () => void
}

/**
 * 이 앱에서 문장이 주인공이다. 다른 UI 와 달리 세리프로 크게, 넉넉한 행간으로 보여준다.
 */
export default function SentenceCard({ text, bookTitle, author, page, footer, onDelete }: Props) {
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
          {onDelete ? <DeleteButton onDelete={onDelete} className={page !== null && page !== undefined ? '' : 'ml-auto'} /> : null}
        </footer>
      ) : onDelete ? (
        <footer className="mt-4 flex border-t border-line pt-3">
          <DeleteButton onDelete={onDelete} className="ml-auto" />
        </footer>
      ) : null}
      {footer}
    </article>
  )
}

function DeleteButton({ onDelete, className }: { onDelete: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      aria-label="이 문장 삭제"
      // 터치 목표는 44px 이상. 글자는 작게, 누르는 영역은 넓게.
      className={`-my-2 shrink-0 px-2 py-2 text-xs text-muted ${className}`}
    >
      삭제
    </button>
  )
}
