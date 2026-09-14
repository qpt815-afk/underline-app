import { useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState.tsx'
import ErrorState from '../components/ErrorState.tsx'
import Skeleton from '../components/Skeleton.tsx'
import SentenceCard from '../components/SentenceCard.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { highlightsWithCache } from '../lib/cachedQueries.ts'
import { useAsync } from '../lib/useAsync.ts'

export default function Feed() {
  const [query, setQuery] = useState('')
  const { state, reload } = useAsync(() => highlightsWithCache(200), [])

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return []
    const q = query.trim()
    if (q === '') return state.data
    return state.data.filter(
      (h) => h.text.includes(q) || h.book.title.includes(q) || (h.book.author ?? '').includes(q)
    )
  }, [state, query])

  return (
    <div>
      <PageHeader title="문장" />

      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="px-5 pb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value) }}
            placeholder="문장이나 책 제목 검색"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3"
          />
        </div>
      ) : null}

      {state.status === 'loading' ? <Skeleton /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} onRetry={reload} /> : null}

      {state.status === 'ready' && state.data.length === 0 ? (
        <EmptyState
          title="모아둔 문장이 없어요"
          description="저장한 문장이 시간순으로 여기 쌓입니다. 책별로 걸러 보거나 검색해서 다시 찾아볼 수 있어요."
        />
      ) : null}

      {state.status === 'ready' && state.data.length > 0 && filtered.length === 0 ? (
        <EmptyState title="찾는 문장이 없어요" description={`"${query}" 와 맞는 문장이 없습니다.`} />
      ) : null}

      <ul className="space-y-3 px-5 pb-8">
        {filtered.map((highlight) => (
          <li key={highlight.id}>
            <SentenceCard
              text={highlight.text}
              bookTitle={highlight.book.title}
              author={highlight.book.author}
              page={highlight.page}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
