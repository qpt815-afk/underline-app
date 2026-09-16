import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import PageHeader from '../components/PageHeader.tsx'
import BookLookup from '../components/BookLookup.tsx'
import { createBook, updateBook } from '../lib/books.ts'
import { uploadCover } from '../lib/storage.ts'
import { useAuth } from '../auth/AuthProvider.tsx'

/**
 * 서재에 책을 먼저 등록한다. 문장 없이도 "읽고 싶음" 으로 넣어 둘 수 있게.
 * 바코드로 채우거나 제목을 직접 친다.
 */
export default function NewBook() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [cover, setCover] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const coverUrl = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover])
  useEffect(() => () => { if (coverUrl) URL.revokeObjectURL(coverUrl) }, [coverUrl])

  async function save() {
    if (title.trim() === '' || !user) return
    setSaving(true)
    setError(null)
    try {
      const book = await createBook({ title, author: author || null })
      if (cover) {
        // 표지는 덤이다. 실패해도 책은 이미 있으니 조용히 넘어간다.
        try {
          const path = await uploadCover(cover, user.id, book.id)
          await updateBook(book.id, { cover_path: path })
        } catch {
          // 표지 없이 진행
        }
      }
      void navigate(`/book/${book.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '책을 추가하지 못했어요.')
      setSaving(false)
    }
  }

  return (
    <div className="pb-8">
      <PageHeader title="책 추가" />
      <div className="space-y-6 px-5">
        <section>
          <p className="ko-prose text-sm text-muted">책 뒤표지의 바코드를 비추면 제목·저자·표지가 채워져요.</p>
          <div className="mt-3">
            <BookLookup
              onPick={(book) => {
                setTitle(book.title)
                setAuthor(book.author ?? '')
                setCover(book.cover)
              }}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex gap-4">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
            ) : null}
            <div className="min-w-0 flex-1 space-y-3">
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value) }}
                placeholder="제목"
                aria-label="제목"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3"
              />
              <input
                value={author}
                onChange={(e) => { setAuthor(e.target.value) }}
                placeholder="저자 (선택)"
                aria-label="저자"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3"
              />
            </div>
          </div>
          {error ? <p className="ko-prose rounded-xl bg-accent/10 p-3 text-sm text-accent" role="alert">{error}</p> : null}
          <button
            type="button"
            disabled={saving || title.trim() === ''}
            onClick={() => { void save() }}
            className="h-14 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
          >
            {saving ? '추가하는 중…' : '서재에 추가'}
          </button>
        </section>
      </div>
    </div>
  )
}
