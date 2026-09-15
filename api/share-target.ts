/**
 * Share Target 의 안전망.
 *
 * 갤러리에서 "공유 → 밑줄" 을 누르면 안드로이드가 /share-target 에 사진을 POST 한다.
 * 정상이라면 서비스워커가 가로채서 처리하지만, 워커가 아직 페이지를 제어하지 않는
 * 경우(설치 직후 첫 실행 등)에는 요청이 네트워크로 온다. 그때 405 대신 앱으로
 * 돌려보낸다 — 사진은 잃지만 에러 화면은 아니다.
 */
// Node 의 Response.redirect 는 상대 URL 을 받지 못한다(Invalid URL). 요청 URL 기준으로 만든다.
export function POST(request: Request): Response {
  return Response.redirect(new URL('/capture?shared=missed', request.url).toString(), 303)
}

export function GET(request: Request): Response {
  return Response.redirect(new URL('/capture', request.url).toString(), 303)
}
