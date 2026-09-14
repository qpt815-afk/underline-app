import { Link } from 'react-router'
import EmptyState from '../components/EmptyState.tsx'
import ErrorState from '../components/ErrorState.tsx'
import Skeleton from '../components/Skeleton.tsx'
import PageHeader from '../components/PageHeader.tsx'
import StarRating from '../components/StarRating.tsx'
import { listBooks } from '../lib/books.ts'
import { BOOK_STATUS_LABEL } from '../lib/types.ts'
import { useAsync } from '../lib/useAsync.ts'

export default function Library() {
  const { state, reload } = useAsync(() => listBooks(), [])

  return (
    <div>
      <PageHeader title="서재" />

      {state.status === 'loading' ? <Skeleton /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} onRetry={reload} /> : null}

      {state.status === 'ready' && state.data.length === 0 ? (
        <EmptyState
          title="서재가 비어 있어요"
          description="문장을 저장하면 책 단위로 차곡차곡 쌓입니다. 읽기 시작한 날, 다 읽은 날, 별점과 한 줄 감상도 함께 남길 수 있어요."
          action={
            <Link to="/capture" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              첫 문장 찍기
            </Link>
          }
        />
      ) : null}

      <ul className="space-y-3 px-5 pb-8">
        {state.status === 'ready'
          ? state.data.map((book) => (
              <li key={book.id}>
                <Link
                  to={`/book/${book.id}`}
                  className="block rounded-2xl border border-line bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="ko-prose font-serif text-base">{book.title}</p>
                      {book.author ? (
                        <p className="ko-prose mt-0.5 text-sm text-muted">{book.author}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                      {BOOK_STATUS_LABEL[book.status] ?? book.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted">문장 {book.highlight_count}개</span>
                    {book.rating !== null ? <StarRating value={book.rating} size="sm" /> : null}
                  </div>
                </Link>
              </li>
            ))
          : null}
      </ul>
    </div>
  )
}
