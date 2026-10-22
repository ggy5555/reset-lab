# RESET LAB 3.0 — PHASE 3 (배포·권한 검증 패키지)

**실제 운영 상태: 배포 전 / Notion API 실연동 미확인.** 학교 Notion의 메인 페이지와 원본 DB는 이전 단계에서 만들었고, 이 패키지는 브라우저 타이머 + HTTPS 배포 설정 + 안전한 Notion 업로드 서버 코드까지 포함합니다.

## 준비된 기능

- **프런트엔드:** HOME, STUDY, TIME, ANALYTICS, WELLNESS, PLANNER, SYSTEM, 스톱워치, 중복 활동, 일시정지/재개, 24시간 타임라인에서 미측정 부분 빈칸
- **노션 연동 코드:** 완료된 활동 및 할 일을 `Sessions`, `Session Intervals`, `Tasks` DB로 단방향 업로드. 같은 외부 ID 재전송 시 중복 생성 방지
- **서버 보안:** Notion API 키는 서버 환경변수에만 보관. 개인 비밀번호 로그인, 서명된 HttpOnly 쿠키, 동일 출처 요청 검사, 기본 비밀번호 거부, 로그인 시도 제한
- **관리 기능:** 로그인 후 `연결 권한 검사`로 네 개 데이터 소스에 대해 읽기 권한을 검사(쓰기 성공 보증 아님)
- **배포 준비:** `render.yaml` (HTTPS를 제공하는 Render Web Service용 Blueprint)

## 배포 전에 반드시 알아둘 점

1. **ChatGPT와 연결된 Notion 계정 = 개인 Notion API 토큰이 아님.** 서버는 학교 계정에서 사용자가 발급한 별도의 연결 토큰이 필요함.
2. **Render 배포를 위한 계정 연결이 아직 이루어지지 않았음.** Render 앱을 ChatGPT에 연결한 뒤 배포를 이어가거나, 아래의 수동 배포 절차를 이용.
3. 학교 Notion 데이터의 **다른 기기에서의 자동 다운로드는 구현되지 않음**. 단방향 업로드이므로 여러 기기에서 동시에 쓰면 로컬 기록이 달라질 수 있음.
4. `Sync ON`은 서버 접근 준비 상태일 뿐 **실제 Notion DB 쓰기 성공을 의미하지 않음**. 서버 로그인 후 저장 결과를 반드시 확인.
5. 측정 기록은 기본적으로 브라우저 저장소에 남으므로 `SYSTEM → JSON 백업`을 정기적으로 이용.
6. 학교에서 통합 생성이 제한되어 있다면 관리자 허가 없이 권한을 우회하지 말 것.

## A. 학교 Notion 연결 만들기 (계정 소유자가 수행)

1. 학교 계정으로 노션에 로그인 후 `설정 → 연결`로 이동.
2. 안내되는 개발자 모드/개인 액세스 토큰 메뉴에서 내부 연결을 생성. 연결 이름 예: `RESET LAB 3.0`.
3. **해당 학교 워크스페이스**를 선택하고 필요한 콘텐츠 읽기/쓰기 권한을 부여.
4. 만들어진 연결을 RESET LAB 3.0의 SYSTEM 페이지와 관련 DB에 추가 (또는 페이지 권한 상속을 확인).
5. 필요한 4개 DB:
   - SUBJECTS: `edbf7061-2ff6-4260-aba0-0225cd368e63`
   - TASKS: `45dfb885-cd20-4243-9b1a-be08338da30a`
   - SESSIONS: `0a201b4a-b181-4124-91d8-a9245e461659`
   - SESSION INTERVALS: `8ae79d18-15dd-44ba-a6af-55c2965615cd`
6. 토큰을 안전하게 보관. **이 채팅, GitHub, Notion 페이지, 프런트엔드 코드에는 토큰을 적지 말 것.**

공식 안내: https://www.notion.com/ko/help/create-integrations-with-the-notion-api

## B. HTTPS 배포 (Render 예시)

1. 이 프로젝트의 코드를 **자신이 소유한 별도 저장소**에 올림. `.env`, 비밀번호 및 개인 측정 기록은 업로드하지 않음.
2. Render에서 **New → Blueprint** 또는 Web Service를 생성해 저장소에 포함된 `render.yaml`을 사용.
3. 환경변수 입력란에서 다음을 개인적으로 설정:
   - `APP_PASSWORD`: 개인용 강력한 암호 **14자 이상**
   - `NOTION_API_TOKEN`: A에서 발급한 학교 워크스페이스 연결 토큰
   - `AUTH_SECRET`: Blueprint가 무작위 값 자동 생성
   - `NODE_ENV`: `production` (설정 파일에 포함됨)
4. Render가 생성한 **HTTPS URL**에서 웹앱을 열고 `SYSTEM` 탭으로 이동.
5. 앱 비밀번호 로그인 → `연결 권한 검사`. `subjects`, `tasks`, `sessions`, `intervals` 모두 `OK`라면 읽기 접근을 확인한 것.
6. **가짜 개인정보 없는 테스트 할 일과 짧은 시험용 세션**을 하나만 기록하여 `지금 Notion으로 전송` → 해당 Notion DB에 실제로 생성됐는지 확인.
7. 올바르게 동작하면 실제 기록을 사용. 실패했으면 원본은 브라우저에 남아 있으니 중복으로 새로 기록할 필요 없음.

공식 Render 문서: https://render.com/docs/infrastructure-as-code / https://render.com/docs/configure-environment-variables

> Render 무료 인스턴스는 유휴 상태에서 잠들거나 시작이 늦어질 수 있음. 사용 전 정책과 요금 조건 확인. 화면을 닫은 동안 클라우드 동기화가 계속되는 것은 아님.

## C. PC 로컬 실행

Node.js >= 20

```bash
cp .env.example .env
# 로컬 .env의 APP_PASSWORD, AUTH_SECRET, NOTION_API_TOKEN을 개인적으로 설정
npm start
# http://localhost:8787
```

`.env` 로딩이 필요하면:

```bash
node --env-file=.env server/server.mjs
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
node --env-file=.env server/server.mjs
```

## D. 서버 확인

- 공개 상태 확인: `GET /api/health` — 실제 토큰 값을 반환하지 않음
- 로그인: `POST /api/login` — APP_PASSWORD 입력
- 로그인 후 노션 접근 검사: `GET /api/verify` — DB 별 접근 가능 여부 반환
- 로그인 후 업로드: `POST /api/sync` — 실제 세션/할 일 전송

## 테스트

```bash
npm test
```

9개 테스트 통과(모의 Notion API 및 로컬 서버 인증 검사). 실제 학교 Notion 서버 쓰기 테스트는 토큰 발급·배포 전이어서 **아직 수행되지 않음**.

## 남은 한계

- 노션 자동 역동기화 미구현
- 운영 배포 미완료
- 반복 할 일의 다음 회차 자동 생성 미구현
- 휴식의 대분류, 대표 활동 자동 결정, 수면 사후 보정은 사용자 결정 대기
- 개인정보 보호를 위해 기존 공개 리듬게임·학교 사이트 GitHub 저장소를 변경하지 않음
