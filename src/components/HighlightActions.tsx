import { useState } from 'react'
import { updateHighlight } from '../lib/books.ts'
import { renderCardImage } from '../lib/cardImage.ts'
import { copyText, shareOrDownloadFile, shareText } from '../lib/share.ts'
import type { Highlight } from '../lib/types.ts'

interface Props {
  highlight: Highlight
  bookTitle?: string | null
  author?: string | null
  onChanged: () => void
  onDelete: () => void
}

type Busy = null | 'image' | 'save'

/**
 * 문장 카드 아래의 동작들. 길게 누르기 메뉴 대신 보이는 버튼 — 폰에서 발견하기 쉽고
 * 스크롤과 충돌하지 않는다.
 */
export default function HighlightActions({ highlight, bookTitle, author, onChanged, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(highlight.note ?? '')
  const [tags, setTags] = useState(highlight.tags.join(', '))
  const [busy, setBusy] = useState<Busy>(null)
  const [toast, setToast] = useState<string | null>(null)

  function flash(message: string) {
    setToast(message)
    setTimeout(() => { setToast(null) }, 1800)
  }

  const attribution = [bookTitle, author].filter(Boolean).join(' · ')
  const shareBody = attribution ? `${highlight.text}\n\n— ${attribution}` : highlight.text

  async function copy() {
    flash((await copyText(shareBody)) ? '복사했어요' : '복사하지 못했어요')
  }

  async function share() {
    const result = await shareText(shareBody, bookTitle ?? '밑줄')
    if (result === 'copied') flash('공유가 안 돼서 복사했어요')
    else if (result === 'failed') flash('공유하지 못했어요')
  }

  async function image() {
    setBusy('image')
    try {
      const blob = await renderCardImage({ text: highlight.text, bookTitle, author })
      const file = new File([blob], `밑줄-${highlight.id.slice(0, 8)}.png`, { type: 'image/png' })
      const result = await shareOrDownloadFile(file, bookTitle ?? '밑줄')
      if (result === 'downloaded') flash('이미지를 저장했어요')
      else if (result === 'failed') flash('이미지를 만들지 못했어요')
    } catch {
      flash('이미지를 만들지 못했어요')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    try {
      const tagList = tags
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter((t) => t !== '')
      await updateHighlight(highlight.id, { note: note.trim() || null, tags: [...new Set(tagList)] })
      setEditing(false)
      onChanged()
    } catch (error) {
      flash(error instanceof Error ? error.message : '저장하지 못했어요')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value) }}
            rows={2}
            placeholder="메모"
            className="ko-prose w-full rounded-xl border border-line bg-bg p-3 text-sm"
          />
          <input
            value={tags}
            onChange={(e) => { setTags(e.target.value) }}
            placeholder="태그 (쉼표로 구분)"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setEditing(false) }} className="px-2 py-2 text-sm text-muted">
              취소
            </button>
            <button
              type="button"
              disabled={busy === 'save'}
              onClick={() => { void save() }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy === 'save' ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-xs text-muted">
          <Action label="메모" onClick={() => { setEditing(true) }} />
          <Action label="복사" onClick={() => { void copy() }} />
          <Action label="공유" onClick={() => { void share() }} />
          <Action label={busy === 'image' ? '만드는 중…' : '이미지'} onClick={() => { void image() }} disabled={busy === 'image'} />
          <span className="flex-1" />
          <Action label="삭제" onClick={onDelete} />
        </div>
      )}
      {toast ? (
        <p role="status" className="mt-2 text-xs text-accent">{toast}</p>
      ) : null}
    </div>
  )
}

function Action({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // 터치 목표는 44px 이상. 글자는 작게, 누르는 영역은 넓게.
      className="-my-2 px-2 py-3 disabled:opacity-40"
    >
      {label}
    </button>
  )
}
