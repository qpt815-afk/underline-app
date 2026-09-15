import { Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider.tsx'
import Gate from './auth/Gate.tsx'
import ConfigError from './routes/ConfigError.tsx'
import { SUPABASE_CONFIG_ERROR } from './lib/supabase.ts'
import BottomNav from './components/BottomNav.tsx'
import ReloadPrompt from './components/ReloadPrompt.tsx'
import Home from './routes/Home.tsx'
import Library from './routes/Library.tsx'
import Feed from './routes/Feed.tsx'
import Capture from './routes/Capture.tsx'
import BookDetail from './routes/BookDetail.tsx'
import Diagnostics from './routes/Diagnostics.tsx'
import Settings from './routes/Settings.tsx'
import NotFound from './routes/NotFound.tsx'
import { useOutboxSync } from './lib/sync.ts'

export default function App() {
  // 환경변수가 없으면 인증을 시도해봐야 의미가 없다. 무엇이 빠졌는지 먼저 보여준다.
  if (SUPABASE_CONFIG_ERROR) {
    return <ConfigError detail={SUPABASE_CONFIG_ERROR} />
  }
  return (
    <AuthProvider>
      <Routes>
        {/* 자가 진단은 인증 게이트 밖에 둔다. 로그인이 깨졌을 때가 이 화면이
            가장 필요한 순간인데, 게이트 안에 있으면 그때 닿을 수 없다. */}
        <Route path="/diagnose" element={<Diagnostics />} />
        <Route
          path="*"
          element={
            <Gate>
              <AppShell />
            </Gate>
          }
        />
      </Routes>
      {/* 옵션이 최초 1회만 캡처되므로 앱 전체에서 한 번만 마운트한다 */}
      <ReloadPrompt />
    </AuthProvider>
  )
}

function AppShell() {
  // 로그인한 뒤에만 돈다. 오프라인에서 한 수정을 연결이 돌아오면 서버에 보낸다.
  useOutboxSync()
  return (
    // 100dvh 는 주소창이 접히는 문제를 해결한다. 키보드는 별개 문제라
    // index.html 의 interactive-widget=resizes-content 가 맡는다.
    <div className="min-h-dvh bg-bg">
      {/* 하단 탭(3.5rem) + 홈 인디케이터 높이만큼 본문 아래를 비워 둔다 */}
      <main
        className="mx-auto max-w-lg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 3.5rem)' }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
