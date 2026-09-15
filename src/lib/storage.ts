import { supabase } from './supabase.ts'

const BUCKET = 'page-photos'

/**
 * 원본 사진을 보관한다.
 *
 * 경로는 반드시 <user_id>/... 로 시작해야 한다. Storage 정책이 첫 폴더 이름을
 * JWT 의 sub 와 비교하기 때문이다. 다르면 조용히 거절된다.
 */
export async function uploadPagePhoto(blob: Blob, userId: string): Promise<string> {
  // 파일명 충돌을 피하면서 시간순 정렬이 되도록 타임스탬프를 앞에 둔다.
  const name = `${Date.now().toString()}-${crypto.randomUUID().slice(0, 8)}.jpg`
  const path = `${userId}/${name}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    // 같은 경로가 이미 있으면 실패시킨다. 덮어쓸 이유가 없다.
    upsert: false,
    cacheControl: '31536000',
  })
  if (error) throw new Error(error.message)
  return path
}

/** 비공개 버킷이므로 볼 때마다 서명된 URL 을 만든다. */
export async function signedPhotoUrl(path: string, expiresInSec = 60 * 60): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSec)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/**
 * 책 표지. 같은 책은 같은 경로에 덮어쓴다 — 표지를 바꿔도 낡은 파일이 쌓이지 않게.
 * 사진 파이프라인을 그대로 쓰므로 1600px JPEG 이다.
 */
export async function uploadCover(blob: Blob, userId: string, bookId: string): Promise<string> {
  const path = `${userId}/covers/${bookId}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
    // 덮어쓴 뒤 옛 표지가 캐시에 남지 않도록 짧게.
    cacheControl: '60',
  })
  if (error) throw new Error(error.message)
  return path
}
