/**
 * 배포가 살아 있고 서버리스 함수가 SPA 폴백에 삼켜지지 않았는지 확인하는 엔드포인트.
 * 폰에는 개발자 도구가 없으므로 설정 화면의 "서버 연결 확인" 버튼이 여기를 호출한다.
 *
 * push 에는 알림 환경변수가 "있는지" 만 담는다(값은 절대 아니다). Secret 타입 변수는
 * 대시보드에서 빈 것과 채워진 것이 구분되지 않아, 이걸로만 빈 값을 잡을 수 있다.
 *
 * Vercel 의 Node 빌더는 export default 를 먼저 찾으므로, 한 파일에서
 * default 와 이름 있는 GET 을 같이 내보내면 GET 이 조용히 무시된다. 하나만 쓴다.
 */
function has(name: string): boolean {
  return (process.env[name]?.trim() ?? '') !== ''
}

export function GET(): Response {
  return Response.json(
    {
      ok: true,
      time: new Date().toISOString(),
      push: {
        VITE_VAPID_PUBLIC_KEY: has('VITE_VAPID_PUBLIC_KEY'),
        VAPID_PRIVATE_KEY: has('VAPID_PRIVATE_KEY'),
        VAPID_SUBJECT: has('VAPID_SUBJECT'),
        CRON_SECRET: has('CRON_SECRET'),
        SUPABASE_SECRET_KEY: has('SUPABASE_SECRET_KEY'),
      },
    },
    { headers: { 'cache-control': 'no-store' } }
  )
}
