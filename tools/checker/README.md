# tools/checker — 졸업요건 체커 과목 카탈로그 파이프라인

체커 매칭(`src/lib/checker-match.ts`)은 **100% 과목명 문자열 기반**이라, 카탈로그가 한 학기
스냅샷이면 개명·폐강 과목의 수강분을 놓치거나 학점을 오배분한다. 그래서 카탈로그는
**2022-1 ~ 현재의 전 학기 수강편람 크롤을 학정번호(code) 키로 통합**해 만든다 — 개명은
별칭(aliases)으로, 폐강은 이력으로 흡수된다.

```
크롤러 repo (Desktop\크롤링, YONSEI_COOKIE 필요)
  └─ crawl-terms.mjs ──→ data/raw/courses-<yyyy>-<smt>.json   (학기별, git 미추적)
       └─ build-catalog.mjs ──→ data/catalog-history.json      (통합 이력 정본, 추적)
                            ──→ public/data/course-catalog.json (프런트 카탈로그, 추적)
                            ──→ reports/rename-report.json      (대조 리포트, 추적)
            └─ verify-matching.mjs                              (매칭 회귀 하네스)
```

## 새 학기 갱신 절차 (학기마다 한 번)

1. 브라우저에서 수강편람(underwood1.yonsei.ac.kr) 로그인 → Network 탭 `.do` 요청의
   Cookie 전체 값을 `크롤링\.env`의 `YONSEI_COOKIE=`에 갱신 (수 시간 만료)
2. `crawl-terms.mjs`의 `TERMS` 생성부에 새 학기가 포함되는지 확인(연도 범위 확장),
   `build-catalog.mjs`의 `EXPECTED_TERMS`에도 같은 학기를 추가
3. `node tools/checker/crawl-terms.mjs --list` 로 계획 확인 → `--only <새학기>` 로 크롤
4. `node tools/checker/build-catalog.mjs` — **게이트가 exit 1이면** 리포트의
   `curatedRenameRequired`를 보고 `content/checker-requirements.json`(전공) 또는
   `content/liberal-arts.json`(교양)의 name/aliases를 갱신한 뒤 재실행
5. 리포트의 `codeChangeCandidates`(개번 후보 — `curatedCodeOffered:true`는 동명이과 잡음),
   `churn`, `liberalCreditsDiff`(교양 학점 실측 불일치 → liberal-arts.json `credits` 반영) 검토
6. `node tools/checker/verify-matching.mjs` 6/6 PASS 확인
7. `npm run typecheck` + 체커 화면에서 STEP 03 검색 확인
8. 파일 **하나씩 명시 스테이징** (`git add -A` 금지): course-catalog.json,
   catalog-history.json, rename-report.json + 고쳤다면 content/*.json

## 설계 불변식 — needle 전역 유일성

`exactMatch`는 "더 긴 매치에 **엄격히** 포함된 짧은 매치"만 지운다. 즉 같은 정규화
문자열(needle)이 두 항목에 있으면 같은 자리에서 둘 다 살아남아 **학점이 이중 집계**된다.
클라이언트 병합은 id(정규화 name)만 dedup하므로 별칭↔이름 충돌은 못 잡는다. 따라서
`build-catalog.mjs`가 curated(요건·교양) needle과 겹치는 크롤 항목·별칭을 전부 걷어내고,
`verify-matching.mjs` 픽스처 ③이 이 불변식을 상시 감시한다. **별칭을 손으로 추가할 때는
반드시 하네스를 돌려라.**

## 함정 모음

- **크롤러의 `courses.json`은 마일리지 파이프라인 정본 입력**이다. `crawl-terms.mjs`가
  실행 전 `courses.json.mileage-bak`으로 백업하고 종료 시(실패 포함) 복원한다. 크롤러
  repo를 직접 돌렸다면 복원을 잊지 말 것.
- **쿠키 만료가 상수다.** 학기별 파일 단위로 재개되므로(`--list`로 진행 확인) .env 갱신
  후 같은 명령을 다시 돌리면 이어서 진행된다.
- **서버가 엉뚱한 학기를 돌려줄 수 있다** (세션 만료 시 기본 학기 응답). 래퍼가 레코드의
  syy/smtDivCd를 요청 학기와 대조해 불일치면 저장하지 않고 중단한다.
- **부제(subjtSbtlNm) 처리**: `subjtNm`이 부제로 끝나면 잘라 base 이름을 만든다.
  `subjtNm2`는 206건 불일치로 신뢰 금지. 역대 이름이 4개 이상이면 부제 churn
  (UT세미나·명예특임교수강의시리즈류)으로 보고 별칭을 포기한다(리포트 `churn`).
- **예약 과목명**: 채플·RC자기주도활동은 접두사, `사회참여`는 완전일치로 카탈로그에서
  제외한다(채플 카운터·SE·RC 체크박스가 별도 처리). `사회참여적예술` 같은 정당한 과목을
  걸러내지 않기 위해 완전일치다. 규칙은 build-catalog.mjs와 verify-matching.mjs 양쪽에
  `isReservedName`으로 동기화.
- **정규화 함수 동기화**: `normalizeName`은 checker-match.ts 51-58행의 복제다(문자
  클래스에 NBSP·zero-width space 포함). 어긋나면 유일성 보증이 통째로 무너진다.
- **교양 개명은 liberal-arts.json에서** name을 새 이름으로 바꾸고 `aliases`에 옛 이름을
  남긴다. 학점 실측은 `credits` 필드(없으면 checker.ts 휴리스틱: 체육·RC 1, 나머지 3).
- 2022-1 이전 학기는 크롤 범위 밖 — 그 시기에만 쓰인 옛 이름은 curated aliases로 수동
  보강한다.

## 이력 (2026-08)

- 25-2 편람 PDF 기반 `tools/course-list.csv` + `scripts/parse-catalog.mjs` 경로를 이
  파이프라인으로 대체. 당시 발견·수정된 실버그: 창의제품설계(종합설계) 개명으로 전공필수
  누락, 주니어세미나 이중 집계, 채플(1)~(4) 이중 집계, MEU2104→2105·MEU2001→2900 개번,
  교양 4과목 개명, 교양 10과목 학점 실측 불일치.
