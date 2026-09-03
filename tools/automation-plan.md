# 크롤링 자동화 계획

작성 2026-09. 저장소의 크롤 파이프라인 전수 조사를 바탕으로, **무엇을 어떤 순서로
자동화할지**와 **일부러 자동화하지 않는 것**을 정리한 계획서입니다. 각 파이프라인의
상세 절차는 해당 디렉터리 README(`tools/checker/`, `tools/mileage/`)가 정본이고,
이 문서는 그 위의 운영 계획만 다룹니다.

---

## 1. 현황 인벤토리

### A. 자동화 대상 5건 — 사이트 사용처와 출처

각 데이터가 **사이트 어디에서 소비되고**(경로 · 컴포넌트), **어디에서 오는지**(원 출처
링크)를 먼저 고정합니다. 구체 계획은 이 표를 기준으로 씁니다.

| # | 데이터 | 사이트에서 쓰는 곳 | 원 출처 | 저장 위치(산출물) |
| --- | --- | --- | --- | --- |
| 1 | 교수 학술활동 프로필 — 셸(연락처·홈페이지) + 논문·수상·학술활동·연구과제·지적재산권 (31명) | 교수진 상세 `/{locale}/faculty/<교수이름>` (`src/app/[locale]/faculty/[slug]/page.tsx`, 전수 프리렌더) · CMS 교수진 "실적 불러오기" | 교원정보시스템 `devcms.yonsei.ac.kr` — 링크 상세 ① | Supabase `content_files` = `content/faculty-profiles/<이름>.json` |
| 2 | 수강편람 과목 카탈로그 — 2022-1~현재 전 학기 통합(학정번호 키·별칭) | 학부 › 졸업요건 진단기 `/{locale}/undergraduate/checker` (`GraduationChecker.tsx` 가 `/data/course-catalog.json` fetch) | 연세포털 수강편람 내부 API `underwood1.yonsei.ac.kr` — 링크 상세 ② | `public/data/course-catalog.json` + 이력 정본 `tools/checker/data/catalog-history.json` |
| 3 | 수강신청 마일리지 이력 — 2015-2~ 분반별 컷·배정·순위 | 학부 › 마일리지 전략 `/{locale}/undergraduate/mileage` (`MileagePlanner.tsx`, 번들 URL 은 `src/lib/mileage/bundle.ts` 의 `MILEAGE_TERM`) | 같은 수강편람 내부 API(요약·원장) — 링크 상세 ② | `public/data/mileage-<년>-<학기>[-detail].json` + `tools/mileage/data/mileage-history.db.gz` |
| 4 | 강의계획서 교재 — 과목별 주교재·부교재·참고자료 서지 + 표지 이미지 | 학부 › 교과목 소개 `/{locale}/undergraduate/courses` 의 교재 팝업 (`CourseCatalog.tsx` → `TextbookPopover.tsx`; 대학원 교과목 페이지에는 미사용) | 수강편람 강의계획서(②) + 교보문고 CDN — 링크 상세 ③ | `content/textbooks.json` + `public/img/textbooks/<ISBN>.jpg` |
| 5 | 입학 캘린더 — 2026학년도 전형 일정 22건(수시 21 · 재외국민 1) | 소개 › 입학 안내 `/{locale}/about/admission` 3번 섹션 (`AdmissionGuide.tsx` → `AdmissionCalendar.tsx`) | 연세대 입학처 공지·모집요강 — 링크 상세 ④ | `content/admission-guide.json` 의 `calendar` 블록 |

수집 코드·주기·현재 상태:

| # | 수집 코드 | 주기 | 현재 상태 |
| --- | --- | --- | --- |
| 1 | `tools/crawl-faculty-profiles.mjs` + `src/lib/faculty-crawl/core.ts` (CMS 버튼 `/api/admin/faculty-crawl` 과 공용) | 매월 2일 03:00 KST | **자동화 완료** — `.github/workflows/crawl-faculty-profiles.yml` → DB 병합 |
| 2 | 외부 크롤러 `courses` 명령 + 래퍼 `tools/checker/crawl-terms.mjs` → `build-catalog.mjs` | 학기 1회 | 수동 — **로그인 쿠키 필요** |
| 3 | 외부 크롤러 `npm run mileage` + `tools/mileage/build-db.mjs` → `precompute.mjs` | 학기 1회 | 수동 — **로그인 쿠키 필요, 수 시간 소요** |
| 4 | 외부 크롤러(강의계획서) + `tools/textbooks/mirror-covers.mjs` → `build-content.mjs` | 학기 1회 | 수동 — 표지 미러링만 쿠키 불필요 |
| 5 | 수집 코드 없음 — 전량 수기 입력(관리자 콘솔 미지원, 파일 직접 편집) | 학년도 1회 전면 + 변경 시 | 수동 |

### 출처 링크 상세

**① 교원정보시스템** (공개 — 로그인 불필요)

- 상세 셸: `https://devcms.yonsei.ac.kr/faculty/name_search.do?mode=view&userId=<암호화ID>`
- 리포트: `https://devcms.yonsei.ac.kr/faculty/name_search.do?mode=report&userId=<암호화ID>&reportType=<article|award|conference|funding|patent>` — 100행 초과 시 2쪽은 `mode=report_next` (원본 제공은 분류당 최대 2쪽·200건)
- `userId` 는 각 프로필 파일의 `sourceUrl` 에 저장돼 있고, 옛 `me.yonsei.ac.kr` 표기는 `core.ts` 의 `infoHost()` 가 devcms 로 바꿔 요청합니다.

**② 연세포털 수강편람 시스템** (로그인 세션 쿠키 `YONSEI_COOKIE` 필요 — 수 시간 만료)

- 베이스: `https://underwood1.yonsei.ac.kr/` — 과목 카탈로그·마일리지 요약/원장·강의계획서 모두 이 시스템의 내부 `.do` API 입니다.
- 이 저장소에 문서화된 API 명: 학기 목록 `findMlgSyySmtDivCdList` (최근 6개 학기 롤링 창 — 그 이전 학기는 학기 코드를 직접 지정해 요약·원장 API 호출).
- **엔드포인트별 정확한 경로·파라미터의 정본은 크롤러 코드**(`src/` 의 courses·mileage·backfill)입니다. 이 저장소에는 래퍼만 있습니다.
- 크롤러는 로컬 작업 사본(`Desktop\크롤링`, 원본 <https://github.com/halfjinhyeon/yosnei-mileage-crawler>)을 **조직 저장소로 푸시해 정본으로 삼기로 결정**(2026-09). 이관 절차는 3절 **2-0** 체크리스트를 따르고, 엔드포인트 상세는 이관 후 그 저장소 기준으로 확정합니다.

**③ 교재 표지**

- 교보문고 CDN: `https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/<ISBN>.jpg` — ⚠️ 미보유 ISBN 도 HTTP 200 + `image/jpeg` 헤더의 플레이스홀더(실제는 PNG 34,150B)를 주므로 JPEG 매직바이트로 판별.
- 교보 미보유·오기 ISBN 의 대체 출처(Open Library 등)는 `tools/textbooks/mirror-covers.mjs` 의 `FALLBACK`/`OVERRIDE` 표에 ISBN 별 URL·검수 근거가 명시돼 있습니다.

**④ 연세대 입학처·일반대학원** (공개 — 로그인 불필요)

- 수시: `https://admission.yonsei.ac.kr/seoul/admission/html/rolling/`
- 정시: `https://admission.yonsei.ac.kr/seoul/admission/html/regular/`
- 편입: `https://admission.yonsei.ac.kr/seoul/admission/html/transfer/`
- 대학원: `https://graduate.yonsei.ac.kr/graduate/admission/`
- 참고: 링크 허브 페이지(`/{locale}/admission`)는 같은 섹션의 `guide.asp` 딥링크(예 `…/rolling/guide.asp`)를 씁니다. 변경 감지 워커(3절 1-2)의 감시 대상 후보이기도 합니다.

### B. 1회성 완료 — 자동화 제외 (5건)

구 게시판 10종 전량(`tools/crawl-boards.mjs`), 구 사이트 자산 R2 미러링
(`scripts/mirror-legacy-assets.mjs`), 첨부 크기 백필, 구 홈페이지 정적 페이지 스크랩
(`tools/import-raw/`), 연구실 연구주제 수집(`tools/labs/`). 제외 사유는 [6절](#6-자동화하지-않는-것).

---

## 2. 원칙 (모든 단계 공통)

1. **상대 서버 배려** — 순차 처리 + 요청 간 300ms, 식별 가능한 User-Agent, HEAD 금지
   (WAF 403). 기존 크롤러의 매너 규칙을 새 워커에도 그대로 적용합니다.
2. **파괴적 자동 반영 금지** — 자동 실행은 병합 전용(교수 실적)이거나 감지·알림 전용
   (입학처)입니다. 덮어쓰기가 필요한 파이프라인(학기 갱신)은 사람이 게이트를 통과시킵니다.
3. **검증 게이트 없이는 반영 없음** — 각 파이프라인의 기존 게이트(학기 일치 검증,
   build-catalog exit 1, verify-matching 6/6, `--verify-against` 불일치 0, 백테스트 공통
   분반 비교, typecheck)를 자동화가 우회하지 않습니다.
4. **비밀값** — `YONSEI_COOKIE`(학사 계정 세션)는 저장소·Actions 어디에도 저장하지
   않습니다. 이 저장소는 Public이므로 Actions Secrets 추가는 항목마다 사람이 판단합니다
   (`crawl-faculty-profiles.yml` 머리말의 service-role 키 주의와 동일).
5. **알림 채널은 GitHub Issue 하나로 통일** — 실패·변경 감지·정기 리마인더 모두
   `GITHUB_TOKEN`(issues: write)으로 이슈를 만듭니다. 이력이 남고 추가 인프라가 없습니다.

---

## 3. 단계별 계획

### Phase 1 — 로그인 불필요 · 즉시 착수 가능

**1-1. 교수 학술활동 워크플로 실패 가시화** (기존 자동화 보강)

현재 `tools/crawl-faculty-profiles.mjs`는 개별 요청이 실패해도 로그만 남기고 exit 0으로
끝나므로, 원본 마크업 변경·차단 같은 구조적 실패가 나도 **워크플로는 초록불**입니다.

- 스크립트에 실패 임계 초과 시(예: 대상의 20% 이상 전부 실패) exit 1 옵션을 추가하고
  워크플로에서 켭니다. 병합 전용 설계라 부분 실패는 데이터를 훼손하지 않으므로,
  임계 미만 실패는 로그로 충분합니다.
- 워크플로에 `if: failure()` 스텝으로 실행 로그 링크를 담은 이슈를 자동 생성합니다.
  (같은 제목의 열린 이슈가 있으면 중복 생성하지 않습니다.)

**1-2. 입학처 변경 감지 워커** (신규 — 입학 캘린더의 자동화 형태)

입학처 일정은 구조화 API가 아니라 공지 HTML·모집요강 PDF이고, 파일 disclaimer부터
"세부 시간·장소 변경 가능"인 데이터라 **무검수 자동 반영은 하지 않습니다**. 대신:

- 주 1회 GitHub Actions로 `admission.yonsei.ac.kr` 수시(`rolling/`)·정시(`regular/`)·
  편입(`transfer/`) 페이지를 받아 **본문 영역만 추출·정규화**(매 요청 변하는 토큰·배너
  노이즈 제거) 후 직전 스냅샷과 비교합니다.
- 스냅샷은 전용 브랜치(예: `bot/admission-watch`)에 봇 커밋으로 보관해 main을 오염시키지
  않습니다. 변경이 있으면 diff 요약을 이슈로 올리고, 담당자가 확인 후
  `content/admission-guide.json`을 갱신합니다(영문은 콘솔의 DeepL 번역 재사용).
- 새 학년도 전환(모집요강 공표기, 통상 4~5월)에는 감지와 별개로 **연 1회 전면 재작성
  리마인더 이슈**를 만듭니다(1-3의 리마인더 워크플로에 포함). 현재 파일이 2026학년도분이라
  **2027학년도 갱신이 첫 실전**입니다.

**1-3. 정기 리마인더 워크플로** (신규 1개로 통합)

cron 스케줄 하나짜리 워크플로가 시기별 체크리스트 이슈를 만듭니다. 사람이 해야 하는
작업(쿠키 갱신이 필요한 학기 크롤, 입학 캘린더 재작성)의 누락을 막는 게 목적입니다.

| 시기(안) | 이슈 내용 |
| --- | --- |
| 12월 초 · 1월 중순 · 6월 초 · 7월 중순 | 새 학기(겨울·1학기·여름·2학기) 데이터 갱신 체크리스트 — `tools/checker/README.md`·`tools/mileage/README.md` 절차 링크 |
| 4월 말 | 새 학년도 입학 캘린더 전면 재작성 |

시기는 실제 수강신청·모집요강 공표 일정에 맞춰 조정합니다(cron 값만 고치면 됨).

### Phase 2 — 학기 파이프라인 반자동화 (쿠키만 사람이)

핵심 병목은 `YONSEI_COOKIE`입니다: 학사 계정 로그인 세션이고 수 시간이면 만료되며
커밋·Secrets 저장 금지 대상입니다. 그래서 목표를 "완전 무인"이 아니라 **"쿠키 한 번
넣으면 나머지 전 단계가 스스로 돈다"**로 잡습니다.

**2-0. 크롤러 저장소 이관** (선결 작업 — 사람이 로컬에서 푸시)

로컬 작업 사본(`Desktop\크롤링`)을 `yonsei-mech` 조직 저장소(예: `yonsei-mech/yonsei-crawler`)
로 푸시해 정본으로 삼습니다. 같은 소유자여야 Claude 세션 attach 와 Actions 체크아웃이
됩니다. **푸시 전 체크리스트**:

1. **`.env`(YONSEI_COOKIE)가 커밋 대상에 없는지** — `.gitignore` 에 `.env` 명시 후
   `git status` 로 확인. 로컬에 git 이력이 이미 있다면 **과거 커밋에 쿠키가 들어간 적
   없는지도** 확인하고, 의심되면 이력 없이 새 저장소로 초기화해 푸시합니다.
   (쿠키가 이력에 있었다면 푸시 여부와 무관하게 즉시 재로그인으로 세션을 무효화할 것.)
2. **크롤 산출물 제외** — `courses.json`, `courses.json.pre-checker`, `mileage_data.json`,
   `mileage_data_*.json`(백업 세대) 등은 `.gitignore` 로 막습니다. 데이터는 이 저장소
   파이프라인이 관리하고, 크롤러 저장소는 코드만 둡니다.
3. **README 경고 유지** — "쿠키는 `.env` 로만, 절대 커밋 금지"를 크롤러 README 에도 명시.
4. **공개/비공개 판단** — 5절 결정 표 참조.
5. **이관 후 이 저장소 참조 갱신** — `tools/checker/crawl-terms.mjs` 의 `CRAWLER_DIR`
   기본값(현재 Windows 절대경로 하드코딩)과 `tools/checker/README.md` ·
   `tools/mileage/README.md` 의 경로·링크 표기를 새 저장소 기준으로 바꿉니다.
   오케스트레이터(2-1)는 `CRAWLER_DIR` 미지정 시 조직 저장소를 클론하도록 만들 수
   있게 됩니다.

**2-1. 원샷 오케스트레이터 `tools/update-semester.mjs`** (신규)

로컬(크롤러 repo가 있는 머신)에서 `node tools/update-semester.mjs --target 2027-10`
한 번으로 다음을 순서대로 실행·검증합니다. 각 단계는 기존 스크립트를 그대로 호출하고,
게이트 실패 시 그 지점에서 멈춰 **재실행하면 이어서 진행**합니다(기존 이어받기 설계 활용).

```
① checker:   crawl-terms --only <신학기> → build-catalog(게이트) → verify-matching 6/6
② mileage:   크롤러 courses + npm run mileage → build-db --base --verify-against
             → backtest 신·구 공통 분반 비교(리포트 출력, 채택 판단은 사람)
             → precompute --target → bundle.ts MILEAGE_TERM 갱신
③ textbooks: 강의계획서 크롤 → mirror-covers(신규 ISBN만) → build-content
④ 마무리:    npm run typecheck → 커밋 대상 파일 목록 출력(명시 스테이징 — git add -A 금지)
```

- 쿠키 만료(FatalError)는 정상 시나리오로 취급: "쿠키 갱신 후 같은 명령 재실행" 안내를
  출력하고 exit 1. 지금 수동 절차와 동일한 복구 경로입니다.
- `professor-history.csv` 보강, `RECENCY_ALIAS` 재검토, backtest 채택 판단처럼 **판단이
  필요한 지점은 자동화하지 않고** 체크리스트로 출력만 합니다.
- 커밋·푸시는 하지 않습니다. 산출물 검토 후 사람이 커밋합니다(마일리지 README의
  "측정하지 않은 개선은 주장하지 않는다" 원칙과 명시 스테이징 규칙 유지).

**2-2. 교보 표지 미러링 분리 실행** (소규모)

표지 미러링(`mirror-covers.mjs`)은 로그인이 필요 없으므로, 강의계획서 크롤 산출물만
있으면 언제든 단독 재실행 가능하게 오케스트레이터에서 분리 옵션(`--only textbooks-covers`)
을 둡니다. 플레이스홀더 판정(JPEG 매직바이트)·OVERRIDE/FALLBACK 표는 기존 로직 그대로.

### Phase 3 — 완전 무인화 검토 (착수 보류, 판단 필요)

- **쿠키 자동 발급(학교 SSO 자동 로그인)은 권장하지 않습니다.** 학사 계정 보안과 이용
  약관 리스크가 있고, 실패 시 계정이 잠기는 최악 시나리오의 비용이 자동화 이득보다
  큽니다. 하려면 별도 계정·학교 측 협의가 선행돼야 합니다.
- 차선: 쿠키 수명(수 시간) 안에 전 단계가 끝나도록 오케스트레이터를 로컬 cron/작업
  스케줄러에 걸고, 시작 직전에만 사람이 쿠키를 갱신하는 "예약 반자동"까지가 현실적
  상한입니다. 마일리지 이력 크롤이 수 시간 걸리므로 최근 6학기 롤링 창 안에서
  이어받기가 되는 현 구조가 전제입니다.

---

## 4. 스케줄 총괄 (계획 완성 시점 기준)

| 무엇 | 방식 | 주기 |
| --- | --- | --- |
| 교수 학술활동 수집 | GitHub Actions (기존) + 실패 이슈(1-1) | 매월 2일 03:00 KST |
| 입학처 변경 감지 | GitHub Actions (신규 1-2) | 주 1회 |
| 학기 갱신·입학 캘린더 리마인더 | GitHub Actions (신규 1-3) | 연 5회 이슈 |
| 학기 데이터 갱신 (체커·마일리지·교재) | 로컬 오케스트레이터 (신규 2-1) — 쿠키는 사람 | 학기 1회, 리마인더로 트리거 |

## 5. 리스크와 열어 둔 결정

| 리스크 / 결정 | 대응 |
| --- | --- |
| 원본 마크업 변경으로 파서 실패 (전 크롤러가 실측 기반 정규식) | 1-1 실패 가시화로 조기 감지. 파서 수정은 수동 — 실측 주석이 있는 해당 모듈만 고친다 |
| Public repo에 Supabase service-role 키 Secrets 유지 여부 | 기존 워크플로 머리말대로 사람 판단 사항으로 유지. 대안: 크롤 전용 최소 권한 키 발급 검토 |
| 입학처 페이지 구조 변경·차단 | 감지 워커는 실패해도 사이트에 무영향(알림 전용). 실패 자체도 이슈로 보고 |
| 마일리지 `--base` 누락 시 과거 이력 소실 | 오케스트레이터가 `--base`·`--verify-against`를 강제 인자로 고정 |
| 스냅샷 브랜치 비대화 (입학처 감지) | 정규화된 텍스트만 저장(수 KB), 연 1회 스쿼시 |
| 이관된 크롤러 저장소의 공개/비공개 | 학교 내부 API 를 다루므로 **비공개 권장**. 원본(halfjinhyeon)이 이미 공개인 점은 참고 사항일 뿐 근거는 아님. 비공개 시 Actions 에서 쓰려면 체크아웃 토큰이 필요해짐(당장은 로컬 실행이라 무관) |

## 6. 자동화하지 않는 것

- **구 게시판 재크롤** — 도메인 컷오버 후 게시판 정본은 우리 Supabase+CMS입니다.
  `tools/crawl-boards.mjs`는 이전 완료된 아카이브 도구로 은퇴 상태를 유지합니다.
- **연구실 홈페이지 정기 재크롤** — `tools/labs/README.md`가 경고하듯 PDF·사용자 제공
  8건은 재크롤로 복원되지 않고, 구형 사이트 함정(HTTP 전용·자체서명 인증서·EUC-KR·JS
  렌더링) 탓에 무인 크롤 신뢰도가 낮습니다. AI 연구요약 문안은 CMS에서 관리 중이므로
  필요할 때 수동 갱신합니다. (선택 아이디어: `labs-directory.json` 외부 링크 생존
  확인만 월 1회 자동화 — 죽은 링크 이슈 보고. 저부하·무검수 가능이라 Phase 1에 편입 가능)
- **학교 SSO 자동 로그인** — 5절 리스크 판단 전까지 금지.

## 7. 구현 백로그

| # | 작업 | 단계 | 규모 | 비고 |
| --- | --- | --- | --- | --- |
| 0 | 크롤러 저장소 이관 (로컬 → `yonsei-mech` 조직) | 2-0 | S | **사람이 푸시** — 체크리스트 2-0 준수. 이후 이 저장소의 경로·링크 참조 갱신은 코드 작업 |
| 1 | 교수 수집기 실패 임계 exit 1 + 실패 이슈 스텝 | 1-1 | S | 기존 워크플로 수정 |
| 2 | 입학처 스냅샷·diff 스크립트 + 주 1회 워크플로 | 1-2 | M | 본문 정규화가 핵심 |
| 3 | 정기 리마인더 워크플로 (체크리스트 이슈 5종) | 1-3 | S | cron + 이슈 템플릿 |
| 4 | `tools/update-semester.mjs` 오케스트레이터 | 2-1 | L | 기존 스크립트 조립 + 게이트 연결 |
| 5 | 교재 파이프라인 분리 옵션 | 2-2 | S | 4에 포함 가능 |
| 6 | (선택) 연구실 링크 생존 체크 워커 | 6절 | S | 이슈 보고 전용 |
| 7 | (보류) 예약 반자동 실행 검토 | 3 | — | 5절 결정 후 |

권장 착수 순서는 0 → 1 → 3 → 2 → 4입니다. 0은 사람의 푸시 한 번(+참조 갱신)이고,
1·3은 반나절 규모로 즉시 효과가 있습니다. 2는 2027학년도 입학 캘린더 갱신 전
(2027년 봄)까지만 준비되면 됩니다. 4는 0이 끝나야 크롤러를 저장소 기준으로 부를 수
있으므로 그 뒤에 착수하되, 다음 학기 갱신(2026-21 겨울, 12월경)을 첫 실전으로 삼아
그전에 완성하는 것을 목표로 합니다.
