# 밑줄

책을 읽다 마음에 드는 문장을 만나면 폰으로 그 페이지를 찍기만 하면, 앱이 문장을 뽑아
책별로 정리해 주고 나중에 다시 꺼내 보여 주는 PWA입니다.

- **1순위 타깃**: 갤럭시(Android) Chrome — 홈 화면에 설치해 전체화면으로 사용
- **2순위**: iOS Safari — 깨지지 않는 수준까지만 대응

---

## 처음 세팅하는 사람을 위한 순서

컴퓨터 없이 **브라우저와 폰만으로** 전부 가능합니다. 순서대로 따라오세요.

### 1단계 — Vercel에 배포하기 (Phase 0에 필요)

1. <https://vercel.com> 접속 → **Sign Up** → **Continue with GitHub**
2. 대시보드에서 **Add New...** → **Project**
3. `underline-app` 저장소 옆 **Import** 클릭
4. 설정 화면이 뜨면 **아무것도 바꾸지 말고** 그대로 **Deploy**
   - Framework Preset이 `Vite`로 자동 인식됩니다
   - Build Command `npm run build`, Output Directory `dist` — 모두 자동입니다
5. 1~2분 뒤 배포가 끝나면 `https://underline-app-xxxx.vercel.app` 주소가 나옵니다

이후 `main` 브랜치에 머지될 때마다 자동으로 재배포됩니다.

### 2단계 — 폰에 설치하기

1. 갤럭시에서 **Chrome으로** 위 주소를 엽니다
   - ⚠️ 삼성인터넷이 아니라 **Chrome**이어야 합니다. 삼성인터넷으로 설치하면 저장소가
     분리되어 나중에 로그인이 꼬입니다
2. 우측 상단 **⋮** → **홈 화면에 추가** (또는 앱 안 **설정 → 홈 화면에 추가**)
3. 홈 화면 아이콘으로 실행하면 주소창 없이 전체화면으로 뜹니다

확인: 앱의 **설정** 탭에서 "실행 형태"가 **설치된 앱**으로 보이면 성공입니다.

### 3단계 — Supabase 프로젝트 만들기 (Phase 1에 필요)

1. <https://supabase.com> → **Start your project** → GitHub로 로그인
   - ⚠️ 이때 **`qpt815@gmail.com`으로 가입**하세요. 무료 플랜의 기본 메일 발송은
     프로젝트 팀 멤버 주소로만 보내지므로, 로그인에 쓸 주소와 달라지면 인증 메일이
     아예 발송되지 않습니다
2. **New project** → 이름 `underline` → **Region은 `Northeast Asia (Seoul)`** 선택
   → 데이터베이스 비밀번호는 아무거나 (안 쓰지만 어딘가 적어두세요) → **Create**
3. 좌측 **SQL Editor** → **New query** →
   `supabase/migrations/0001_init.sql` 내용을 통째로 붙여넣고 **Run**
4. 같은 방법으로 `supabase/migrations/0002_storage.sql` 도 **Run**
5. 좌측 **Settings → API** 에서 두 값을 복사해 둡니다
   - **Project URL**
   - **Publishable key** (`sb_publishable_...`)

### 3.5단계 — 이메일 템플릿 고치기 ⚠️ 빠뜨리면 로그인이 안 됩니다

기본 템플릿은 6자리 코드가 아니라 **링크**를 보냅니다. 앱은 코드를 입력받으므로
템플릿 **두 개**를 모두 고쳐야 합니다.

1. Supabase 대시보드 → **Authentication** → **Emails** (또는 Email Templates)
2. **Confirm signup** 템플릿을 열고 본문을 아래로 바꿉니다:
   ```
   <p>밑줄 로그인 코드입니다.</p>
   <p style="font-size:32px;letter-spacing:8px"><b>{{ .Token }}</b></p>
   ```
3. **Magic Link** (또는 Magic Link / OTP) 템플릿도 **똑같이** 바꿉니다
4. **Authentication → Sign In / Providers → Email** 에서 **Email OTP length 를 6** 으로
   바꿉니다. 기본값이 **8** 이라 앱 문구("6자리 코드")와 어긋납니다.

> **왜 두 개인가**: 처음 로그인할 때는 계정이 없어서 *Confirm signup* 템플릿이,
> 두 번째부터는 *Magic Link* 템플릿이 나갑니다. 하나만 고치면 첫 로그인 메일에
> 코드가 없고, 무료 발송은 **시간당 2통**이라 그걸 확인하는 데만 한도를 태웁니다.

### 3.6단계 — 발신 메일을 내 Gmail SMTP 로 (권장)

Supabase 내장 메일은 **프로젝트 전체에서 시간당 2통**입니다. 로그인을 몇 번만
시도해도 잠깁니다. 혼자 쓰는 앱이라면 **본인 Gmail 로 본인에게 보내는** 구성이
가장 확실합니다(하루 500통, 스팸·폐기 걱정 없음).

1. Google 계정 → 보안 → **2단계 인증** 켜기 → **앱 비밀번호** 생성 (16자리)
2. Supabase → **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP**
   - Host `smtp.gmail.com` · Port `465`
   - Sender email / Username: `qpt815@gmail.com` · Sender name: `밑줄`
   - Password: 위에서 만든 앱 비밀번호
3. 저장 후 앱에서 코드를 요청하면 1초 안에 받은편지함으로 옵니다

> ⚠️ **Resend 의 `onboarding@resend.dev` 발신은 쓰지 마세요.** 실제로 겪은 일입니다:
> Resend 로그에는 5통 모두 Gmail 에 *Delivered* 로 찍혔는데 받은편지함·스팸함·전체보관함
> 어디에도 없었습니다. 공용 테스트 발신 주소라 Gmail 이 수락한 뒤 조용히 폐기합니다.
> 메일함에 도착조차 하지 않으므로 "스팸 아님" 필터로는 해결되지 않습니다.
> 나중에 다른 사람에게 공개할 때는 도메인을 사서 Resend 에 인증하고
> `noreply@내도메인` 으로 보내면 됩니다.

### 4단계 — OCR API 키 발급 (Phase 1에 필요)

무료로 쓰려면 **Gemini**, 최고 품질을 원하면 **Claude** 중 하나만 있으면 됩니다.

**Gemini (무료 · 신용카드 불필요 · 권장)**
1. <https://aistudio.google.com> → Google 계정으로 로그인
2. **Get API key** → **Create API key** → 복사

> ⚠️ Gemini **무료 티어는 입력한 데이터가 구글의 모델 학습에 사용**되며 사람이 검토할 수
> 있습니다. 찍은 책 페이지와 저장한 문장이 대상입니다. 이게 곤란하면 Claude를 쓰세요.

**Claude (유료 · 장당 약 $0.015~0.037 · 학습에 사용되지 않음)**
1. <https://console.anthropic.com> → **API Keys** → **Create Key** → 복사

### 5단계 — Vercel에 환경변수 넣기

1. Vercel 대시보드 → 프로젝트 → 상단 **Settings** → 좌측 **Environment Variables**
2. `.env.example` 을 보면서 필요한 값을 하나씩 **Key / Value** 로 추가
   (Environment는 Production·Preview·Development 전부 체크)
3. 전부 넣었으면 상단 **Deployments** → 최신 항목 **⋯** → **Redeploy**

> ⚠️ `VITE_` 로 시작하는 변수는 **빌드 시점에 클라이언트 번들에 박힙니다.**
> 값을 바꾸면 반드시 재배포해야 반영되고, 누구나 볼 수 있으니 비밀 키를 넣으면 안 됩니다.
> `VITE_` 가 없는 변수(`ANTHROPIC_API_KEY` 등)는 서버에서만 읽히며 클라이언트에
> 노출되지 않습니다.

---

## 프로젝트 구조

```
api/                  Vercel 서버리스 함수 (비밀 키는 여기서만 다룬다)
  health.ts           배포 상태 확인용. 설정 화면의 "서버 연결 확인" 버튼이 호출
public/
  fonts/              본문 세리프 (Noto Serif KR, SIL OFL)
  icons/              PWA 아이콘 (scripts/generate-icons.mjs 로 생성)
scripts/
  generate-icons.mjs  아이콘 재생성 (폰트 의존성 없이 도형으로만 그린다)
src/
  sw.ts               서비스워커. Share Target(Phase 2)과 웹 푸시(Phase 3)가 여기 붙는다
  index.css           팔레트·타이포그래피·한국어 줄바꿈
  App.tsx             라우팅과 앱 셸
  components/         BottomNav, EmptyState, PageHeader, ReloadPrompt
  routes/             Home, Library, Feed, Settings, NotFound
  lib/pwa.ts          설치 프롬프트(beforeinstallprompt) 처리
supabase/migrations/  대시보드 SQL Editor에 붙여넣을 스키마
```

## 기술 선택과 이유

| 선택 | 이유 |
|---|---|
| TypeScript **6.0.3** (7.x 아님) | TS 7은 안정 API가 없어 `typescript-eslint`가 설치 단계에서 충돌합니다. CI가 유일한 검증 수단이라 타입 인식 린트를 포기할 수 없습니다 |
| 서비스워커 `injectManifest` | 기본 `generateSW`가 만드는 워커에는 `message` 리스너뿐이라 웹 푸시도 Share Target도 붙일 수 없습니다. 나중에 갈아타려면 이미 설치된 앱의 워커를 교체해야 해서 처음부터 직접 관리합니다 |
| `registerType: 'prompt'` | 문장을 고르는 중에 자동 리로드되면 작업이 날아갑니다 |
| 본문 세리프 단일 파일 프리캐시 | 슬라이스 배포는 새 책의 낯선 음절마다 폰트를 새로 받으며 카드가 깜빡입니다. 약 950KB를 한 번 받고 끝냅니다 |
| UI 서체는 `system-ui` | 갤럭시의 시스템 한글 서체(One UI Sans KR)가 이미 충분히 좋습니다. 웹폰트를 더 받을 이유가 없습니다 |
| 표지는 직접 촬영 | 알라딘 OpenAPI는 2026-10-30 종료, 네이버 책 검색은 2026-07-31 종료됐습니다. 카메라 파이프라인이 이미 있으니 외부 의존성을 만들지 않습니다 |

## 개발

이 프로젝트는 **클라우드에서만** 개발·검증합니다. 로컬 실행을 전제하지 않습니다.

```bash
npm run typecheck   # tsc --noEmit (앱/서비스워커/함수 각각)
npm run lint        # 타입 인식 ESLint
npm run build       # typecheck + 프로덕션 빌드
```

화면 확인은 Vercel의 **Preview 배포 URL**로 합니다. PR을 올리면 Vercel이 PR마다 별도
Preview URL을 만들어 줍니다.

아이콘이나 폰트를 바꿀 때:

```bash
npm i --no-save sharp && npm run generate-icons   # 아이콘 재생성
npm run sync-font                                  # 폰트 파일 다시 복사
```

## 알려진 제약

- **Vercel 서버리스 함수의 요청 본문은 4.5MB가 상한**입니다. 사진은 클라이언트에서
  장변 1600px / JPEG 0.85로 줄여 보냅니다(약 300~500KB).
- **Vercel Hobby 플랜의 Cron은 하루 1회**만 허용됩니다. 그래서 알림 시각은 08:00 KST
  고정이고 켜기/끄기만 제공합니다. 사용자가 시각을 고르는 기능은 넣지 않았습니다.
  (cron 표현식은 UTC라 `0 23 * * *` 입니다 — 전날 23시)
- **Supabase 무료 플랜은 약 7일간 접속이 없으면 프로젝트가 일시정지**됩니다. 매일 쓰면
  문제없지만 일주일 자리를 비우면 대시보드에서 직접 재개해야 합니다.
- **Preview 배포는 프로덕션과 다른 출처(origin)** 입니다. 서비스워커 캐시, IndexedDB,
  설치된 앱이 전부 별개이므로 설치·업데이트 흐름은 프로덕션 주소에서 확인하세요.
- 첫 방문 한 번은 본문이 시스템 서체로 보입니다(`font-display: optional`). 서비스워커가
  폰트를 캐시한 뒤부터는 항상 세리프로 뜨고, 대신 깜빡임이 전혀 없습니다.
- iOS에서는 홈 화면 아이콘의 저장소가 사파리와 분리돼 있어, 사파리에서 로그인했어도
  설치된 앱은 로그아웃 상태로 시작합니다.

## 라이선스

개인 프로젝트입니다. 본문 서체 Noto Serif KR은 SIL Open Font License 1.1을 따르며
전문은 `public/fonts/LICENSE.txt` 에 있습니다.
