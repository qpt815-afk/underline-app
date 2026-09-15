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
    denylist: [/^\/api\//, /^\/share-target$/, /^\/manifest\.webmanifest$/],
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

/**
 * Share Target: 갤러리에서 "공유 → 밑줄" 로 온 사진을 받는다.
 *
 * 반드시 경로로 좁혀야 한다. 메서드만 보고 모든 POST 를 가로채면 Supabase 와
 * OCR 요청까지 삼킨다. 사진은 Cache API 에 넣고 303 으로 앱에 보낸다 — 200 을
 * 돌려주면 POST 가 히스토리에 남아 당겨서 새로고침하면 사진이 다시 제출된다.
 * Cache API 는 워커가 죽거나 페이지가 새로고침돼도 살아남는다.
 */
const SHARE_CACHE = 'share-inbox'
const SHARE_KEY = '/__shared-photo'

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const file = form.get('photo')
        if (file instanceof File) {
          const cache = await caches.open(SHARE_CACHE)
          await cache.put(
            SHARE_KEY,
            new Response(file, { headers: { 'content-type': file.type || 'image/jpeg', 'x-name': encodeURIComponent(file.name) } })
          )
          return Response.redirect('/capture?shared=1', 303)
        }
      } catch {
        // formData 파싱 실패 — accept 가 어긋났거나 파일이 없다.
      }
      return Response.redirect('/capture?shared=missed', 303)
    })()
  )
})

// Phase 3 의 웹 푸시(push / notificationclick 핸들러)가 여기에 들어간다.
