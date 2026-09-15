import { enqueueOutbox } from './db.ts'
import type { OutboxOp } from './db.ts'

/**
 * 네트워크가 끊겨서 난 에러인지. supabase-js 는 fetch 실패를 던지지 않고
 * `{ message: 'TypeError: Failed to fetch' }` 꼴의 에러 객체로 돌려주며,
 * 우리 unwrap 이 그걸 Error 로 다시 던진다. 메시지로 가릴 수밖에 없다.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|ERR_INTERNET_DISCONNECTED/i.test(message)
}

export type WriteResult = 'saved' | 'queued'

/**
 * 온라인이면 서버에 쓰고, 아니면(또는 쓰다 끊기면) 캐시에 반영한 뒤 대기열에 넣는다.
 *
 * 서버 오류(권한, 없는 행)는 대기열에 넣지 않고 그대로 던진다 — 다시 보내도
 * 똑같이 실패할 것이고, 사용자가 알아야 한다.
 */
export async function writeOrQueue(
  op: OutboxOp,
  run: () => Promise<void>,
  applyLocally: () => Promise<void>
): Promise<WriteResult> {
  const queue = async (): Promise<WriteResult> => {
    await applyLocally().catch(() => undefined)
    await enqueueOutbox(op)
    return 'queued'
  }
  if (!navigator.onLine) return queue()
  try {
    await run()
    return 'saved'
  } catch (error) {
    if (isNetworkError(error)) return queue()
    throw error
  }
}
