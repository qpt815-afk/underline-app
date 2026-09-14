interface Props {
  detail: string
}

/**
 * 환경변수가 빠졌을 때 하얀 화면 대신 보여주는 안내.
 * 폰에는 개발자 도구가 없으므로 무엇이 빠졌고 어디서 고치는지까지 적는다.
 */
export default function ConfigError({ detail }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="font-serif text-2xl">설정이 필요해요</h1>
      <p className="ko-prose mt-3 text-sm text-muted">{detail}</p>
      <ol className="ko-prose mt-6 list-decimal space-y-2 pl-5 text-sm">
        <li>Vercel 대시보드 → 이 프로젝트 → Settings → Environment Variables</li>
        <li>
          저장소의 <code className="rounded bg-line px-1">.env.example</code> 을 보고 빠진 값을
          추가하세요
        </li>
        <li>Deployments → 최신 배포 → ⋯ → Redeploy</li>
      </ol>
      <p className="ko-prose mt-6 text-xs text-muted">
        VITE_ 로 시작하는 값은 빌드할 때 박히므로, 바꾼 뒤에는 반드시 재배포해야 반영됩니다.
      </p>
    </main>
  )
}
