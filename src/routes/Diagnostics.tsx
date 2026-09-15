import { useCallback, useState } from 'react'
import PageHeader from '../components/PageHeader.tsx'
import { CHECKS, runWithTimeout } from '../lib/diagnose.ts'
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
    </div>
  )
}
