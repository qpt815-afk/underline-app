/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// __WB_MANIFEST 는 빌드 시 vite-plugin-pwa 가 주입한다.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// 이 한 줄을 빠뜨리면 빌드는 그대로 성공하고 오프라인 셸만 조용히 죽는다.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA 내비게이션 폴백. /api 를 제외하지 않으면 서버리스 함수 호출이
// index.html 로 응답되어 JSON 을 기대하는 쪽에서 파싱 오류가 난다.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/manifest\.webmanifest$/],
  })
)

// registerType: 'prompt' 이므로 스스로 활성화하지 않는다.
// 사용자가 "새로고침"을 누르면 앱이 SKIP_WAITING 을 보낸다.
function isSkipWaiting(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'SKIP_WAITING'
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (isSkipWaiting(event.data)) {
    void self.skipWaiting()
  }
})

// Phase 2 의 Share Target(fetch 핸들러)과 Phase 3 의 웹 푸시
// (push / notificationclick 핸들러)가 여기에 들어간다.
