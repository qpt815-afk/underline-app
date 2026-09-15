import { useEffect, useState } from 'react'
import { signedPhotoUrl } from '../lib/storage.ts'

/** 경로 → 서명 URL 캐시. 목록에서 같은 표지를 여러 번 만들지 않게. */
const urlCache = new Map<string, Promise<string>>()

function resolve(path: string): Promise<string> {
  let p = urlCache.get(path)
  if (!p) {
    p = signedPhotoUrl(path, 60 * 60)
    urlCache.set(path, p)
    // 실패는 캐시하지 않는다 — 다음에 다시 시도할 수 있게.
    p.catch(() => { urlCache.delete(path) })
  }
  return p
}

/** 표지가 바뀐 뒤 옛 URL 을 버린다. */
export function forgetCover(path: string) {
  urlCache.delete(path)
}

interface Props {
  path: string | null
  title: string
  className?: string
}

/**
 * 비공개 버킷이라 서명 URL 을 만들어 보여준다.
 * 표지가 없으면 제목 첫 글자를 넣은 자리표시자를 그린다 — 표지는 필수가 아니다.
 */
export default function CoverImage(props: Props) {
  // path 가 바뀌면 통째로 다시 마운트해서 이전 표지가 잠깐 남지 않게 한다.
  return <Inner key={props.path ?? ''} {...props} />
}

function Inner({ path, title, className = '' }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) return
    let alive = true
    resolve(path).then(
      (u) => { if (alive) setUrl(u) },
      () => { /* 자리표시자로 남긴다 */ }
    )
    return () => { alive = false }
  }, [path])

  if (url) {
    return <img src={url} alt="" className={`object-cover ${className}`} />
  }
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center bg-line font-serif text-2xl text-muted ${className}`}
    >
      {title.trim().charAt(0)}
    </div>
  )
}
