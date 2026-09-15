import { useEffect } from 'react'
import { supabase } from './supabase.ts'
import { dropOutbox, listOutbox, markOutboxFailed } from './db.ts'
import type { OutboxOp } from './db.ts'
import { isNetworkError } from './offline.ts'

/**
 * 쓰기 대기열을 서버로 흘려보낸다.
 *
 * 순서대로 하나씩. 성공하면 지우고, 네트워크 때문에 실패하면 거기서 멈춘다
 * (뒤의 것도 어차피 실패한다). 서버가 거절하면(이미 지워진 행, 권한) 그 항목은
 * 버린다 — 다시 보내도 결과가 같고, 하나가 영원히 막혀 뒤를 다 붙들면 안 된다.
 *
 * 충돌 정책은 "마지막 쓰기가 이긴다". 한 사람이 한두 기기에서 쓰는 앱이라
 * 그걸로 충분하고, 더 정교한 병합은 필요 이상의 추상화다.
 */

/** 대기열이 비워지거나 바뀌었을 때 화면이 다시 읽도록 알린다. */
export const SYNC_EVENT = 'underline:synced'

async function apply(op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case 'highlight.update': {
      const { error } = await supabase.from('highlights').update(op.patch).eq('id', op.id)
      if (error) throw new Error(error.message)
      return
    }
    case 'highlight.delete': {
      const { error } = await supabase.from('highlights').delete().eq('id', op.id)
      if (error) throw new Error(error.message)
      return
    }
    case 'book.update': {
      const { error } = await supabase.from('books').update(op.patch).eq('id', op.id)
      if (error) throw new Error(error.message)
      return
    }
    case 'book.delete': {
      const { error } = await supabase.from('books').delete().eq('id', op.id)
      if (error) throw new Error(error.message)
      return
    }
  }
}

let flushing: Promise<number> | null = null

/** 보낸 개수를 돌려준다. 이미 돌고 있으면 그 결과를 같이 기다린다. */
export function flushOutbox(): Promise<number> {
  if (flushing) return flushing
  flushing = (async () => {
    let sent = 0
    try {
      if (!navigator.onLine) return 0
      const items = await listOutbox()
      for (const item of items) {
        try {
          await apply(item.op)
          await dropOutbox(item.id)
          sent++
        } catch (error) {
          if (isNetworkError(error)) {
            await markOutboxFailed(item.id, '연결 없음')
            break
          }
          // 서버가 거절했다. 버리고 다음으로.
          console.warn('[sync] 버림:', item.op.kind, error)
          await dropOutbox(item.id)
        }
      }
      return sent
    } finally {
      flushing = null
      if (sent > 0) window.dispatchEvent(new Event(SYNC_EVENT))
    }
  })()
  return flushing
}

/**
 * 앱이 떠 있는 동안 연결이 돌아오면 밀린 쓰기를 보낸다.
 * 시작할 때 한 번, online 이벤트마다, 그리고 앱이 다시 앞으로 올 때마다.
 * (안드로이드는 백그라운드에서 online 이벤트를 놓치는 일이 있다.)
 */
export function useOutboxSync(): void {
  useEffect(() => {
    const run = () => { void flushOutbox() }
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    run()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
