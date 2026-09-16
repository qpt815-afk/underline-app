import { useEffect, useMemo, useState } from 'react'
import BarcodeScanner from './BarcodeScanner.tsx'
import { isBarcodeScanSupported } from '../lib/barcode.ts'
import { lookupIsbn, normalizeIsbn } from '../lib/isbn.ts'
import type { LookedUpBook } from '../lib/isbn.ts'

interface Props {
  /** 찾은 책을 쓰기로 했을 때. 표지는 JPEG Blob 이거나 null. */
  onPick: (book: LookedUpBook) => void
}

type Stage =
  | { name: 'idle' }
  | { name: 'scanning' }
  | { name: 'looking'; isbn: string }
  | { name: 'found'; book: LookedUpBook }
  | { name: 'error'; message: string; detail?: string }

/**
 * 바코드 스캔 또는 ISBN 입력 → 책 정보 조회 → 미리보기 → 확정.
 * 촬영 화면의 "새 책" 과 서재의 "책 추가" 가 같이 쓴다.
 */
export default function BookLookup({ onPick }: Props) {
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
  const [manual, setManual] = useState('')
  // 지원 여부는 바뀌지 않으니 한 번만 본다.
  const [canScan] = useState(isBarcodeScanSupported)

  async function find(isbn13: string) {
    setStage({ name: 'looking', isbn: isbn13 })
    const result = await lookupIsbn(isbn13)
    if (!result.ok) {
      setStage({ name: 'error', message: result.message, detail: result.detail })
      return
    }
    setStage({ name: 'found', book: result.book })
  }

  function submitManual() {
    const isbn = normalizeIsbn(manual)
    if (!isbn) {
      setStage({ name: 'error', message: 'ISBN 형식이 아니에요. 978 또는 979 로 시작하는 13자리(또는 10자리) 숫자예요.' })
      return
    }
    void find(isbn)
  }

  return (
    <div className="space-y-3">
      {stage.name === 'scanning' ? (
        <BarcodeScanner onDetected={(isbn) => { void find(isbn) }} onClose={() => { setStage({ name: 'idle' }) }} />
      ) : null}

      {stage.name === 'looking' ? (
        <p className="ko-prose text-sm text-muted" aria-busy="true">{stage.isbn} 의 책 정보를 찾는 중…</p>
      ) : null}

      {stage.name === 'found' ? <FoundCard book={stage.book} onPick={onPick} onRetry={() => { setStage({ name: 'idle' }) }} /> : null}

      {stage.name === 'error' ? (
        <div>
          <p className="ko-prose rounded-xl bg-accent/10 p-3 text-sm text-accent" role="alert">{stage.message}</p>
          {stage.detail ? <p className="mt-1 px-1 text-xs break-all text-muted">{stage.detail}</p> : null}
        </div>
      ) : null}

      {stage.name !== 'scanning' && stage.name !== 'looking' ? (
        <div className="flex gap-2">
          {canScan ? (
            <button
              type="button"
              onClick={() => { setStage({ name: 'scanning' }) }}
              className="h-12 shrink-0 rounded-xl border border-line bg-surface px-4 text-sm font-semibold"
            >
              바코드 스캔
            </button>
          ) : null}
          <input
            value={manual}
            onChange={(e) => { setManual(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitManual() } }}
            inputMode="numeric"
            placeholder="ISBN 직접 입력"
            aria-label="ISBN"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-sm"
          />
          <button
            type="button"
            onClick={submitManual}
            disabled={manual.trim() === ''}
            className="h-12 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            찾기
          </button>
        </div>
      ) : null}
    </div>
  )
}

function FoundCard({ book, onPick, onRetry }: { book: LookedUpBook; onPick: (book: LookedUpBook) => void; onRetry: () => void }) {
  const coverUrl = useMemo(() => (book.cover ? URL.createObjectURL(book.cover) : null), [book.cover])
  useEffect(() => () => { if (coverUrl) URL.revokeObjectURL(coverUrl) }, [coverUrl])
  return (
    <div className="flex gap-4 rounded-2xl border border-accent bg-surface p-4">
      <span className="block h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-line">
        {coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="ko-prose font-serif text-base">{book.title}</p>
        <p className="ko-prose mt-0.5 text-sm text-muted">
          {[book.author, book.publisher].filter(Boolean).join(' · ') || '저자 정보 없음'}
        </p>
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={() => { onPick(book) }} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            이 책으로
          </button>
          <button type="button" onClick={onRetry} className="px-2 py-2 text-sm text-muted">다시 찾기</button>
        </div>
      </div>
    </div>
  )
}
