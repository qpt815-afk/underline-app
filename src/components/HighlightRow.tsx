import type { ReactNode } from 'react'
import type { Highlight } from '../lib/types.ts'

interface Props {
  highlight: Highlight
  /** 펼쳐진 상태. 전문과 메모·태그, actions 가 보인다. */
  open: boolean
  onToggle: () => void
  /** 펼쳤을 때 맨 아래에 붙일 것 (동작 버튼 등) */
  actions?: ReactNode
}

/**
 * 책 상세의 문장 목록 한 행. 카드가 아니라 얇은 행이다 — 한 책의 문장을
 * 한눈에 훑는 게 목적이라, 접힌 상태에서는 본문 두 줄과 쪽 번호만 보여주고
 * 행을 누르면 전문과 메모·태그·동작 버튼이 펼쳐진다.
 * 책 제목은 페이지 머리에 이미 있으니 여기서 되풀이하지 않는다.
 */
export default function HighlightRow({ highlight, open, onToggle, actions }: Props) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-3 text-left"
      >
        {/* ko-prose 의 행간(1.85)은 목록에서 너무 성기다. 줄바꿈 규칙만 가져오고 행간은 따로 준다.
            line-clamp 는 display 를 -webkit-box 로 바꾸므로 block 같은 display 유틸리티를 같이 두면 안 된다. */}
        <span
          className={[
            'min-w-0 flex-1 break-keep wrap-break-word font-serif text-[15px] leading-[1.7] text-ink',
            open ? '' : 'line-clamp-2',
          ].join(' ')}
        >
          {highlight.text}
        </span>
        <span className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-muted">
          {highlight.page !== null ? <span className="tabular-nums">{highlight.page}쪽</span> : null}
          <span aria-hidden>{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open ? (
        <div className="pb-3">
          {highlight.note ? <p className="ko-prose text-sm text-muted">{highlight.note}</p> : null}
          {highlight.tags.length > 0 ? (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {highlight.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                  #{tag}
                </span>
              ))}
            </p>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  )
}
