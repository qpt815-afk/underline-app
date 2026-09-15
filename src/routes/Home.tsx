import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import EmptyState from '../components/EmptyState.tsx'
import ErrorState from '../components/ErrorState.tsx'
import Skeleton from '../components/Skeleton.tsx'
import SentenceCard from '../components/SentenceCard.tsx'
import { highlightsWithCache } from '../lib/cachedQueries.ts'
import { resolveDailyPick } from '../lib/dailyPick.ts'
import { useAsync } from '../lib/useAsync.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import type { HighlightWithBook } from '../lib/types.ts'

export default function Home() {
  const { user } = useAuth()
  // "다른 문장 보기" 를 누른 횟수. 날짜 시드에 섞어서 같은 날에도 다른 결과를 낸다.
  const [nonce, setNonce] = useState(0)
  const { state, reload } = useAsync(() => highlightsWithCache(200), [])
  // undefined = 아직 정하는 중. null = 문장이 하나도 없다.
  const [pick, setPick] = useState<HighlightWithBook | null | undefined>(undefined)

  const candidates = state.status === 'ready' ? state.data : null
  const userId = user?.id ?? null
  useEffect(() => {
    if (!candidates || !userId) return
    let alive = true
    void resolveDailyPick(candidates, userId, nonce).then((result) => {
      if (alive) setPick(result)
    })
    return () => { alive = false }
  }, [candidates, userId, nonce])

  const loading = state.status === 'loading' || (state.status === 'ready' && pick === undefined)

  return (
    <div>
      <header
        className="flex items-baseline justify-between px-5 pb-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
      >
        <p className="text-sm text-muted">오늘의 문장</p>
        {pick ? (
          <button
            type="button"
            onClick={() => { setNonce((n) => n + 1) }}
            className="text-sm text-accent"
          >
            다른 문장
          </button>
        ) : null}
      </header>

      <section className="px-5">
        {loading ? <Skeleton rows={1} /> : null}
        {state.status === 'error' ? <ErrorState message={state.message} onRetry={reload} /> : null}
        {pick ? (
          <SentenceCard
            text={pick.text}
            bookTitle={pick.book.title}
            author={pick.book.author}
            page={pick.page}
          />
        ) : null}
        {state.status === 'ready' && pick === null ? (
          <div className="rounded-2xl border border-line bg-surface">
            <EmptyState
              title="아직 문장이 없어요"
              description="책을 읽다 마음에 드는 문장을 만나면 그 페이지를 찍어보세요. 여기에 매일 한 문장씩 다시 꺼내 드릴게요."
            />
          </div>
        ) : null}
      </section>

      <section className="px-5 pt-6">
        <Link
          to="/capture"
          className="flex h-16 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-white"
        >
          문장 찍기
        </Link>
      </section>
    </div>
  )
}
