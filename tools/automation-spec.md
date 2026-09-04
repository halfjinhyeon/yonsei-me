# 크롤링 자동화 구체 설계

작성 2026-09-04. [`automation-plan.md`](automation-plan.md)가 **무엇을 왜 어떤 순서로**
자동화할지 정한 문서라면, 이 문서는 백로그 항목 하나하나를 **어떻게 만들고 무엇으로
완료를 판정할지** 고정한 설계서입니다. Worker 에게 넘기는 브리프의 원본이며, 여기 적힌
파일 경로·CLI·종료 코드·이슈 제목은 구현이 그대로 따릅니다. 설계를 바꿔야 하면 코드가
아니라 이 문서를 먼저 고칩니다.

구현 순서는 계획서 7절의 권장대로 **1 → 3 → 2 → 4** 입니다(0절 공통 모듈이 1에 딸려
먼저 나옵니다).

---

## 0. 공통 규약

### 0-1. 코드 배치와 런타임

- 새 자동화 코드는 전부 `tools/automation/` 아래에 둡니다.
  ```
  tools/automation/
  ├── issue.mjs              GitHub 이슈 생성·중복 방지 헬퍼 (0-3)
  ├── remind.mjs             정기 리마인더 본문 생성 (항목 2)
  ├── reminders/*.md         리마인더 본문 템플릿 (항목 2)
  ├── admission-watch.mjs    입학처 변경 감지 (항목 3)
  ├── update-semester.mjs    학기 갱신 오케스트레이터 (항목 4)
  └── .state/                실행 상태 파일 — git 미추적
  ```
  계획서 2-1 이 말한 `tools/update-semester.mjs` 는 이 경로로 대체합니다.
- **Node 24 · 의존성 0.** 내장 `fetch`·`TextDecoder('euc-kr')`(Node 는 full-ICU 라 EUC-KR
  디코딩이 됩니다)·`node:child_process` 만 씁니다. `.ts` 는 Node 24 내장 타입 스트리핑으로
  직접 import 합니다(선례: `tools/crawl-faculty-profiles.mjs` → `core.ts`). 기존 tools
  스크립트 관례(머리말 주석에 사용법·하는 일·함정)를 그대로 따릅니다.
- **매너 규칙**(계획서 2절 1): 순차 처리, 요청 간 300ms, 타임아웃 15s, `User-Agent` 는
  `src/lib/faculty-crawl/core.ts` 의 문자열을 그대로, **HEAD 금지**(WAF 403 —
  `tools/board-source.mjs` 실측). 재시도는 1회(1초 후)까지만.

### 0-2. GitHub Actions 관례

- `ubuntu-latest`, `actions/checkout@v4`, `actions/setup-node@v4`(node 24, `cache: npm`),
  `npm ci` 는 Supabase 클라이언트가 필요한 워크플로에서만.
- `permissions` 는 **job 단위 최소**: 이슈만 만들면 `contents: read, issues: write`,
  스냅샷 브랜치에 푸시하면 `contents: write` 추가.
- `gh` CLI 는 러너에 설치돼 있습니다. `env: GH_TOKEN: ${{ github.token }}` 로 인증합니다.
- 모든 워크플로는 `workflow_dispatch` 를 갖고, 이슈를 만드는 것은 **`dry_run` 입력(기본
  true)** 을 둡니다 — dry-run 은 이슈 본문을 `$GITHUB_STEP_SUMMARY` 에 찍기만 합니다.
  검증은 항상 dry-run 으로 먼저 합니다.
- 이 저장소는 **Public** 입니다(`yonsei-mech/yonsei-me`, Issues 사용). 이슈 본문에 비밀값·
  개인정보를 넣지 않습니다. 입학처 정보·실패 로그(URL·HTTP 상태)는 공개해도 되는 내용입니다.

### 0-3. 이슈 헬퍼 `tools/automation/issue.mjs`

```
node tools/automation/issue.mjs --title "<제목>" --body-file <경로> [--label automation] [--dry-run]
```

- `gh issue list --state open --search 'in:title "<제목 접두>"'` 로 **같은 제목 접두의 열린
  이슈**가 있으면 새로 만들지 않고 그 이슈에 본문을 **댓글**로 답니다(계획서 2절 5: 이력이
  이슈에 쌓입니다). 접두는 제목에서 마지막 괄호 `(YYYY-MM-DD)` 를 뗀 문자열입니다.
- 라벨 `automation` 이 없으면 `gh label create automation --color 0057A8 --force` 로 만듭니다
  (`issues: write` 로 충분). 색은 디자인 토큰 blue.
- `--dry-run` 이면 만들 이슈의 제목·본문·"신규/댓글" 판정을 stdout 에 찍고 끝.
  `GITHUB_STEP_SUMMARY` 환경변수가 있으면 거기에도 씁니다.
- 종료 코드: 0 성공, 1 gh 실패. `GH_TOKEN` 없이 `--dry-run` 이 아니면 1.
- 검증: 로컬에서 `GH_TOKEN` 없이 `--dry-run` 이 본문을 찍는다. 실제 생성은 항목 1 의
  `simulate_failure` 로 한 번만 하고 그 이슈를 닫는다.

### 0-4. 검증 원칙

- Worker 의 완료 보고는 믿지 않습니다. 각 항목의 **"검증" 절에 적힌 명령의 실제 출력**과
  diff 로 Advisor 가 승인합니다.
- 기존 게이트(학기 일치 검증·`build-catalog` exit 1·`verify-matching` 6/6·`--verify-against`
  불일치 0·백테스트·typecheck)를 자동화가 **우회하지 않는지**가 승인 기준입니다.

---

## 1. 교수 학술활동 수집 — 실패 가시화 (백로그 1)

### 문제

`tools/crawl-faculty-profiles.mjs` 는 교수 한 명의 요청이 전부 실패해도 `전부 실패 — 건너뜀`
을 찍고 계속 진행해 **exit 0** 으로 끝납니다. 원본 마크업 변경·차단(403)·호스트 이전 같은
구조적 실패가 나도 워크플로는 초록불입니다.

### 변경 파일

| 파일 | 변경 |
| --- | --- |
| `tools/crawl-faculty-profiles.mjs` | 플래그 2개 추가, 임계 판정, 종료 코드 2 |
| `.github/workflows/crawl-faculty-profiles.yml` | permissions, 로그 tee, 실패 이슈 스텝, `simulate_failure` 입력 |
| `tools/automation/issue.mjs` | 신규(0-3) |

`src/lib/faculty-crawl/core.ts` 는 **건드리지 않습니다** — CMS 의 "실적 불러오기"와 공유하는
파일이고 행 키 순서 계약이 걸려 있습니다(파일 머리말 경고).

### 동작

- `--fail-threshold=<0~1>`: **전부 실패한 교수**(`crawlPerson` 결과 `merged === null`) 수를
  대상 수로 나눈 비율이 임계 **이상**이면, 요약 출력을 다 찍은 뒤 `::error::` 한 줄과 함께
  **exit 2** 로 끝냅니다. 부분 실패(분류 일부만 실패)는 세지 않습니다 — 병합 전용 설계라
  데이터를 훼손하지 않고, 원본이 100행 하드캡 등으로 흔들리는 게 평소 상태이기 때문입니다.
  플래그가 없으면 지금과 동일(exit 0) — CMS·로컬 호출 경로를 바꾸지 않습니다.
- `--timeout-ms=<n>`: `crawlPerson` 의 `timeoutMs` 옵션으로 전달. 실패 경로를 **실제로 재현**
  하기 위한 검증용입니다(1ms 면 전 요청 타임아웃 → 전부 실패).
- 종료 코드 규약: 0 정상, 1 사용법·환경 오류(기존), **2 실패 임계 초과**.
- 워크플로:
  - `permissions: { contents: read, issues: write }`.
  - 수집 스텝은 `--fail-threshold=0.2` 를 붙이고 출력을 `tee crawl.log` 로 남깁니다.
  - `simulate_failure`(boolean, 기본 false) 입력이 켜지면 `--timeout-ms=1` 을 붙여 전원
    타임아웃으로 임계 초과를 강제합니다(33명 × 6요청 × 300ms 지연 ≈ 1분, 드라이런·기록 안 함).
  - `if: failure()` 스텝: `crawl.log` 의 마지막 60줄 + 실행 URL
    (`${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`)
    + 조치 안내(원본 마크업 변경 → `core.ts` 파서 실측 주석 참고 / 403 → 지연 상향)를 본문으로
    `issue.mjs --title "[자동] 교수 학술활동 수집 실패 (YYYY-MM-DD)"` 호출. `dry_run` 입력(기본
    true)이 켜져 있으면 `--dry-run`.

### 검증

1. `node tools/crawl-faculty-profiles.mjs --only=<교수 1명> --fail-threshold=0.2` → 기존과 같은
   출력, exit 0.
2. `node tools/crawl-faculty-profiles.mjs --only=<교수 2명> --timeout-ms=1 --fail-threshold=0.2`
   → `전부 실패 2/2 (100%) ≥ 20%` 류의 `::error::` 줄, exit 2. 파일은 쓰지 않음(드라이런).
3. `node tools/automation/issue.mjs --dry-run --title "[자동] 테스트 (2026-09-04)" --body-file x.md`
   → 제목·본문·판정 출력.
4. `workflow_dispatch` `simulate_failure=true, dry_run=true` → 실패 스텝이 step summary 에
   이슈 본문을 찍고 워크플로는 **빨간불**. 그 다음 한 번만 `dry_run=false` 로 실제 이슈 생성
   확인 후 이슈를 닫습니다. 같은 조건으로 한 번 더 돌리면 새 이슈가 아니라 **댓글**이어야
   합니다(닫기 전에 확인).

### 함정

- `crawlPerson` 의 요청 간 300ms 는 고정값입니다. 임계는 사람 단위라 33명 × 20% = 7명 전부
  실패가 기준이 됩니다 — 한두 명의 userId 만료는 이슈가 안 되고 로그에만 남습니다(의도).
- Node 24 타입 스트리핑 경로: `core.ts` 에 의존성이 생기면 스크립트 import 가 깨집니다.

---

## 2. 정기 리마인더 워크플로 (백로그 3)

### 파일

| 파일 | 역할 |
| --- | --- |
| `.github/workflows/reminders.yml` | cron 5개 + dispatch |
| `tools/automation/remind.mjs` | 종류·학기를 받아 템플릿을 채우고 `issue.mjs` 호출 |
| `tools/automation/reminders/semester-regular.md` | 정규학기(10·20) 체크리스트 |
| `tools/automation/reminders/semester-seasonal.md` | 계절학기(11·21) 체크리스트 |
| `tools/automation/reminders/admission-calendar.md` | 새 학년도 입학 캘린더 재작성 |

### 스케줄 → 종류 (전부 09:00 KST = 00:00 UTC)

| cron (UTC) | 시기 | kind | 대상 학기 계산 |
| --- | --- | --- | --- |
| `0 0 1 12 *` | 12월 1일 | semester | 겨울 `YYYY-21` (YYYY = 현재 연도) |
| `0 0 15 1 *` | 1월 15일 | semester | 1학기 `YYYY-10` |
| `0 0 1 6 *` | 6월 1일 | semester | 여름 `YYYY-11` |
| `0 0 15 7 *` | 7월 15일 | semester | 2학기 `YYYY-20` |
| `0 0 25 4 *` | 4월 25일 | admission-calendar | `YYYY+1` 학년도 |

워크플로는 `github.event.schedule`(발화한 cron 문자열)로 kind·학기를 고릅니다. 시기는
계획서 1-3 의 안 그대로이며 cron 값만 고치면 됩니다.

### 동작

```
node tools/automation/remind.mjs --kind semester --term 2026-21 [--dry-run]
node tools/automation/remind.mjs --kind admission-calendar --year 2027 [--dry-run]
node tools/automation/remind.mjs --schedule "0 0 1 12 *" [--dry-run]   # 워크플로가 쓰는 형태
```

- 템플릿의 `{{term}}`·`{{termLabel}}`(= `{{year}}학년도 <학기명>`, 예 "2026학년도 겨울계절학기")·`{{year}}` 를 채웁니다.
- **계절학기는 마일리지 제도 밖**(크롤러 `backfill.mjs` 주석 실측)이라 `semester-seasonal.md`
  는 체커 카탈로그 갱신만 담고, `semester-regular.md` 는 체커 + 마일리지 + 교재 수동 갱신
  (계획서 6절) + 오케스트레이터 명령(`node tools/automation/update-semester.mjs --target {{term}}`)
  + 각 README 링크를 담습니다.
- 이슈 제목(정확히 이 형식): `[자동] {{termLabel}}({{term}}) 데이터 갱신 체크리스트` /
  `[자동] {{year}}학년도 입학 캘린더 재작성`. 학기가 제목에 들어가 자연히 유일하고, 그래도
  `issue.mjs` 의 중복 방지가 겹칩니다.
- dispatch 입력: `kind`(choice), `term`/`year`(override), `dry_run`(기본 true).

### 검증

1. `node tools/automation/remind.mjs --kind semester --term 2026-21 --dry-run` → 계절 템플릿,
   마일리지 항목 없음. `--term 2027-10` → 정규 템플릿, 오케스트레이터 명령 포함.
2. `--schedule "0 0 25 4 *" --dry-run` → 입학 캘린더, 연도 = 올해+1.
3. dispatch dry-run 으로 step summary 확인. 실제 이슈 생성은 하지 않음(첫 실전이 12월 1일).

---

## 3. 입학처 변경 감지 워커 (백로그 2)

### 실측으로 바뀐 전제 (2026-09-04)

계획서 1-2 가 감시 대상으로 적은 `…/html/rolling/` 같은 **디렉터리 루트는 403** 입니다.
실제로 쓸 수 있는 페이지는:

| 신호 | URL | 형태 |
| --- | --- | --- |
| **S1 공식 입학 캘린더** | `https://admission.yonsei.ac.kr/seoul/admission/html/counsel/calendar.asp?s_year=<YYYY>&s_cate=` | 서버 렌더 EUC-KR HTML. `table.calendarTable` 에 월(`th`) → 일(`td.day`) → `span.cate cateN`(트랙) · `span.tag`(전형) · `p.subject`(제목) · `p.des`(설명 HTML). **우리 `content/admission-guide.json` 의 `calendar.events` 가 바로 이 표에서 온 것**입니다(문구·일시 일치). |
| **S2 모집요강 PDF** | `…/html/{rolling,regular,transfer}/guide.asp` | PDF 뷰어 페이지. 본문은 JS 로 넘기지만 `<a href="/seoul/upload/guide/<타임스탬프><ID>.PDF">` 와 `download.asp?furl=guide/…` 링크가 정적으로 있어 **파일명이 바뀌면 새 모집요강 공표**입니다(현재 2027학년도 수시: `20260529204109…`). |
| **S3 공지 목록** | `…/html/{rolling,regular,transfer}/notice.asp` | 목록의 제목·작성일. `조회수` 는 매번 변하므로 버립니다. |

`s_cate` 값: `TYPE1` 수시 · `TYPE2` 정시 · `TYPE3` 편입학 · `TYPE4` 재외국민 · `TYPE5` Int'l ·
`TYPE67` 의대 학사편입 · `TYPE8` 약학대학. 빈 값이 전체.

### 사이트 → 우리 스키마 대응

| 사이트 `cate` | 우리 `track` | 비고 |
| --- | --- | --- |
| 수시모집 | `susi` | |
| 재외국민 | `overseas` | |
| 정시 · 편입학 · Int'l Student · 약학대학 · 수시(구형 라벨) | (없음) | 우리 캘린더 범위 밖 — 이슈에 "미대응 항목"으로만 나열 |

| 사이트 `tag` | 우리 `type` |
| --- | --- |
| 공통 | `common` |
| 학생부교과(추천형) | `subject` |
| 학생부종합전형 | `comprehensive` |
| 논술전형 | `essay` |
| 특기자전형 | `talent` |
| (재외국민 트랙의) 공통 | `common` |

2026 실측: 사이트 28건 중 수시모집 21 + 재외국민 2 = 23건이 우리 범위이고 우리 파일은 22건
입니다(재외 1건 차이 — 첫 실행이 이 차이를 보고해야 정상). 2027 은 실질 1건뿐(미공표).

### 파일

| 파일 | 역할 |
| --- | --- |
| `tools/automation/admission-watch.mjs` | 수집·정규화·대조·리포트 |
| `.github/workflows/admission-watch.yml` | 주 1회 + dispatch |
| 브랜치 `bot/admission-watch` | 스냅샷 보관: `snapshots/calendar-<YYYY>.json`, `snapshots/guide-pdf.json`, `snapshots/notices.json`, `state.json` |

### 동작

```
node tools/automation/admission-watch.mjs --snapshots <dir> [--years 2026,2027] [--report <md>] [--compare-content] [--dry-run]
```

- 대상 연도 기본값: 현재 학년도와 +1(입학처는 다음 학년도 일정을 미리 게시).
- 요청 8개(캘린더 2 + guide 3 + notice 3), 300ms 간격, UA 고정, GET 만.
- **정규화** (S1 `subject`·`des`, S3 제목 공통): `TextDecoder('euc-kr')` → 태그 제거(`des` 는
  `<p>`·`<br>` 를 줄 경계로) → 엔티티(`&nbsp;` 등) 해제 → NFC → 대시 통일(`‐ ‑ – — -` → `-`) →
  공백 접기. 대시를 통일하는 이유: 우리 파일은 `–`, 원문은 `-` 라 통일하지 않으면 전 항목이
  가짜 변경이 됩니다.
- S1 파싱 결과 이벤트: `{date: 'YYYY-MM-DD', cate, tag, title, lines[]}`. 날짜는 `s_year` +
  `th` 월 + `td.day` 일.
- **대조 2종**:
  1. 스냅샷 대조(전 신호) — 직전 실행과 비교해 신규·삭제·변경(제목·라인·PDF 파일명·공지
     제목)을 냅니다. 이것이 "변경 감지"의 본체입니다.
  2. `--compare-content` — S1 을 위 대응표로 우리 스키마에 사상해 `content/admission-guide.json`
     과 비교합니다(ko 만). 결과는 리포트의 별도 절 "우리 캘린더와의 차이"로 갑니다. 실측
     예: 원문 `외국국적` vs 우리 파일 `외국적` — **이미 존재하는 오타를 첫 실행이 잡아야
     합니다**(검증 기준).
- 리포트(`--report`)는 마크다운: 신호별 절 + 변경 이벤트는 우리 스키마 JSON 조각(ko 만, en
  은 빈 문자열)을 코드블록으로 — 담당자가 파일에 붙여 넣고 콘솔 DeepL 로 영문을 채웁니다.
  자동 반영은 하지 않습니다(계획서 2절 2).
- 종료 코드: **0 변경 없음 · 10 변경 있음 · 1 수집 실패**(요청 실패·파싱 0건). `--dry-run`
  은 스냅샷을 쓰지 않습니다.
- 워크플로(`0 0 * * 1`, 월요일 09:00 KST):
  - `permissions: { contents: write, issues: write }`.
  - main 체크아웃 + `bot/admission-watch` 를 `.admission-snapshots/` 에 체크아웃(브랜치가
    없으면 `git checkout --orphan` 으로 생성).
  - 스크립트 실행 → 10 이면 스냅샷 커밋·푸시(`github-actions[bot]` 아이덴티티) + 리포트를
    본문으로 `[자동] 입학처 변경 감지 (YYYY-MM-DD)` 이슈; 1 이면 `[자동] 입학처 감시 실패
    (YYYY-MM-DD)` 이슈(감시 실패는 사이트에 무영향 — 알림만). `dry_run` 이면 둘 다 summary 로.
  - 스냅샷은 정규화된 텍스트·JSON 뿐이라 수십 KB 입니다(계획서 5절 비대화 대응).

### 검증

1. 로컬 1회: `--snapshots ./tmp-snap --report r.md` → exit 10(첫 스냅샷), 리포트에 2026 캘린더
   23건(수시 21·재외 2)·PDF 3건·공지 목록.
2. 로컬 2회: 같은 명령 → exit 0, 변경 없음.
3. `tmp-snap/snapshots/calendar-2026.json` 의 제목 하나를 고치고 재실행 → exit 10, 그 항목만
   "변경"으로 보고.
4. `--compare-content` → "우리 캘린더와의 차이" 절에 `외국국적/외국적` 과 재외국민 1건 차이가
   나오고, 대시·공백 차이는 **나오지 않아야** 합니다.
5. dispatch dry-run → step summary 에 리포트. 첫 실 스케줄 실행 후 `bot/admission-watch`
   브랜치 생성 확인.

### 함정

- EUC-KR 페이지에 `&nbsp;` 와 인라인 스타일 `<span>` 이 많습니다 — 정규화 없이 diff 하면
  전부 잡음입니다.
- 사이트에는 `[2022 재외(12년)]` 같은 낡은 행이 남아 있습니다. 안정적이라 diff 잡음은 아니지만
  `--compare-content` 에서 "미대응 항목"으로만 나열합니다.
- 캘린더의 `des` 는 편집기 HTML 원문이라 `<p>` 중첩이 깨져 있습니다(`<p class="des"><p>…`).
  정규식 태그 제거로 충분하고, 굳이 파서를 쓰지 않습니다.

---

## 4. 학기 갱신 오케스트레이터 (백로그 4)

### 목표

계획서 2-1: **"쿠키 한 번 넣으면 나머지 전 단계가 스스로 돈다."** 판단이 필요한 지점은
멈추지 않고 체크리스트로 출력만 합니다. 커밋·푸시는 하지 않습니다.

### 선행 리팩터 — 학기 목록 단일화

`tools/checker/crawl-terms.mjs` 의 `TERMS`(2022~2026, 2026-21 제외)와
`tools/checker/build-catalog.mjs` 의 `EXPECTED_TERMS`(하드코딩 배열)는 새 학기마다 **두 곳을
손으로** 고쳐야 합니다(checker README 2단계). 오케스트레이터가 학기를 넣으려면 한 곳이어야
합니다.

- 신규 `tools/checker/terms.mjs`: `export const DEFAULT_LAST_TERM = '2026-20'`,
  `export function termsThrough(last)` — `2022-10` 부터 `last` 까지 `10·11·20·21` 순으로 생성.
- 두 스크립트가 이 모듈을 쓰고, `--through <YYYY-SS>` 플래그로 마지막 학기를 넘겨받습니다.
  플래그 없으면 `DEFAULT_LAST_TERM` — 기존 동작과 동일해야 합니다(검증 항목).
- `crawl-terms.mjs` 의 스냅샷·복원 계약(머리말 ⚠️)은 건드리지 않습니다.

### CLI

```
node tools/automation/update-semester.mjs --target 2026-21 [--only checker|mileage] [--skip-crawl]
                                          [--crawler-dir <경로>] [--max-retries 2] [--dry-run]
```

- `--crawler-dir` 기본값은 `CRAWLER_DIR` 환경변수 → 없으면 `crawl-terms.mjs` 와 같은 로컬 경로.
- 대상이 **계절학기(11·21)면 마일리지 단계는 자동 생략**하고 그 사실을 출력합니다(제도 밖).
- `--dry-run` 은 실행할 명령과 게이트를 순서대로 찍기만 합니다.

### 단계 (각 단계 완료를 `tools/automation/.state/update-<target>.json` 에 기록 — 재실행 시 이어감)

```
① 사전 점검   크롤러 .env 의 JSESSIONID 존재(--skip-crawl 아니면), 사이트 저장소 경로, db.gz 존재
② 체커 크롤   node tools/checker/crawl-terms.mjs --through <t> --only <t>
              exit≠0 → "쿠키 갱신 후 같은 명령 재실행" 안내, exit 1  (crawl-terms 가 학기 단위 재개)
③ 카탈로그    node tools/checker/build-catalog.mjs --through <t>
              exit 1 → reports/rename-report.json 경로와 curatedRenameRequired 출력, exit 1
④ 매칭 하네스 node tools/checker/verify-matching.mjs   exit 1 → 중단
⑤ 마일리지    (정규학기·--only checker 아님)
              raw/courses-<t>.json → <crawler>/courses.json 복사  ← 재크롤 없이 시드
              node <crawler>/src/index.js mileage  (+ 에러 레코드 재시도 루프, 크롤러 run-update.mjs 와 동일)
              기존 db.gz 를 data/mileage-history.prev.db.gz 로 보관(미추적)
              node --max-old-space-size=8192 tools/mileage/build-db.mjs --courses … --mileage …
                   --base <db.gz> --verify-against <db.gz>   → 불일치 0 아니면 중단
⑥ 백테스트    prev.db.gz 와 새 db.gz 를 직전 정규학기로 각각 DUMP → 공통 분반만 MAE·Hit±3 표 출력
              (채택 판단은 사람 — 멈추지 않음)
⑦ 번들       node tools/mileage/precompute.mjs --target <t>
⑧ 상수       src/lib/mileage/bundle.ts 의 MILEAGE_TERM year/semester 를 정규식으로 치환
⑨ 검증       npm run typecheck
⑩ 마무리     스테이징할 파일 목록(체커 3 + 마일리지 3~4) + 수동 체크리스트 출력:
              professor-history.csv 보강 · precompute RECENCY_ALIAS 재검토 · 백테스트 채택 ·
              교재 수동 갱신(계획서 6절) · 화면 확인(체커 STEP 03 · 마일리지 탭)
```

- 쿠키 만료는 정상 시나리오입니다: ②·⑤ 의 크롤 종료 코드로 감지해 안내 후 exit 1. 재실행하면
  `.state` 와 각 도구의 자체 재개(학기 파일·분반 키)로 이어서 돕니다.
- 크롤러 저장소의 `run-update.mjs`(마일리지 한정)는 이 스크립트가 흡수합니다 — 그쪽 머리말에
  "yonsei-me 의 update-semester.mjs 가 정본" 한 줄을 남깁니다.

### 검증

1. 리팩터 무회귀: `node tools/checker/build-catalog.mjs` 를 플래그 없이 돌려 `public/data/
   course-catalog.json`·`catalog-history.json`·`rename-report.json` 에 **diff 가 없어야** 합니다.
   `crawl-terms.mjs --list` 의 학기 목록이 기존과 동일해야 합니다.
2. `--dry-run --target 2026-21` → 계절학기라 ⑤~⑧ 생략 표시.
3. `--target 2026-20 --only checker --skip-crawl` → 기존 raw 로 ③④ 통과, 산출물 diff 없음.
4. `--target 2026-20 --only mileage --skip-crawl` → 기존 크롤 JSON 으로 ⑤(build-db)~⑨ 완주.
   `public/data/mileage-2026-20*.json` 과 `bundle.ts` 에 실질 diff 가 없어야 합니다(같은 입력의
   재생성). 시간이 오래 걸리므로(수십 분) 이 검증은 한 번만.
5. 첫 실전은 **2026-21 겨울계절(12월)** — 체커만 도는 가장 가벼운 학기라 리허설로 적합합니다.
   정규학기 전체 경로의 첫 실전은 2027-10(1월 중순 리마인더).

### 함정 (README 두 곳의 함정 모음이 정본 — 오케스트레이터가 강제하는 것만 요약)

- `--base` 없이 build-db 를 돌리면 과거 이력이 통째로 사라집니다 → 인자를 고정합니다.
- `courses.json` 은 마일리지의 정본 입력이면서 `crawl-terms.mjs` 가 실행 중 잠깐 바꿨다가
  복원하는 파일입니다. ② 가 끝난 뒤 ⑤ 가 raw 를 복사해 시드하므로 순서를 바꾸면 안 됩니다.
- 분반 번호는 2자리 문자열, `rank` 로 두 DB 를 조인하지 않기(off-by-one 이력) — build-db 가
  이미 지키므로 오케스트레이터는 건드리지 않습니다.
- `node --max-old-space-size=8192` 없이는 build-db 가 OOM 입니다(README 사용법 그대로).

---

## 5. Worker 분할과 브리프 요점

| Worker | 항목 | 선행 | 병렬 가능 |
| --- | --- | --- | --- |
| A | 0-3 `issue.mjs` + 항목 1 + 항목 2(리마인더) | — | C 와 동시 시작 (수정 파일이 겹치지 않음) |
| B | 항목 3 (입학처 감지) | A 의 `issue.mjs` | A 완료 후 |
| C | 항목 4 (오케스트레이터 + 체커 학기 리팩터) | 없음 (이슈를 만들지 않음) | A 와 동시 시작 |

- 브리프에는 이 문서의 해당 절 전체 + 계획서 2절(원칙) + 관련 README 경로 + 위 검증 명령을
  그대로 넣습니다. Worker 는 `tools/automation/` 밖의 파일 중 표에 적힌 것만 수정합니다.
- 병렬 Worker 는 **임시 stub 을 만들지 않습니다**(과거 사고: stub 정리 중 상대 Worker 의 실제
  파일 삭제). 공용 파일(`issue.mjs`)은 A 가 끝난 뒤에만 참조합니다.
- 커밋은 Advisor 가 검증 후 항목 단위로, 파일을 명시해 스테이징합니다(`git add -A` 금지 —
  작업 트리에 타 세션 WIP 가 상시 섞여 있습니다).

## 6. 이 설계에서 확정한 결정 (계획서와 다른 점)

1. 새 코드는 `tools/automation/` 에 모읍니다(계획서의 `tools/update-semester.mjs` 경로 대체).
2. 입학처 감시는 페이지 diff 가 아니라 **공식 캘린더 구조 파싱 + 모집요강 PDF 파일명 + 공지
   제목** 3신호로 하고, 우리 `admission-guide.json` 과의 구조 대조(`--compare-content`)를
   제공합니다. 디렉터리 루트 URL 은 403 이라 감시 대상에서 뺍니다.
3. 계절학기(11·21)는 마일리지 단계와 리마인더 항목에서 제외합니다(제도 밖).
4. 체커의 학기 목록은 `tools/checker/terms.mjs` 한 곳으로 모읍니다(오케스트레이터 선행 리팩터).
5. 실패 임계는 "전부 실패한 교수 비율 ≥ 20%", 종료 코드 2. 부분 실패는 임계에 넣지 않습니다.
6. 이슈 헬퍼는 같은 제목 접두의 열린 이슈가 있으면 댓글로 잇습니다. 라벨 `automation`.
