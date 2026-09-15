import { useEffect, useMemo } from 'react'
import type { PendingCapture } from '../lib/db.ts'

interface Props {
  items: PendingCapture[]
  onResume: (item: PendingCapture) => void
  onDiscard: (item: PendingCapture) => void
}

/** 오프라인에서 찍어 둔 사진 목록. 촬영 화면 아래에 붙는다. */
export default function PendingCaptures({ items, onResume, onDiscard }: Props) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-muted">
        연결이 없을 때 찍어 둔 사진 {items.length}장
      </h2>
      <p className="ko-prose mt-1 text-xs text-muted">눌러서 문장을 뽑고 저장하세요. 저장하면 여기서 사라져요.</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <Thumb blob={item.blob} />
            <button type="button" onClick={() => { onResume(item) }} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-medium">{formatWhen(item.createdAt)}</span>
              <span className="ko-prose block text-xs text-muted">
                {item.lastError ? `지난번 실패: ${item.lastError}` : '이어서 처리하기'}
              </span>
            </button>
            <button type="button" onClick={() => { onDiscard(item) }} className="px-2 py-3 text-xs text-muted">
              지우기
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Blob 미리보기. object URL 은 만든 만큼 반드시 풀어야 메모리가 새지 않는다. */
function Thumb({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => { URL.revokeObjectURL(url) }, [url])
  return (
    <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-line">
      <img src={url} alt="" className="h-full w-full object-cover" />
    </span>
  )
}

function formatWhen(ts: number): string {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  return today ? `오늘 ${time}` : `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${time}`
}
