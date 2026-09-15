import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import PageHeader from '../components/PageHeader.tsx'
import { isStandalone, useInstallPrompt } from '../lib/pwa.ts'
import { supabase } from '../lib/supabase.ts'
import { clearCache, listPending } from '../lib/db.ts'
import { useAuth } from '../auth/AuthProvider.tsx'

type HealthState = { status: 'idle' | 'loading' } | { status: 'done'; text: string }

export default function Settings() {
  const { canInstall, installed, promptInstall } = useInstallPrompt()
  const { user } = useAuth()
  const [health, setHealth] = useState<HealthState>({ status: 'idle' })
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  useEffect(() => {
    void listPending().then(
      (rows) => { setPendingCount(rows.length) },
      () => { setPendingCount(null) }
    )
  }, [])

  async function signOut() {
    // scope 기본값이 'global' 이라 모든 기기의 세션을 끊는다. 이 기기만 로그아웃한다.
    await supabase.auth.signOut({ scope: 'local' })
    // 다른 계정으로 다시 로그인했을 때 이전 캐시가 보이면 안 된다.
    await clearCache().catch(() => undefined)
  }

  // 폰에는 개발자 도구가 없다. 서버리스 함수가 살아 있는지 확인할
  // 유일한 수단이므로 설정 화면에 버튼으로 박아 둔다.
  async function checkHealth() {
    setHealth({ status: 'loading' })
    try {
      const response = await fetch('/api/health')
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        // SPA 폴백이 /api 를 삼키면 JSON 대신 HTML 이 돌아온다.
        setHealth({
          status: 'done',
          text: `실패: JSON 이 아닌 ${contentType || '알 수 없는'} 응답 (${response.status})`,
        })
        return
      }
      const body = (await response.json()) as { ok?: boolean; time?: string }
      setHealth({
        status: 'done',
        text: body.ok ? `정상 · ${body.time ?? ''}` : `실패: ${JSON.stringify(body)}`,
      })
    } catch (error) {
      setHealth({ status: 'done', text: `실패: ${(error as Error).message}` })
    }
  }

  return (
    <div>
      <PageHeader title="설정" />

      <section className="px-5 pt-2">
        <h2 className="text-sm font-medium text-muted">앱</h2>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <Row label="실행 형태" value={isStandalone() ? '설치된 앱' : '브라우저 탭'} />
          {canInstall ? (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm">홈 화면에 추가</span>
              <span className="text-sm font-medium text-accent">설치</span>
            </button>
          ) : (
            <Row
              label="홈 화면에 추가"
              value={installed ? '설치됨' : '브라우저 메뉴에서 추가할 수 있어요'}
            />
          )}
        </div>
      </section>

      <section className="px-5 pt-6">
        <h2 className="text-sm font-medium text-muted">진단</h2>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <button
            type="button"
            onClick={() => void checkHealth()}
            disabled={health.status === 'loading'}
            className="flex w-full items-center justify-between px-4 py-3 text-left disabled:opacity-50"
          >
            <span className="text-sm">서버 연결 확인</span>
            <span className="text-sm font-medium text-accent">
              {health.status === 'loading' ? '확인 중…' : '확인'}
            </span>
          </button>
          {health.status === 'done' ? (
            <p className="ko-prose px-4 py-3 text-sm text-muted">{health.text}</p>
          ) : null}
          <Link to="/diagnose" className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">자가 진단</span>
            <span className="text-sm font-medium text-accent">전체 검사</span>
          </Link>
        </div>
      </section>

      <section className="px-5 pt-6">
        <h2 className="text-sm font-medium text-muted">계정</h2>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <Row label="로그인" value={user?.email ?? '—'} />
          {pendingCount !== null && pendingCount > 0 ? (
            <Row label="저장 대기 중인 사진" value={`${String(pendingCount)}장`} />
          ) : null}
          <button
            type="button"
            onClick={() => { void signOut() }}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm">로그아웃</span>
            <span className="text-sm font-medium text-accent">이 기기에서</span>
          </button>
        </div>
      </section>

      <section className="px-5 py-6">
        <p className="ko-prose text-xs text-muted">
          데이터 내보내기와 알림 설정은 다음 단계에서 추가됩니다. 화면 밝기(다크 모드)는 폰의
          시스템 설정을 따릅니다.
        </p>
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm">{label}</span>
      <span className="text-right text-sm text-muted">{value}</span>
    </div>
  )
}
