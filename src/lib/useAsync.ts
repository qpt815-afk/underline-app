import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

/**
 * 로딩 / 에러 / 완료를 구분해서 들고 있는다.
 *
 * 굳이 세 상태를 나누는 이유: supabase 는 RLS 로 막힌 행을 에러가 아니라 빈 배열로
 * 돌려주므로, "아직 없음" 과 "못 불러옴" 을 UI 가 구분해야 빈 상태 화면이
 * 진짜 문제를 가리지 않는다.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): {
  state: AsyncState<T>
  reload: () => void
} {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => { setNonce((n) => n + 1) }, [])

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    load().then(
      (data) => { if (alive) setState({ status: 'ready', data }) },
      (error: unknown) => {
        if (alive) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : '불러오지 못했습니다.',
          })
        }
      }
    )
    return () => { alive = false }
    // load 는 매 렌더 새로 만들어지므로 의도적으로 deps 만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { state, reload }
}
