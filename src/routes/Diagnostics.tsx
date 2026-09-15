import { useCallback, useState } from 'react'
import PageHeader from '../components/PageHeader.tsx'
import { CHECKS, runWithTimeout } from '../lib/diagnose.ts'
import { generateVapidKeys } from '../lib/vapid.ts'
import type { VapidKeyPair } from '../lib/vapid.ts'
import { copyText } from '../lib/share.ts'
import type { CheckResult, CheckStatus } from '../lib/diagnose.ts'

type Row = { id: string; label: string } & (
  | { state: 'waiting' }
  | { state: 'running' }
  | { state: 'done'; result: CheckResult }
)

const MARK: Record<CheckStatus, string> = { pass: '✓', fail: '✗', warn: '!', skip: '–' }
const TONE: Record<CheckStatus, string> = {
  pass: 'text-accent',
  fail: 'text-accent',
  warn: 'text-muted',
  skip: 'text-muted',
}

/**
 * 폰에는 개발자 도구가 없다. 어느 층이 깨졌는지 알 방법이 이 화면뿐이다.
 * 각 검사는 독립적으로 돌아서, 하나가 실패해도 나머지 결과를 볼 수 있다.
 */
export default function Diagnostics() {
  const [rows, setRows] = useState<Row[]>(
    CHECKS.map((check) => ({ id: check.id, label: check.label, state: 'waiting' }))
  )
  const [running, setRunning] = useState(false)
  const [vapid, setVapid] = useState<VapidKeyPair | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function makeVapid() {
    try {
      setVapid(await generateVapidKeys())
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '키를 만들지 못했어요.')
    }
  }

  async function copy(label: string, value: string) {
    setCopied((await copyText(value)) ? label : null)
    setTimeout(() => { setCopied(null) }, 1500)
  }

  const runAll = useCallback(async () => {
    setRunning(true)
    setRows(CHECKS.map((c) => ({ id: c.id, label: c.label, state: 'waiting' })))

    for (const check of CHECKS) {
      setRows((prev) =>
        prev.map((r) => (r.id === check.id ? { ...r, state: 'running' } : r))
      )
      let result: CheckResult
      try {
        result = await runWithTimeout(check)
      } catch (error) {
        result = {
          status: 'fail',
          detail: error instanceof Error ? error.message : '검사 중 오류가 났습니다.',
        }
      }
      setRows((prev) =>
        prev.map((r) => (r.id === check.id ? { ...r, state: 'done', result } : r))
      )
    }
    setRunning(false)
  }, [])

  const done = rows.filter((r) => r.state === 'done')
  const failed = done.filter((r) => r.state === 'done' && r.result.status === 'fail').length

  return (
    <div className="pb-8">
      <PageHeader title="자가 진단" />

      <div className="px-5 pb-4">
        <p className="ko-prose text-sm text-muted">
          {running
            ? '검사하는 중…'
            : done.length === 0
              ? '각 층이 제대로 연결됐는지 한 번에 확인합니다. 어디서 막혔는지 알려드릴게요.'
              : failed === 0
                ? `${String(done.length)}개 항목 모두 통과했습니다.`
                : `${String(failed)}개 항목이 실패했습니다. 아래 안내를 따라 고쳐 주세요.`}
        </p>
      </div>

      <ul className="space-y-2 px-5">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline gap-3">
              <span
                aria-hidden
                className={`w-4 shrink-0 text-center font-semibold ${
                  row.state === 'done' ? TONE[row.result.status] : 'text-muted'
                }`}
              >
                {row.state === 'done' ? MARK[row.result.status] : row.state === 'running' ? '…' : '·'}
              </span>
              <span className="flex-1 text-sm font-medium">{row.label}</span>
            </div>
            {row.state === 'done' ? (
              <>
                <p className="ko-prose mt-2 pl-7 text-sm text-muted">{row.result.detail}</p>
                {row.result.fix ? (
                  <p className="ko-prose mt-2 rounded-xl bg-accent/10 p-3 text-sm text-accent">
                    {row.result.fix}
                  </p>
                ) : null}
              </>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="px-5 pt-6">
        <button
          type="button"
          disabled={running}
          onClick={() => { void runAll() }}
          className="h-14 w-full rounded-xl border border-line bg-surface font-semibold disabled:opacity-40"
        >
          {running ? '검사 중…' : done.length === 0 ? '검사 시작' : '다시 검사'}
        </button>
        <p className="ko-prose mt-3 text-xs text-muted">
          OCR 검사는 실제로 무료 한도를 1회 사용합니다. 그래서 화면을 열 때 자동으로
          돌지 않고, 누르실 때만 실행됩니다.
        </p>
      </div>

      <section className="px-5 pt-8">
        <h2 className="text-sm font-medium text-muted">설정 도구</h2>
        <div className="mt-2 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-medium">푸시 알림용 VAPID 키 만들기</p>
          <p className="ko-prose mt-1 text-xs text-muted">
            이 폰 안에서 만들어지고 어디로도 전송되지 않아요. 만든 뒤 Vercel 환경변수에
            공개키는 VITE_VAPID_PUBLIC_KEY, 비밀키는 VAPID_PRIVATE_KEY 로 넣고 재배포하세요.
            한 번 넣은 키는 바꾸지 마세요 — 바꾸면 켜 둔 알림이 전부 풀립니다.
          </p>
          {vapid ? (
            <div className="mt-3 space-y-3">
              <KeyField label="공개키 (VITE_VAPID_PUBLIC_KEY)" value={vapid.publicKey} copied={copied} onCopy={copy} />
              <KeyField label="비밀키 (VAPID_PRIVATE_KEY)" value={vapid.privateKey} copied={copied} onCopy={copy} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { void makeVapid() }}
              className="mt-3 h-12 w-full rounded-xl border border-line bg-bg text-sm font-semibold"
            >
              키 만들기
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function KeyField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: string | null
  onCopy: (label: string, value: string) => Promise<void>
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <button type="button" onClick={() => { void onCopy(label, value) }} className="px-2 py-2 text-xs font-medium text-accent">
          {copied === label ? '복사됨' : '복사'}
        </button>
      </div>
      <code className="block rounded-lg bg-bg p-2 text-xs break-all select-all">{value}</code>
    </div>
  )
}
