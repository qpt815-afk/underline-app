import { Route, Routes } from 'react-router'
import BottomNav from './components/BottomNav.tsx'
import ReloadPrompt from './components/ReloadPrompt.tsx'
import Home from './routes/Home.tsx'
import Library from './routes/Library.tsx'
import Feed from './routes/Feed.tsx'
import Settings from './routes/Settings.tsx'
import NotFound from './routes/NotFound.tsx'

export default function App() {
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
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomNav />
      {/* 옵션이 최초 1회만 캡처되므로 앱 전체에서 한 번만 마운트한다 */}
      <ReloadPrompt />
    </div>
  )
}
