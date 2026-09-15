import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import PageHeader from '../components/PageHeader.tsx'
import { isStandalone, useInstallPrompt } from '../lib/pwa.ts'
import { supabase } from '../lib/supabase.ts'
import { clearCache, listPending } from '../lib/db.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { buildJsonExport, buildMarkdownExport, downloadText, importJson } from '../lib/exportData.ts'
import { localDateKey } from '../lib/daily.ts'
import { disablePush, enablePush, getPushStatus, sendTestPush } from '../lib/push.ts'
import type { PushStatus } from '../lib/push.ts'

type HealthState = { status: 'idle' | 'loading' } | { status: 'done'; text: string }

export default function Settings() {
  const { canInstall, installed, promptInstall } = useInstallPrompt()
  const { user } = useAuth()
  const [health, setHealth] = useState<HealthState>({ status: 'idle' })
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [dataMsg, setDataMsg] = useState<string | null>(null)
  const [dataBusy, setDataBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [push, setPush] = useState<PushStatus | 'loading'>('loading')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void getPushStatus().then((status) => { if (alive) setPush(status) })
    return () => { alive = false }
  }, [])

  async function togglePush() {
    if (!user) return
    setPushBusy(true)
    setPushMsg(null)
    try {
      const next = push === 'on' ? await disablePush() : await enablePush(user.id)
      setPush(next)
      if (next === 'on') setPushMsg('켰어요. 내일 아침 8시에 첫 문장이 와요. 지금 바로 확인하려면 아래 테스트를 눌러 보세요.')
      else if (next === 'denied') setPushMsg('알림이 차단돼 있어요. 폰 설정 > 애플리케이션 > 밑줄(또는 Chrome) > 알림에서 허용한 뒤 다시 켜 주세요.')
    } catch (error) {
      setPushMsg(error instanceof Error ? error.message : '알림 설정을 바꾸지 못했어요.')
    } finally {
      setPushBusy(false)
    }
  }

  async function testPush() {
    setPushBusy(true)
    setPushMsg('보내는 중…')
    try {
      const result = await sendTestPush()
      setPushMsg(result.message)
    } finally {
      setPushBusy(false)
    }
  }

  async function exportJson() {
    setDataBusy(true)
    try {
      const data = await buildJsonExport()
      downloadText(`밑줄-${localDateKey()}.json`, JSON.stringify(data, null, 2), 'application/json')
      setDataMsg(`책 ${String(data.books.length)}권, 문장 ${String(data.highlights.length)}개를 내보냈어요.`)
    } catch (error) {
      setDataMsg(error instanceof Error ? error.message : '내보내지 못했어요.')
    } finally {
      setDataBusy(false)
    }
  }

  async function exportMarkdown() {
    setDataBusy(true)
    try {
      downloadText(`밑줄-${localDateKey()}.md`, await buildMarkdownExport(), 'text/markdown')
      setDataMsg('마크다운으로 내보냈어요.')
    } catch (error) {
      setDataMsg(error instanceof Error ? error.message : '내보내지 못했어요.')
    } finally {
      setDataBusy(false)
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.item(0) ?? null
    input.value = ''
    if (!file) return
    if (!window.confirm('이 파일의 책과 문장을 지금 계정에 추가할까요? 이미 있는 문장은 건너뜁니다.')) return
    setDataBusy(true)
    try {
      const result = await importJson(await file.text())
      setDataMsg(`책 ${String(result.books)}권, 문장 ${String(result.highlights)}개를 가져왔어요.`)
    } catch (error) {
      setDataMsg(error instanceof Error ? error.message : '가져오지 못했어요.')
    } finally {
      setDataBusy(false)
    }
  }

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
        <h2 className="text-sm font-medium text-muted">알림</h2>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {push === 'loading' ? (
            <Row label="매일 아침 8시 오늘의 문장" value="확인 중…" />
          ) : push === 'unsupported' ? (
            <Row label="매일 아침 8시 오늘의 문장" value={isStandalone() ? '이 브라우저는 알림을 지원하지 않아요' : '홈 화면에 추가한 앱에서 켤 수 있어요'} />
          ) : push === 'no-key' ? (
            <Row label="매일 아침 8시 오늘의 문장" value="서버에 알림 키가 없어요 (VITE_VAPID_PUBLIC_KEY)" />
          ) : push === 'denied' ? (
            <Row label="매일 아침 8시 오늘의 문장" value="차단됨 · 폰 설정에서 허용해 주세요" />
          ) : (
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => { void togglePush() }}
              className="flex w-full items-center justify-between px-4 py-3 text-left disabled:opacity-40"
            >
              <span className="text-sm">매일 아침 8시 오늘의 문장</span>
              <span className="text-sm font-medium text-accent">{push === 'on' ? '켜짐 · 끄기' : '켜기'}</span>
            </button>
          )}
          {push === 'on' ? (
            <SettingButton label="지금 테스트 알림 보내기" hint="아침에 올 것과 같은 알림" onClick={() => { void testPush() }} disabled={pushBusy} />
          ) : null}
          {pushMsg ? <p className="ko-prose px-4 py-3 text-sm text-muted">{pushMsg}</p> : null}
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

      <section className="px-5 pt-6">
        <h2 className="text-sm font-medium text-muted">내 데이터</h2>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <SettingButton label="JSON 으로 내보내기" hint="전부 · 다시 가져올 수 있어요" onClick={() => { void exportJson() }} disabled={dataBusy} />
          <SettingButton label="마크다운으로 내보내기" hint="책별 정리 · 옵시디언·노션용" onClick={() => { void exportMarkdown() }} disabled={dataBusy} />
          <SettingButton label="JSON 가져오기" hint="내보낸 파일에서" onClick={() => { importRef.current?.click() }} disabled={dataBusy} />
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void handleImport(e) }} />
          {dataMsg ? <p className="ko-prose px-4 py-3 text-sm text-muted">{dataMsg}</p> : null}
        </div>
      </section>

      <section className="px-5 py-6">
        <p className="ko-prose text-xs text-muted">
          알림 시각은 아침 8시로 고정돼 있어요. 화면 밝기(다크 모드)는 폰의 시스템 설정을 따릅니다.
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

function SettingButton({ label, hint, onClick, disabled }: { label: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left disabled:opacity-40"
    >
      <span className="text-sm">{label}</span>
      <span className="text-right text-xs text-muted">{hint}</span>
    </button>
  )
}
