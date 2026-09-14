import { useState } from 'react'
import { useParams } from 'react-router'
import EmptyState from '../components/EmptyState.tsx'
import ErrorState from '../components/ErrorState.tsx'
import Skeleton from '../components/Skeleton.tsx'
import SentenceCard from '../components/SentenceCard.tsx'
import StarRating from '../components/StarRating.tsx'
import { getBook, listHighlightsForBook, updateBook } from '../lib/books.ts'
import { BOOK_STATUS_LABEL } from '../lib/types.ts'
import type { BookStatus } from '../lib/types.ts'
import { useAsync } from '../lib/useAsync.ts'

const STATUSES: BookStatus[] = ['reading', 'finished', 'wishlist']

export default function BookDetail() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<'created' | 'page'>('created')

  const book = useAsync(() => getBook(id ?? ''), [id])
  const highlights = useAsync(() => listHighlightsForBook(id ?? '', order), [id, order])

  // 독서 기록은 낙관적으로 반영한다. 폰에서 별점을 누르고 기다리는 건 답답하다.
  const [draft, setDraft] = useState<{ rating?: number | null; review?: string } | null>(null)

  async function patch(next: { rating?: number | null; review?: string; status?: BookStatus }) {
    if (!id) return
    setDraft((prev) => ({ ...prev, ...next }))
    try {
      await updateBook(id, next)
    } catch {
      // 실패하면 서버 값으로 되돌린다.
      setDraft(null)
      book.reload()
    }
  }

  if (book.state.status === 'loading') return <Skeleton rows={2} />
  if (book.state.status === 'error') {
    return <ErrorState message={book.state.message} onRetry={book.reload} />
  }

  const data = book.state.data
  const rating = draft?.rating !== undefined ? draft.rating : data.rating
  const review = draft?.review ?? data.review ?? ''

  return (
    <div className="pb-8">
      <header className="px-5 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}>
        <h1 className="ko-prose font-serif text-2xl">{data.title}</h1>
        {data.author ? <p className="ko-prose mt-1 text-sm text-muted">{data.author}</p> : null}
      </header>

      <section className="space-y-4 px-5">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => { void patch({ status }) }}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                data.status === status ? 'border-accent text-accent' : 'border-line text-muted'
              }`}
            >
              {BOOK_STATUS_LABEL[status]}
            </button>
          ))}
        </div>

        <div>
          <p className="text-sm font-medium">별점</p>
          <div className="mt-2">
            <StarRating value={rating} onChange={(value) => { void patch({ rating: value }) }} />
          </div>
        </div>

        <div>
          <label htmlFor="review" className="text-sm font-medium">한 줄 감상</label>
          <textarea
            id="review"
            value={review}
            onChange={(e) => { setDraft((prev) => ({ ...prev, review: e.target.value })) }}
            onBlur={() => { void patch({ review }) }}
            rows={2}
            placeholder="다 읽고 나서 남기고 싶은 한 줄"
            className="ko-prose mt-2 w-full rounded-xl border border-line bg-surface p-3"
          />
        </div>

        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-muted">시작</dt>
            <dd>{data.started_at ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">완독</dt>
            <dd>{data.finished_at ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-sm font-medium text-muted">문장</h2>
          <button
            type="button"
            onClick={() => { setOrder((o) => (o === 'created' ? 'page' : 'created')) }}
            className="text-sm text-accent"
          >
            {order === 'created' ? '저장 순' : '페이지 순'}
          </button>
        </div>

        {highlights.state.status === 'loading' ? <Skeleton rows={2} /> : null}
        {highlights.state.status === 'error' ? (
          <ErrorState message={highlights.state.message} onRetry={highlights.reload} />
        ) : null}
        {highlights.state.status === 'ready' && highlights.state.data.length === 0 ? (
          <EmptyState
            title="이 책에서 저장한 문장이 없어요"
            description="읽다가 마음에 드는 문장을 만나면 그 페이지를 찍어보세요."
          />
        ) : null}

        <ul className="space-y-3 px-5">
          {highlights.state.status === 'ready'
            ? highlights.state.data.map((highlight) => (
                <li key={highlight.id}>
                  <SentenceCard text={highlight.text} page={highlight.page} />
                </li>
              ))
            : null}
        </ul>
      </section>
    </div>
  )
}
