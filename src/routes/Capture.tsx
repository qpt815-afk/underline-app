import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import CaptureButtons from '../components/CaptureButtons.tsx'
import { preparePhoto } from '../lib/photo/preparePhoto.ts'
import { PhotoError } from '../lib/photo/encodePhoto.ts'
import { requestOcr } from '../lib/ocrClient.ts'
import type { OcrProvider } from '../lib/ocrClient.ts'
import { uploadPagePhoto } from '../lib/storage.ts'
import { listBooks, createBook, createHighlights } from '../lib/books.ts'
import type { BookWithCount, ExtractedParagraph } from '../lib/types.ts'
import { useAuth } from '../auth/AuthProvider.tsx'

type Stage =
  | { name: 'idle' }
  | { name: 'working'; label: string }
  | { name: 'error'; message: string; canRetryOther: boolean }
  | { name: 'choose'; paragraphs: ExtractedParagraph[]; imagePath: string | null }

export default function Capture() {
  const navigate = useNavigate()
  const { user } = useAuth()
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

  async function runOcr(base64: string, provider?: OcrProvider) {
    setStage({ name: 'working', label: '문장을 읽는 중…' })
    const result = await requestOcr(base64, provider)
    if (!result.ok) {
      setStage({
        name: 'error',
        message: result.message,
        // 한도/차단/못 읽음은 다른 공급자로 다시 해볼 만하다.
        canRetryOther: result.code !== 'bad-request' && result.code !== 'offline',
      })
      return
    }
    setSelected(new Set(result.paragraphs.map((_, i) => i)))
    setEdited({})
    setStage((prev) => ({
      name: 'choose',
      paragraphs: result.paragraphs,
      imagePath: prev.name === 'choose' ? prev.imagePath : null,
    }))
  }

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
    setLastBase64(prepared.base64)

    // 원본 보관과 문장 추출을 동시에 보낸다. allSettled 를 쓰는 이유:
    // 업로드가 실패해도 문장 추출은 계속돼야 하고, 반대도 마찬가지다.
    const uploadPromise = user
      ? uploadPagePhoto(prepared.blob, user.id).then(
          (path) => path,
          () => null
        )
      : Promise.resolve(null)

    const [uploaded] = await Promise.allSettled([uploadPromise, runOcr(prepared.base64)])
    const imagePath = uploaded.status === 'fulfilled' ? uploaded.value : null
    setStage((prev) => (prev.name === 'choose' ? { ...prev, imagePath } : prev))
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
      const chosen = [...selected]
        .sort((a, b) => a - b)
        .map((index) => ({
          book_id: targetBookId,
          text: edited[index] ?? stage.paragraphs[index]?.text ?? '',
          page: pageNumber !== null && Number.isFinite(pageNumber) ? pageNumber : null,
          image_path: stage.imagePath,
        }))
        .filter((h) => h.text.trim() !== '')

      await createHighlights(chosen)
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
            onClick={() => { setStage({ name: 'idle' }) }}
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
          <h1 className="text-xl font-semibold">저장할 문장 고르기</h1>
          <p className="mt-1 text-sm text-muted">탭해서 고르고, 글자를 눌러 고칠 수 있어요.</p>
        </header>

        <ul className="space-y-3">
          {stage.paragraphs.map((paragraph, index) => {
            const isOn = selected.has(index)
            return (
              <li key={index}>
                <div
                  className={`rounded-2xl border p-4 ${isOn ? 'border-accent bg-surface' : 'border-line bg-surface opacity-60'}`}
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
                    <span className="ko-prose font-serif text-base">
                      {edited[index] ?? paragraph.text}
                    </span>
                  </button>
                  {paragraph.uncertain ? (
                    <p className="mt-2 text-xs text-accent">흐릿해서 잘못 읽었을 수 있어요</p>
                  ) : null}
                  {isOn ? (
                    <textarea
                      value={edited[index] ?? paragraph.text}
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
          {saving ? '저장하는 중…' : `${String(selected.size)}개 문장 저장`}
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
    </div>
  )
}
