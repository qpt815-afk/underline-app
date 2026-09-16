import type { ReactNode } from 'react'

interface Props {
  text: string
  bookTitle?: string
  author?: string | null
  page?: number | null
  note?: string | null
  tags?: readonly string[]
  /** 카드 아래에 붙일 것 (동작 버튼 등) */
  footer?: ReactNode
  /**
   * 목록용 촘촘한 판형. 여백과 글자를 줄이고 출처를 한 줄로 붙인다.
   * 홈의 오늘의 문장처럼 하나만 보여줄 때는 기본(넉넉한) 판형을 쓴다.
   */
  compact?: boolean
  /** 본문을 네 줄까지만 보여준다. 목록에서 긴 문장이 화면을 다 차지하지 않게. */
  clamp?: boolean
  /** 있으면 본문을 누를 수 있고, 눌렀을 때 부른다(펼치기/접기). */
  onTap?: () => void
  /** onTap 이 있을 때 지금 펼쳐진 상태인지. 표시만 바꾼다. */
  expanded?: boolean
}

/**
 * 이 앱에서 문장이 주인공이다. 다른 UI 와 달리 세리프로, 넉넉한 행간으로 보여준다.
 */
export default function SentenceCard({
  text,
  bookTitle,
  author,
  page,
  note,
  tags,
  footer,
  compact = false,
  clamp = false,
  onTap,
  expanded = false,
}: Props) {
  const hasMeta = Boolean(bookTitle) || (page !== null && page !== undefined)

  const body = (
    <>
      <p
        className={[
          'ko-prose font-serif text-ink',
          compact ? 'text-base leading-[1.7]' : 'text-lg',
          clamp ? 'line-clamp-4' : '',
        ].join(' ')}
      >
        {text}
      </p>
      {note ? <p className={`ko-prose text-muted ${compact ? 'mt-1.5 text-xs' : 'mt-3 text-sm'}`}>{note}</p> : null}
      {tags && tags.length > 0 ? (
        <p className={`flex flex-wrap gap-1.5 ${compact ? 'mt-1.5' : 'mt-2'}`}>
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
              #{tag}
            </span>
          ))}
        </p>
      ) : null}
      {hasMeta ? (
        <footer
          className={
            compact
              ? 'mt-2 flex items-baseline gap-2 text-xs'
              : 'mt-5 flex items-baseline gap-2 border-t border-line pt-4'
          }
        >
          {bookTitle ? (
            <cite className={`ko-prose min-w-0 truncate not-italic text-muted ${compact ? '' : 'text-sm'}`}>
              {bookTitle}
              {author ? ` · ${author}` : ''}
            </cite>
          ) : null}
          {page !== null && page !== undefined ? (
            <span className="ml-auto shrink-0 text-xs text-muted">{page}쪽</span>
          ) : null}
          {onTap ? (
            <span aria-hidden className={`shrink-0 text-xs text-muted ${page !== null && page !== undefined ? '' : 'ml-auto'}`}>
              {expanded ? '▴' : '▾'}
            </span>
          ) : null}
        </footer>
      ) : null}
    </>
  )

  return (
    <article className={`rounded-2xl border border-line bg-surface ${compact ? 'p-4' : 'p-6'}`}>
      {onTap ? (
        <button type="button" onClick={onTap} aria-expanded={expanded} className="block w-full text-left">
          {body}
        </button>
      ) : (
        body
      )}
      {footer}
    </article>
  )
}
