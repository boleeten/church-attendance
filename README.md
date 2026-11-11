# 주님의교회 초등부 출석관리

교사용·부장교사용 모바일 화면과 관리자용 웹 화면을 가진 출석관리 웹앱입니다. React + Vite + TypeScript로 만들었고, Vercel에 정적 사이트로 배포합니다.

## 실행

```bash
npm install
npm run dev
```

```bash
npm run build
```

## 두 가지 동작 모드

| 모드 | 조건 | 데이터 |
|---|---|---|
| 데모 모드 | 환경 변수 없음 (기본) | 가상의 예시 데이터. 입력 내용은 각자의 브라우저(localStorage)에만 저장되고 다른 사람과 공유되지 않습니다. |
| 실제 DB 모드 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정 | Supabase(PostgreSQL)에 저장되고 권한 정책(RLS)이 적용됩니다. |

데모 모드의 로그인 화면에는 교사·부장교사·관리자 데모 계정 버튼이 있습니다. 데모 계정 비밀번호는 `src/lib/seed.ts`에 있습니다.

**데모 모드는 실제 학생 정보를 넣는 용도가 아닙니다.** 실제 운영은 반드시 실제 DB 모드로 전환한 뒤 시작하세요.

## 실제 DB(Supabase)로 전환하기

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다. 테이블, 권한 정책, 기본 반 편성(21개 반)이 만들어집니다.
3. Authentication → Users 에서 첫 관리자(목사님) 계정을 만듭니다. 이메일은 `아이디@attendance.local` 형식으로 넣습니다. 예: `pastor_han@attendance.local`
4. 방금 만든 사용자의 프로필을 넣습니다. (사용자를 만들 때 "Auto Confirm User"를 켜야 로그인됩니다.)

   ```sql
   insert into public.profiles (id, login_id, name, roles, title, must_change_password)
   select id, 'pastor_han', '한요한', '{owner,super}', '목사님', false
   from auth.users where email = 'pastor_han@attendance.local';
   ```

5. Vercel 프로젝트의 Environment Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 넣고 다시 배포합니다.

### 실제 DB 모드에서 아직 되지 않는 것

`supabase/schema.sql`의 테이블·권한 정책은 로컬 Postgres(PGlite)에서 역할별로 시험했습니다(교사는 담당 반만, 권한 올리기 차단 등). 다만 **실제 Supabase 프로젝트와 앱을 연결한 상태로는 아직 검증되지 않았습니다.** 처음 연결할 때 로그인, 출석 저장, 교사별 조회 범위를 꼭 확인하세요. 아래 기능은 서버 쪽 작업이 더 필요합니다.

- **계정 생성·비밀번호 초기화**: `api/admin-users.js`(Vercel 서버 함수)가 처리합니다. Vercel 환경 변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`(Supabase secret 키, Production 전용)가 있어야 동작합니다. 함수는 요청한 사람이 관리자인지와 대상 계정을 다룰 권한(목사님 계정은 초기화 불가, 최고 관리자 계정은 최고 관리자만)을 먼저 확인합니다. 새 계정은 교사·부장교사 권한으로만 만들어지고, 임시 비밀번호(영문 6자+숫자 4자)는 화면에 한 번만 보여 주며 첫 로그인 때 변경해야 합니다.
- **푸시 알림(일요일 오후 3시)**: 코드는 들어 있습니다(`public/sw.js`, `src/lib/push.ts`, `api/push-reminders.js`, `vercel.json`의 cron). 전화번호 없이 홈 화면에 설치한 앱으로 알림이 갑니다. 동작하려면 Supabase 연결 후 Vercel 환경 변수에 `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`(`npx web-push generate-vapid-keys`로 생성), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`을 넣어야 합니다. 예약 시각은 `vercel.json`의 cron(일요일 06:00 UTC = 한국 15:00)으로 고정이며, 관리자 화면의 발송 시간 설정과는 아직 연결되지 않았습니다. 실제 키로 발송해 본 적은 없습니다.
- **Google Sheets 동기화**: Google 서비스 계정과 서버 함수가 필요합니다. 교사 공유용 출석대장(시트 7개)과 관리자 전용 파일(연락처, 심방노트) 두 개로 나눠 동기화하도록 설계되어 있고, 지금은 각 시트를 CSV로 내려받을 수 있습니다.

## 학생 사진 저장 정책

Supabase 무료 한도(DB 500MB, 파일 저장소 1GB, 전송량 월 5GB) 안에서 쓰도록 사진을 아주 작게 저장합니다.

- 사진을 고르면 자르기 화면에서 위치·확대를 맞춘 뒤, **192×192 WebP(약 12KB 이하)** 로 줄여 저장합니다. 원본 사진은 기기 밖으로 나가지 않습니다.
- 학생당 1장이며, 바꾸면 이전 사진을 덮어씁니다. 삭제도 가능합니다.
- 저장 위치는 `students.photo` 열(data URL)이고, DB가 24,000자를 넘는 값과 사진이 아닌 값을 거부합니다.
- 정원 210명이 모두 등록해도 약 2.5MB로, DB 한도의 0.5% 수준입니다.

## 화면 구성

| 경로 | 대상 | 화면 |
|---|---|---|
| `/login`, `/password` | 공통 | 로그인, 최초 로그인 비밀번호 변경 |
| `/t/*` | 일반 교사 | 홈, 알림, 출석체크·심방노트, 학생 목록·상세, 출석 이력, 내 정보 |
| `/h/*` | 부장교사 | 부서 홈, 알림, 교사 출석체크, 교사 출석 이력, 내 정보 |
| `/admin/*` | 관리자 | 대시보드, 학생·반·교사 관리, 학생/교사 출결현황, 통계, 심방노트, Google Sheets, 알림 설정, 학년도 설정, 관리자 계정 |

## 운영 기준 (기획서와 다르게 정한 것 포함)

- "이번 주 주일"은 오늘이 일요일이면 오늘, 아니면 가장 최근에 지난 일요일입니다. 지난 주일은 날짜를 옮겨 소급 입력합니다.
- 출석률은 `출석 ÷ (출석 + 결석)`이며 미확인은 계산에서 빼고, 출석부가 완료되지 않은 기간은 "(잠정)"으로 표시합니다.
- 출석체크에는 "전체 출석 일괄 처리"가 없고, 심방노트는 결석 여부와 관계없이 모든 학생에게 작성할 수 있습니다.
- 홈 화면의 미완료 배너 대신 종 아이콘의 빨간 점과 알림 목록을 씁니다.
- 심방노트에는 최고 관리자만 답변을 달 수 있습니다(관리자 화면 → 심방노트 관리). 답변을 보내거나 고치면 노트를 쓴 교사의 알림 목록에 표시되고, 알림을 누르면 그 학생의 심방노트로 이동합니다. 일반 관리자는 답변을 볼 수만 있으며, DB 트리거(`guard_note`)가 최고 관리자 외의 답변 수정을 막습니다. 답변 알림은 앱 안 알림 목록에만 표시되고 기기 푸시는 보내지 않습니다.
- "Excel 다운로드"는 Excel에서 바로 열리는 CSV 파일(UTF-8)로 내려받습니다.
