/**
 * "오늘의 문장" 을 하루 동안 고정해서 뽑기 위한 유틸.
 *
 * 날짜를 시드로 쓰므로 같은 날에는 항상 같은 문장이 나오고,
 * 서버에 상태를 두지 않아도 된다.
 */

/**
 * 사용자의 로컬 시간대 기준 YYYY-MM-DD.
 *
 * toISOString() 은 UTC 로 바꿔버리므로 한국(UTC+9)에서는 오전 9시 이전에
 * 전날 날짜가 나온다. 그러면 아침에 앱을 열 때마다 어제 문장이 뜬다.
 * en-CA 로케일이 YYYY-MM-DD 형식을 주므로 그걸 쓴다.
 */
export function localDateKey(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA')
}

/** 문자열을 32비트 정수 시드로. (FNV-1a) */
function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 — 작고 분포가 고른 시드 기반 난수. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 후보 중 하나를 날짜 기반으로 고른다.
 *
 * @param candidates 뽑을 대상
 * @param dateKey    localDateKey() 결과
 * @param nonce      "다른 문장 보기" 를 누른 횟수. 같은 날에도 다른 결과가 나오게 한다.
 */
export function pickForDate<T>(candidates: readonly T[], dateKey: string, nonce = 0): T | null {
  if (candidates.length === 0) return null
  const random = mulberry32(hashString(`${dateKey}#${String(nonce)}`))
  const index = Math.floor(random() * candidates.length)
  // 부동소수점 때문에 아주 드물게 길이와 같아질 수 있다.
  return candidates[Math.min(index, candidates.length - 1)] ?? null
}
