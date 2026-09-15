import { useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState.tsx'
import ErrorState from '../components/ErrorState.tsx'
import Skeleton from '../components/Skeleton.tsx'
import SentenceCard from '../components/SentenceCard.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { highlightsWithCache } from '../lib/cachedQueries.ts'
import { deleteHighlight } from '../lib/books.ts'
import HighlightActions from '../components/HighlightActions.tsx'
import { useAsync } from '../lib/useAsync.ts'

export default function Feed() {
  const [query, setQuery] = useState('')
  const [bookId, setBookId] = useState<string>('')
  const { state, reload } = useAsync(() => highlightsWithCache(200), [])

  // 필터 드롭다운용 책 목록. 문장에서 뽑으면 별도 요청이 없다.
  const books = useMemo(() => {
    if (state.status !== 'ready') return []
    const seen = new Map<string, string>()
    for (const h of state.data) seen.set(h.book.id, h.book.title)
    return [...seen.entries()].map(([id, title]) => ({ id, title }))
  }, [state])

  async function remove(id: string, text: string) {
    // 되돌릴 수 없으므로 한 번 묻는다. 문장 앞부분을 보여줘야 어느 것인지 안다.
    const head = text.length > 30 ? `${text.slice(0, 30)}…` : text
    if (!window.confirm(`이 문장을 지울까요?\n\n“${head}”`)) return
    try {
      await deleteHighlight(id)
      reload()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '지우지 못했습니다.')
    }
  }

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return []
    const q = query.trim().replace(/^#/, '')
    return state.data.filter((h) => {
      if (bookId !== '' && h.book.id !== bookId) return false
      if (q === '') return true
      return (
        h.text.includes(q) ||
        h.book.title.includes(q) ||
        (h.book.author ?? '').includes(q) ||
        (h.note ?? '').includes(q) ||
        h.tags.some((t) => t.includes(q))
      )
    })
  }, [state, query, bookId])

  return (
    <div>
      <PageHeader title="문장" />

      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="space-y-2 px-5 pb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value) }}
            placeholder="문장, 책, 메모, #태그 검색"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3"
          />
          {books.length > 1 ? (
            <select
              value={bookId}
              onChange={(e) => { setBookId(e.target.value) }}
              aria-label="책으로 거르기"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3"
            >
              <option value="">모든 책</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          ) : null}
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
              note={highlight.note}
              tags={highlight.tags}
              footer={
                <HighlightActions
                  highlight={highlight}
                  bookTitle={highlight.book.title}
                  author={highlight.book.author}
                  onChanged={reload}
                  onDelete={() => { void remove(highlight.id, highlight.text) }}
                />
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
