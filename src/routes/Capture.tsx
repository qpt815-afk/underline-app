import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import CaptureButtons from '../components/CaptureButtons.tsx'
import { preparePhoto } from '../lib/photo/preparePhoto.ts'
import { PhotoError } from '../lib/photo/encodePhoto.ts'
import { requestOcr } from '../lib/ocrClient.ts'
import type { OcrProvider } from '../lib/ocrClient.ts'
import { uploadPagePhoto } from '../lib/storage.ts'
import { listBooks, createBook, createHighlights } from '../lib/books.ts'
import type { BookWithCount, ExtractedParagraph } from '../lib/types.ts'
import { groupSelected, splitSentences } from '../lib/sentences.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { dropPending, listPending, markPendingFailed, queueCapture, requestPersistence } from '../lib/db.ts'
import type { PendingCapture } from '../lib/db.ts'
import PendingCaptures from '../components/PendingCaptures.tsx'

type Stage =
  | { name: 'idle' }
  | { name: 'working'; label: string }
  | { name: 'error'; message: string; canRetryOther: boolean; detail?: string }
  | { name: 'choose'; rows: SentenceRow[]; imagePath: string | null; pendingId: string | null }

/** 화면에서 탭으로 고르는 단위. OCR 문단을 문장으로 펼친 것. */
interface SentenceRow {
  text: string
  /** 어느 문단에서 왔는지. 같은 문단의 연속 선택은 하나의 밑줄로 합친다. */
  paragraph: number
  uncertain: boolean
}

function toRows(paragraphs: ExtractedParagraph[]): SentenceRow[] {
  return paragraphs.flatMap((p, paragraph) =>
    splitSentences(p.text).map((text) => ({ text, paragraph, uncertain: p.uncertain }))
  )
}

export default function Capture() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
  const [books, setBooks] = useState<BookWithCount[]>([])
  const [bookId, setBookId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [page, setPage] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [edited, setEdited] = useState<Record<number, string>>({})
  // 마지막으로 인코딩한 사진을 들고 있어야 "다시 인식" 이 다시 찍지 않아도 된다.
  const [lastBase64, setLastBase64] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 오프라인에서 찍어 둔 사진들. 연결되면 여기서 이어서 처리한다.
  const [pending, setPending] = useState<PendingCapture[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void listPending().then(setPending, () => undefined)
  }, [])

  async function refreshPending() {
    setPending(await listPending().catch(() => []))
  }

  // 갤러리 공유로 들어온 사진. 서비스워커가 Cache API 에 넣어 두고 여기로 보낸다.
  const shared = searchParams.get('shared')
  useEffect(() => {
    if (!shared) return
    // 쿼리를 지워서 새로고침해도 다시 집어오지 않게 한다.
    setSearchParams({}, { replace: true })
    if (shared === 'missed') {
      setStage({
        name: 'error',
        message: '공유된 사진을 받지 못했어요. 앱을 한 번 열어둔 뒤 다시 공유해 보세요.',
        canRetryOther: false,
      })
      return
    }
    void (async () => {
      const cache = await caches.open('share-inbox')
      const res = await cache.match('/__shared-photo')
      if (!res) return
      await cache.delete('/__shared-photo')
      const blob = await res.blob()
      const name = decodeURIComponent(res.headers.get('x-name') ?? 'shared.jpg')
      await handlePick(new File([blob], name, { type: blob.type }))
    })()
    // handlePick 은 렌더마다 새로 만들어지므로 shared 만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared])

  useEffect(() => {
    void listBooks().then(
      (rows) => {
        setBooks(rows)
        // 최근에 읽던 책이 기본 선택되어 있어야 탭 수가 준다.
        setBookId((current) => current ?? rows[0]?.id ?? null)
      },
      () => { /* 목록을 못 불러와도 새 책으로 저장할 수 있다 */ }
    )
  }, [])

  /** 성공하면 null, 실패하면 사용자에게 보여준 메시지를 돌려준다. */
  async function runOcr(base64: string, provider?: OcrProvider): Promise<string | null> {
    setStage({ name: 'working', label: '문장을 읽는 중…' })
    const result = await requestOcr(base64, provider)
    if (!result.ok) {
      setStage({
        name: 'error',
        message: result.message,
        detail: result.detail,
        // 한도/차단/못 읽음은 다른 공급자로 다시 해볼 만하다.
        canRetryOther: result.code !== 'bad-request' && result.code !== 'offline',
      })
      return result.message
    }
    const rows = toRows(result.paragraphs)
    // 밑줄은 고르는 행위다. 전부 켜 두면 '빼기'가 되어 버리므로 아무것도 고르지 않은 채 시작한다.
    setSelected(new Set())
    setEdited({})
    setStage((prev) => ({
      name: 'choose',
      rows,
      imagePath: prev.name === 'choose' ? prev.imagePath : null,
      pendingId: prev.name === 'choose' ? prev.pendingId : pendingRef.current,
    }))
    return null
  }

  // 지금 처리 중인 사진이 촬영 대기열에서 온 것이면 그 id. 저장이 끝나면 대기열에서 뺀다.
  // state 가 아니라 ref 인 이유: runOcr 이 setStage 안에서 읽는데, 그 시점의 state 는 낡았을 수 있다.
  const pendingRef = useRef<string | null>(null)

  async function handlePick(file: File) {
    setStage({ name: 'working', label: '사진을 준비하는 중…' })
    let prepared
    try {
      prepared = await preparePhoto(file)
    } catch (error) {
      const message =
        error instanceof PhotoError ? error.message : '사진을 준비하지 못했습니다.'
      setStage({ name: 'error', message, canRetryOther: false })
      return
    }
    await processPhoto(prepared.blob, prepared.base64, null)
  }

  /** 대기열의 사진을 이어서 처리한다. 이미 인코딩돼 있으므로 준비 단계가 없다. */
  async function resumePending(item: PendingCapture) {
    if (!navigator.onLine) {
      setNotice('아직 오프라인이에요. 연결되면 다시 눌러 주세요.')
      return
    }
    await processPhoto(item.blob, item.base64, item.id)
  }

  async function processPhoto(blob: Blob, base64: string, pendingId: string | null) {
    pendingRef.current = pendingId
    setLastBase64(base64)
    setNotice(null)

    // 오프라인이면 네트워크를 시도하는 대신 바로 대기열에 넣는다.
    // 지하철에서 찍은 사진이 사라지면 되돌릴 방법이 없다.
    if (!navigator.onLine) {
      void requestPersistence()
      if (!pendingId) await queueCapture(blob, base64)
      await refreshPending()
      setStage({ name: 'idle' })
      setNotice('지금은 오프라인이라 사진을 저장해 뒀어요. 연결되면 아래에서 이어서 처리할 수 있어요.')
      return
    }

    // 원본 보관과 문장 추출을 동시에 보낸다. allSettled 를 쓰는 이유:
    // 업로드가 실패해도 문장 추출은 계속돼야 하고, 반대도 마찬가지다.
    const uploadPromise = user
      ? uploadPagePhoto(blob, user.id).then(
          (path) => path,
          () => null
        )
      : Promise.resolve(null)

    const [uploaded, ocr] = await Promise.allSettled([uploadPromise, runOcr(base64)])
    const imagePath = uploaded.status === 'fulfilled' ? uploaded.value : null
    setStage((prev) => (prev.name === 'choose' ? { ...prev, imagePath } : prev))
    // OCR 이 실패했다. 대기열 사진이면 실패 사유를 남겨 둔다 — 사진은 그대로 남는다.
    const failure = ocr.status === 'fulfilled' ? ocr.value : '문장을 읽지 못했어요.'
    if (failure && pendingId) {
      await markPendingFailed(pendingId, failure).catch(() => undefined)
      await refreshPending()
    }
  }

  async function save() {
    if (stage.name !== 'choose') return
    setSaving(true)
    try {
      let targetBookId = bookId
      if (!targetBookId) {
        if (newTitle.trim() === '') {
          setSaving(false)
          return
        }
        const book = await createBook({ title: newTitle, author: newAuthor || null })
        targetBookId = book.id
      }
      const pageNumber = page.trim() === '' ? null : Number(page)
      const validPage = pageNumber !== null && Number.isFinite(pageNumber) ? pageNumber : null

      // 같은 문단에서 연달아 고른 문장은 하나의 밑줄로 합친다.
      const chosen = groupSelected(stage.rows, selected, edited).map((text) => ({
        book_id: targetBookId,
        text,
        page: validPage,
        image_path: stage.imagePath,
      }))

      await createHighlights(chosen)
      // 대기열에서 온 사진이면 이제 지운다. 저장 전에 지우면 실패 시 사진을 잃는다.
      if (stage.pendingId) await dropPending(stage.pendingId).catch(() => undefined)
      void navigate('/feed')
    } catch (error) {
      setStage({
        name: 'error',
        message: error instanceof Error ? error.message : '저장하지 못했습니다.',
        canRetryOther: false,
      })
    } finally {
      setSaving(false)
    }
  }

  if (stage.name === 'working') {
    return (
      <div className="px-5 py-16 text-center" aria-busy="true">
        <p className="text-sm text-muted">{stage.label}</p>
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-4 animate-pulse rounded bg-line" />
          ))}
        </div>
      </div>
    )
  }

  if (stage.name === 'error') {
    return (
      <div className="px-5 py-16">
        <p className="ko-prose rounded-xl bg-accent/10 p-4 text-sm text-accent" role="alert">
          {stage.message}
        </p>
        {stage.detail ? (
          <p className="mt-2 px-1 text-xs break-all text-muted">{stage.detail}</p>
        ) : null}
        <div className="mt-6 space-y-3">
          {stage.canRetryOther && lastBase64 ? (
            <button
              type="button"
              onClick={() => { void runOcr(lastBase64, 'claude') }}
              className="h-14 w-full rounded-xl bg-accent font-semibold text-white"
            >
              다른 방법으로 다시 인식
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { pendingRef.current = null; setStage({ name: 'idle' }) }}
            className="h-14 w-full rounded-xl border border-line bg-surface font-semibold"
          >
            다시 찍기
          </button>
        </div>
      </div>
    )
  }

  if (stage.name === 'choose') {
    return (
      <div className="px-5 pb-8">
        <header
          className="pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}
        >
          <h1 className="text-xl font-semibold">밑줄 그을 문장 고르기</h1>
          <p className="ko-prose mt-1 text-sm text-muted">
            문장을 탭해서 고르세요. 이어진 문장을 함께 고르면 하나로 저장돼요.
          </p>
        </header>

        <ul className="space-y-2">
          {stage.rows.map((row, index) => {
            const isOn = selected.has(index)
            const startsParagraph = index === 0 || stage.rows[index - 1]?.paragraph !== row.paragraph
            return (
              <li key={index} className={startsParagraph && index > 0 ? 'pt-3' : ''}>
                <div
                  className={`rounded-2xl border p-4 ${isOn ? 'border-accent bg-surface' : 'border-line bg-surface'}`}
                >
                  <button
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => {
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(index)) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    }}
                    className="block w-full text-left"
                  >
                    <span className={`ko-prose font-serif text-base ${isOn ? '' : 'text-muted'}`}>
                      {edited[index] ?? row.text}
                    </span>
                  </button>
                  {row.uncertain && startsParagraph ? (
                    <p className="mt-2 text-xs text-accent">이 문단은 흐릿해서 잘못 읽었을 수 있어요</p>
                  ) : null}
                  {isOn ? (
                    <textarea
                      value={edited[index] ?? row.text}
                      onChange={(e) => { setEdited((prev) => ({ ...prev, [index]: e.target.value })) }}
                      rows={3}
                      aria-label={`${String(index + 1)}번째 문장 고치기`}
                      className="ko-prose mt-3 w-full rounded-xl border border-line bg-bg p-3 font-serif"
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>

        <section className="mt-8 space-y-3">
          <label htmlFor="book" className="block text-sm font-medium">어느 책인가요?</label>
          <select
            id="book"
            value={bookId ?? ''}
            onChange={(e) => { setBookId(e.target.value === '' ? null : e.target.value) }}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3"
          >
            {books.map((book) => (
              <option key={book.id} value={book.id}>{book.title}</option>
            ))}
            <option value="">+ 새 책</option>
          </select>

          {bookId === null ? (
            <>
              <input
                value={newTitle}
                onChange={(e) => { setNewTitle(e.target.value) }}
                placeholder="제목"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3"
              />
              <input
                value={newAuthor}
                onChange={(e) => { setNewAuthor(e.target.value) }}
                placeholder="저자 (선택)"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3"
              />
            </>
          ) : null}

          <input
            value={page}
            onChange={(e) => { setPage(e.target.value) }}
            inputMode="numeric"
            placeholder="쪽 번호 (선택)"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3"
          />
        </section>

        <button
          type="button"
          disabled={saving || selected.size === 0}
          onClick={() => { void save() }}
          className="mt-6 h-16 w-full rounded-2xl bg-accent text-base font-semibold text-white disabled:opacity-40"
        >
          {saving ? '저장하는 중…' : selected.size === 0 ? '문장을 골라주세요' : `${String(selected.size)}개 문장에 밑줄`}
        </button>
      </div>
    )
  }

  return (
    <div className="px-5">
      <header className="pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
        <h1 className="text-xl font-semibold">문장 찍기</h1>
        <p className="ko-prose mt-1 text-sm text-muted">
          책 페이지를 찍으면 문장을 뽑아 드려요. 한 페이지씩 또렷하게 찍는 편이 잘 읽힙니다.
        </p>
      </header>
      <CaptureButtons onPick={(file) => { void handlePick(file) }} />
      {notice ? (
        <p className="ko-prose mt-4 rounded-xl bg-accent/10 p-3 text-sm text-accent" role="status">{notice}</p>
      ) : null}
      {pending.length > 0 ? (
        <PendingCaptures
          items={pending}
          onResume={(item) => { void resumePending(item) }}
          onDiscard={(item) => {
            if (!window.confirm('이 사진을 대기열에서 지울까요? 문장은 저장되지 않아요.')) return
            void dropPending(item.id).then(refreshPending)
          }}
        />
      ) : null}
    </div>
  )
}
