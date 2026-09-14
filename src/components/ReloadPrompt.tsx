import { useRegisterSW } from 'virtual:pwa-register/react'

// 한 시간마다 새 버전이 올라왔는지 확인한다.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000

/**
 * 서비스워커 업데이트 안내.
 *
 * useRegisterSW 의 옵션은 최초 1회만 캡처되고 반응하지 않으므로,
 * 이 컴포넌트는 앱 루트에 정확히 한 번만 마운트해야 한다.
 */
export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        void registration.update()
      }, UPDATE_CHECK_INTERVAL)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-3 z-50 flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-lg"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}
    >
      <p className="flex-1 text-sm">새 버전이 있어요.</p>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
      >
        새로고침
      </button>
    </div>
  )
}
