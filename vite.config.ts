import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest 로 시작하는 이유:
      // generateSW 가 만드는 워커에는 message 리스너뿐이라 웹 푸시(Phase 3)도
      // Share Target(Phase 2)도 붙일 수 없다. 나중에 갈아타려면 이미 폰에 설치된
      // PWA 를 상대로 워커를 통째로 교체해야 하므로 처음부터 직접 관리한다.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt': 새 버전을 자동 적용하지 않고 사용자가 누를 때 리로드한다.
      // 문장을 고르는 중에 리로드되면 작업이 날아가므로 autoUpdate 를 쓰지 않는다.
      registerType: 'prompt',
      injectRegister: null,
      injectManifest: {
        // 기본값은 js/wasm/css/html 뿐이라 아이콘과 폰트가 프리캐시되지 않는다.
        // 그러면 오프라인에서 앱이 대체 폰트로, 아이콘 없이 뜬다.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // 본문 세리프(Noto Serif KR)가 약 950KB 라 기본 2MiB 한도 안에 들어오지만,
        // 한도를 넘으면 경고가 아니라 빌드 실패이므로 여유를 명시해 둔다.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: '밑줄',
        short_name: '밑줄',
        description: '책에서 만난 문장을 찍어 모아두는 앱',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // index.html 의 light 용 theme-color 와 반드시 같아야 한다
        theme_color: '#FAF8F4',
        background_color: '#FAF8F4',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
