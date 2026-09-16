import { supabase } from './supabase.ts'

/**
 * ISBN 다루기와 책 정보 조회.
 *
 * 책 뒤표지 바코드(EAN-13)는 978/979 로 시작하는 ISBN-13 그 자체다.
 * 옛 책의 ISBN-10 을 손으로 넣을 수도 있으므로 13자리로 맞춰서 서버에 보낸다.
 */

function checksum13(digits12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

export function isValidIsbn13(value: string): boolean {
  if (!/^97[89]\d{10}$/.test(value)) return false
  return checksum13(value.slice(0, 12)) === Number(value[12])
}

function isValidIsbn10(value: string): boolean {
  if (!/^\d{9}[\dXx]$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(value[i]) * (10 - i)
  const last = value[9] === 'X' || value[9] === 'x' ? 10 : Number(value[9])
  return (sum + last) % 11 === 0
}

/** 사람이 친 값(하이픈·공백 섞임, 10자리)을 검증된 ISBN-13 으로. 아니면 null. */
export function normalizeIsbn(input: string): string | null {
  const raw = input.replace(/[^0-9Xx]/g, '')
  if (raw.length === 13) return isValidIsbn13(raw) ? raw : null
  if (raw.length === 10 && isValidIsbn10(raw)) {
    const body = `978${raw.slice(0, 9)}`
    return `${body}${String(checksum13(body))}`
  }
  return null
}

export interface LookedUpBook {
  isbn: string
  title: string
  author: string | null
  publisher: string | null
  /** JPEG 로 바꾼 표지. 못 받았거나 못 바꿨으면 null. */
  cover: Blob | null
}

export interface LookupFail {
  ok: false
  code: string
  message: string
  detail?: string
}

export type LookupResponse = { ok: true; book: LookedUpBook } | LookupFail

/**
 * 어떤 형식으로 오든 표지는 JPEG 으로 통일한다. Storage 의 uploadCover 가 JPEG 을
 * 전제하기 때문이다. 디코드에 실패하면(깨진 이미지) 표지 없이 진행한다.
 */
export async function toJpeg(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob)
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return null
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0)
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export async function lookupIsbn(isbn13: string): Promise<LookupResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, code: 'unauthorized', message: '로그인이 필요해요.' }

  let response: Response
  try {
    response = await fetch(`/api/book?isbn=${encodeURIComponent(isbn13)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  } catch {
    return { ok: false, code: 'offline', message: '서버에 닿지 못했어요. 연결을 확인해 주세요.' }
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return { ok: false, code: 'upstream', message: `서버가 JSON 이 아닌 응답을 보냈어요 (${String(response.status)}).` }
  }
  const body = (await response.json()) as
    | { ok: true; book: { isbn: string; title: string; author: string | null; publisher: string | null; cover: { mimeType: string; base64: string } | null } }
    | LookupFail
  if (!body.ok) return body

  const cover = body.book.cover ? await toJpeg(base64ToBlob(body.book.cover.base64, body.book.cover.mimeType)) : null
  return {
    ok: true,
    book: { isbn: body.book.isbn, title: body.book.title, author: body.book.author, publisher: body.book.publisher, cover },
  }
}
