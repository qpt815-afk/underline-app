import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import EmptyState from '../components/EmptyState.tsx'
import ErrorState from '../components/ErrorState.tsx'
import Skeleton from '../components/Skeleton.tsx'
import HighlightRow from '../components/HighlightRow.tsx'
import StarRating from '../components/StarRating.tsx'
import HighlightActions from '../components/HighlightActions.tsx'
import CoverImage, { forgetCover } from '../components/CoverImage.tsx'
import { preparePhoto } from '../lib/photo/preparePhoto.ts'
import { PhotoError } from '../lib/photo/encodePhoto.ts'
import { uploadCover } from '../lib/storage.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { deleteBook, deleteHighlight, updateBook } from '../lib/books.ts'
import { bookHighlightsWithCache, bookWithCache } from '../lib/cachedQueries.ts'
import { BOOK_STATUS_LABEL } from '../lib/types.ts'
import type { BookStatus } from '../lib/types.ts'
import { useAsync } from '../lib/useAsync.ts'

const STATUSES: BookStatus[] = ['reading', 'finished', 'wishlist']

export default function BookDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [order, setOrder] = useState<'created' | 'page'>('created')
  // 펼친 문장. 목록은 얇은 행으로 훑고, 누른 하나만 전문과 동작 버튼을 보여준다.
  // 한 번에 하나만 펼쳐서 목록이 다시 두꺼워지지 않게 한다.
  const [openId, setOpenId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  async function changeCover(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.item(0) ?? null
    input.value = ''
    if (!file || !id || !user) return
    setCoverBusy(true)
    try {
      const prepared = await preparePhoto(file)
      const path = await uploadCover(prepared.blob, user.id, id)
      forgetCover(path)
      await updateBook(id, { cover_path: path })
      book.reload()
    } catch (error) {
      window.alert(error instanceof PhotoError ? error.message : error instanceof Error ? error.message : '표지를 올리지 못했습니다.')
    } finally {
      setCoverBusy(false)
    }
  }

  const book = useAsync(() => bookWithCache(id ?? ''), [id])
  const highlights = useAsync(() => bookHighlightsWithCache(id ?? '', order), [id, order])

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

  async function removeHighlight(highlightId: string, text: string) {
    const head = text.length > 30 ? `${text.slice(0, 30)}…` : text
    if (!window.confirm(`이 문장을 지울까요?\n\n“${head}”`)) return
    try {
      await deleteHighlight(highlightId)
      setOpenId((current) => (current === highlightId ? null : current))
      highlights.reload()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '지우지 못했습니다.')
    }
  }

  async function removeBook() {
    if (!id || book.state.status !== 'ready') return
    const count = highlights.state.status === 'ready' ? highlights.state.data.length : 0
    // 책을 지우면 문장도 함께 사라진다(DB 의 on delete cascade). 그 사실을 분명히 말한다.
    const warning =
      count > 0
        ? `『${book.state.data.title}』과 저장된 문장 ${String(count)}개가 모두 지워집니다. 되돌릴 수 없어요.`
        : `『${book.state.data.title}』을 지울까요?`
    if (!window.confirm(warning)) return
    setDeleting(true)
    try {
      await deleteBook(id)
      void navigate('/library', { replace: true })
    } catch (error) {
      setDeleting(false)
      window.alert(error instanceof Error ? error.message : '지우지 못했습니다.')
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
      <header className="flex gap-4 px-5 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}>
        <button
          type="button"
          disabled={coverBusy}
          onClick={() => { coverInputRef.current?.click() }}
          aria-label={data.cover_path ? '표지 바꾸기' : '표지 찍기'}
          className="shrink-0 disabled:opacity-40"
        >
          <CoverImage path={data.cover_path} title={data.title} className="h-32 w-22 rounded-lg" />
          <span className="mt-1 block text-center text-xs text-muted">
            {coverBusy ? '올리는 중…' : data.cover_path ? '표지 바꾸기' : '표지 찍기'}
          </span>
        </button>
        {/* 표지는 갤러리에서 고르거나 바로 찍는다. 갤러리 쪽이 더 흔하므로 capture 를 두지 않는다 —
            안드로이드 사진 선택기에도 카메라가 있다. */}
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void changeCover(e) }} />
        <div className="min-w-0 flex-1">
          <h1 className="ko-prose font-serif text-2xl">{data.title}</h1>
          {data.author ? <p className="ko-prose mt-1 text-sm text-muted">{data.author}</p> : null}
        </div>
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
          <h2 className="text-sm font-medium text-muted">
            문장
            {highlights.state.status === 'ready' && highlights.state.data.length > 0
              ? ` ${String(highlights.state.data.length)}개`
              : null}
          </h2>
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

        {highlights.state.status === 'ready' && highlights.state.data.length > 0 ? (
          // 카드 대신 구분선으로 나눈 얇은 행. 한 책의 문장을 한 화면에서 훑을 수 있게.
          <ul className="divide-y divide-line border-y border-line">
            {highlights.state.data.map((highlight) => {
              const open = openId === highlight.id
              return (
                <li key={highlight.id} className={`px-5 ${open ? 'bg-surface' : ''}`}>
                  <HighlightRow
                    highlight={highlight}
                    open={open}
                    onToggle={() => { setOpenId(open ? null : highlight.id) }}
                    actions={
                      <HighlightActions
                        highlight={highlight}
                        bookTitle={data.title}
                        author={data.author}
                        onChanged={highlights.reload}
                        onDelete={() => { void removeHighlight(highlight.id, highlight.text) }}
                      />
                    }
                  />
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>

      {/* 파괴적인 동작은 맨 아래, 다른 것과 떨어뜨려 둔다. */}
      <section className="mt-12 px-5">
        <button
          type="button"
          disabled={deleting}
          onClick={() => { void removeBook() }}
          className="w-full rounded-xl border border-line py-3 text-sm text-muted disabled:opacity-40"
        >
          {deleting ? '지우는 중…' : '이 책 삭제'}
        </button>
      </section>
    </div>
  )
}
