/**
 * VAPID 키 쌍을 브라우저에서 만든다.
 *
 * 로컬 컴퓨터가 없는 사람을 위한 것이다. `npx web-push generate-vapid-keys` 를 돌릴
 * 터미널이 없으니 폰의 WebCrypto 로 만든다. 키는 폰 밖으로 나가지 않는다 —
 * 화면에 보여주면 Vercel 환경변수에 붙여넣는다.
 *
 * 형식은 web-push 가 기대하는 것과 같다:
 *   공개키 = P-256 점을 압축하지 않은 65바이트를 base64url
 *   비밀키 = 32바이트 스칼라를 base64url (JWK 의 d 가 정확히 그 값이다)
 */
export interface VapidKeyPair {
  publicKey: string
  privateKey: string
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generateVapidKeys(): Promise<VapidKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  if (raw.length !== 65 || !jwk.d) throw new Error('키 생성에 실패했어요. 다시 눌러 주세요.')
  return { publicKey: base64url(raw), privateKey: jwk.d }
}
