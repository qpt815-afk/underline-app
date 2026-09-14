import { useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { authErrorToKorean } from '../auth/authErrors.ts'

type Step = { name: 'email' } | { name: 'code'; email: string }

export default function Login() {
  const [step, setStep] = useState<Step>({ name: 'email' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(target: string) {
    setBusy(true)
    setError(null)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: target,
      // 단독 사용자용 앱이므로 첫 로그인에서 계정이 만들어져야 한다.
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (sendError) {
      setError(authErrorToKorean(sendError))
      return
    }
    // 성공해도 data.session 은 항상 null 이다. error 가 없는 것으로만 판단한다.
    setStep({ name: 'code', email: target })
  }

  async function verify(target: string) {
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: target,
      token: code.trim(),
      // 반드시 'email'. 'signup'/'magiclink' 는 각각 한쪽 토큰 컬럼만 확인해서
      // 멀쩡한 코드에도 403 이 난다.
      type: 'email',
    })
    setBusy(false)
    if (verifyError) {
      setError(authErrorToKorean(verifyError))
      return
    }
    // 성공하면 onAuthStateChange 가 세션을 흘려보내고 Gate 가 홈을 그린다.
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="font-serif text-3xl">밑줄</h1>
      <p className="ko-prose mt-2 text-sm text-muted">
        책에서 만난 문장을 찍어 모아둡니다.
      </p>

      {step.name === 'email' ? (
        <form
          className="mt-10"
          onSubmit={(e) => {
            e.preventDefault()
            void sendCode(email.trim())
          }}
        >
          <label htmlFor="email" className="text-sm font-medium">
            메일 주소
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value) }}
            placeholder="you@example.com"
            className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3"
          />
          <button
            type="submit"
            disabled={busy || email.trim() === ''}
            className="mt-4 h-14 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
          >
            {busy ? '보내는 중…' : '인증 코드 받기'}
          </button>
          <p className="ko-prose mt-4 text-xs text-muted">
            비밀번호는 없습니다. 메일로 온 6자리 코드를 입력하면 로그인됩니다.
          </p>
        </form>
      ) : (
        <form
          className="mt-10"
          onSubmit={(e) => {
            e.preventDefault()
            void verify(step.email)
          }}
        >
          <label htmlFor="code" className="text-sm font-medium">
            인증 코드
          </label>
          <p className="ko-prose mt-1 text-sm text-muted">{step.email} 으로 보냈습니다.</p>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            required
            value={code}
            onChange={(e) => { setCode(e.target.value) }}
            placeholder="000000"
            className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-center text-2xl tracking-[0.4em]"
          />
          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="mt-4 h-14 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
          >
            {busy ? '확인 중…' : '로그인'}
          </button>
          <div className="mt-4 flex justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep({ name: 'email' })
                setCode('')
                setError(null)
              }}
              className="text-muted underline"
            >
              주소 바꾸기
            </button>
            {/* resend() 는 신규가입용만 지원하므로 재발송도 signInWithOtp 를 다시 부른다.
                60초 쿨다운과 시간당 한도가 함께 걸린다. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => { void sendCode(step.email) }}
              className="text-accent underline disabled:opacity-40"
            >
              코드 다시 받기
            </button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" className="ko-prose mt-6 rounded-xl bg-accent/10 p-4 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </main>
  )
}
