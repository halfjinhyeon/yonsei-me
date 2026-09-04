# 마일리지 전략 플래너 — 데이터 파이프라인

수강신청 마일리지 컷을 예측하는 데이터가 어디서 와서 어디로 가는지, 그리고 **새 학기에
무엇을 어떤 순서로 돌려야 하는지**를 적어 둔 문서입니다. 예측 모델 자체의 설계는
`src/lib/mileage/predict.ts`·`distribute.ts`·`allocate.ts` 의 주석에 있습니다.

## 파이프라인

```
연세대 수강편람 내부 API (underwood1.yonsei.ac.kr)
   │  크롤러: https://github.com/yonsei-mech/yosnei-mileage-crawler  (로컬: Desktop\크롤링)
   │    node src/index.js courses <년> <학기코드>   → courses.json       (개설 분반 카탈로그)
   │    npm run mileage                            → mileage_data.json  (분반별 과거 마일리지 이력)
   ▼
tools/mileage/build-db.mjs
   │    크롤 JSON → SQLite. 기존 DB(--base)의 사라진 분반 이력을 이월 병합.
   ▼
tools/mileage/data/mileage-history.db(.gz)      ← 저장소에는 .gz 만 추적(약 14MB · 2015-2~ 전 학기)
   │
   ├── tools/mileage/backtest.mjs        모델·데이터 변경의 정확도 측정(채택 판정용)
   │
   ▼
tools/mileage/precompute.mjs  --target <년>-<학기코드>
   │    계층적 경험 베이즈로 컷 분포(μ·σ)를 적합해 압축 번들로 출력
   ▼
public/data/mileage-<년>-<학기>.json          본 번들 (약 480KB, 초기 로딩)
public/data/mileage-<년>-<학기>-detail.json   상세 번들 (약 950KB, 지연 로딩)
   │
   ▼
src/lib/mileage/bundle.ts  (MILEAGE_TERM 이 URL·표기의 유일한 출처)
   ▼
src/components/MileagePlanner.tsx   ← 학부 › 마일리지 전략 탭
```

학기 코드는 수강편람 체계를 그대로 씁니다: **10=1학기 · 20=2학기 · 11=여름계절 · 21=겨울계절**.

## 크롤러

- 저장소: <https://github.com/yonsei-mech/yosnei-mileage-crawler> (로컬 작업 사본 `Desktop\크롤링`)
- 의존성 0. Node 18+ 내장 `fetch` 만 씁니다.
- 실행 전 저장소 루트에 `.env` 를 만들고 로그인 세션 쿠키를 넣습니다:

  ```env
  YONSEI_COOKIE=JSESSIONID=...
  ```

  브라우저로 수강편람에 로그인 → `F12` → Network → 아무 `.do` 요청 → 요청 헤더의 `Cookie`
  전체를 복사합니다.

> [!CAUTION]
> **`.env` 와 쿠키 값은 절대 커밋하지 마십시오.** 본인 계정의 로그인 세션이 그대로 노출되며,
> 학사 시스템 계정이 걸린 문제입니다. 이 저장소에도, 크롤러 저장소에도 넣지 않습니다.
> 쿠키는 몇 시간이면 만료되므로 크롤을 재개할 때마다 새로 복사해야 합니다.

## 새 학기 갱신 체크리스트

예시는 **2027-1학기**(`--target 2027-10`)입니다.

1. **카탈로그 수집** — 크롤러에서

   ```bash
   node src/index.js courses 2027 10      # → courses.json
   ```

2. **이력 수집** — 같은 곳에서

   ```bash
   npm run mileage                        # → mileage_data.json
   ```

   과목 3천여 개 × 개설 학기마다 2회 요청이라 수 시간 걸립니다. 10건마다 저장하고
   `Ctrl+C` 로 끊어도 이어서 진행합니다(처음부터 다시 받으려면 `--reset`).
   끝나면 `error` 필드를 가진 레코드가 0인지 확인하십시오 — 쿠키 만료로 뭉텅이 실패가
   나는 일이 흔합니다.

3. **DB 빌드 (반드시 `--base` 로 병합)**

   ```bash
   node tools/mileage/build-db.mjs \
     --courses "C:/Users/aquae/Desktop/크롤링/courses.json" \
     --mileage "C:/Users/aquae/Desktop/크롤링/mileage_data.json" \
     --base tools/mileage/data/mileage-history.db.gz \
     --verify-against tools/mileage/data/mileage-history.db.gz
   ```

   - `--base` 를 빼면 **이번에 개설하지 않는 과목의 과거 이력이 통째로 사라집니다.**
     크롤은 "이번 학기 개설 분반"만 대상이라, 폐강·미개설 분반의 이력은 예전 DB 에만 남아
     있습니다. 그 관측들은 과목·학과 계층 통계의 표본이므로 반드시 이월합니다.
     같은 학기 그룹이 양쪽에 있으면 **신규 크롤이 정본**입니다.
   - `--verify-against` 는 두 DB 에 함께 있는 (과목·분반·학년도·학기) 그룹을 전량 대조해
     필드 매핑이 어긋나지 않았는지 봅니다. 값 불일치는 0이어야 합니다.
   - 출력: `tools/mileage/data/mileage-history.db` + `.db.gz`. **커밋 대상은 `.gz` 뿐**입니다
     (`data/.gitignore` 가 `*.db` 를 막습니다). 다음 실행 때 자동 해제됩니다.

4. **백테스트로 신·구 비교** — 데이터가 늘었으니 예측이 나빠지지 않았는지 재 봅니다.

   ```bash
   node --experimental-strip-types tools/mileage/backtest.mjs <이전.db.gz> 2026-20
   node --experimental-strip-types tools/mileage/backtest.mjs 2026-20   # 새 기본 DB
   ```

   목표 학기는 **정답이 이미 있는 직전 학기**를 씁니다(새 학기는 아직 결과가 없습니다).
   평가 대상 분반 수가 달라지므로, 판단은 `DUMP=<경로>` 로 두 실행의 분반별 결과를 떨궈
   **공통 분반만** 비교해야 공정합니다.

   > 이 프로젝트의 원칙: **측정하지 않은 개선은 주장하지 않습니다.** 그럴듯한 변경이
   > 실제로는 아무 효과가 없었던 사례가 여러 번 있었습니다(`predict.ts` 주석의 표 참고).

5. **번들 생성**

   ```bash
   node tools/mileage/precompute.mjs --target 2027-10
   # → public/data/mileage-2027-10.json (+ -detail.json)
   ```

6. **프런트 학기 상수 변경** — `src/lib/mileage/bundle.ts` 의 `MILEAGE_TERM` 을
   `{ year: '2027', semester: '10' }` 으로. 번들 URL과 화면 표기가 여기서 파생됩니다.

7. **교수 보강표·오버라이드 재검토**
   - `tools/mileage/professor-history.csv` — 크롤 원본에는 **현재 학기 교수만** 있습니다.
     교수가 분반을 서로 맞바꾸는 과목(공학수학이 대표적)은 이 표가 있어야 이력을 분반이
     아니라 교수 기준으로 재배치할 수 있습니다. 새 학기 라인업을 확인해 채웁니다.
     형식: `year,semester,code,division,professor`
   - `precompute.mjs` 의 `RECENCY_ALIAS` — 특정 학기 라인업에만 유효한 수동 보정입니다.
     라인업이 또 바뀌었으면 **삭제**해야 합니다.

8. **검증** — `npm run typecheck` 통과 확인 후, 로컬에서 학부 › 마일리지 전략 탭을 열어
   검색·담기·상세·시간표가 새 학기 과목으로 나오는지 봅니다.

9. **커밋 대상**

   ```
   tools/mileage/data/mileage-history.db.gz
   public/data/mileage-<년>-<학기>.json
   public/data/mileage-<년>-<학기>-detail.json
   src/lib/mileage/bundle.ts
   tools/mileage/professor-history.csv        (보강했다면)
   ```

   지난 학기 번들은 아무도 읽지 않으므로 지워도 됩니다. 저장소에 다른 세션의 WIP 이
   상시 섞여 있으니 **파일을 하나씩 명시해서 스테이징**하십시오(`git add -A` 금지).

## 함정 모음

- **학기 목록 API(`findMlgSyySmtDivCdList`)는 최근 6개 학기만 돌려주는 롤링 창입니다.**
  하지만 학기 코드를 직접 지정해 요약·원장 API 를 부르면 그 이전도 나옵니다(제도 시작
  2015-2 까지 실측). 2026-08 에 크롤러 저장소의 `src/backfill.mjs` 로 2015-2~2023-1 전
  학기를 소급 수집해 DB 에 병합했습니다(+71만 행 · 백테스트 Hit±3 64.6→65.0% 확인 후 채택).
  매 학기 일반 크롤은 최근 6학기만 받아도 됩니다 — 옛 학기는 `--base` 이월이 지킵니다.
- **크롤은 "이번 학기 개설 분반"만 조회하므로, 분반 개편으로 사라진 번호의 과거 이력은
  영영 수집되지 않습니다.** 실례: 유체역학(MEU2640)이 3분반→2분반으로 줄면서 03분반(김원정,
  24-2·25-2)의 이력이 DB에 없었고, 교수 기준 재배치가 빈손이 됐습니다(2026-08 보수, 21개
  그룹·원장 791행). 새 학기 갱신 후 `professor-history.csv` 의 각 (과목·분반·학기)가
  `mileage_summary` 에 실제로 있는지 대조하고, 빠진 그룹은 마일리지 API 를 그 분반으로
  직접 호출해 채우십시오(분반 번호만 바꾸면 과거 학기도 조회됩니다).
- **컷은 `remark='*'` 를 뺀 합격자의 최저 배점입니다.** 우선·예외 배정(별표) 8천여 건을
  포함하면 컷이 최대 32점까지 왜곡되고 외부 기록과도 어긋납니다. `mileage_summary.min_mileage`
  도 컷이 아닙니다(미달 학기에는 전체 최저값이라 실제 컷과 다릅니다).
- **컷은 청중 그룹별로 따로 잡습니다.** 전공자석과 비전공자석은 따로 배정되므로 "합격자
  전체의 최저"는 어느 쪽의 컷도 아닙니다. 근거는 `precompute.mjs` ① 절 주석.
- **분반 번호는 2자리 문자열이 정본**입니다(`'1'` 이 아니라 `'01'`). 크롤 원본과 보강표가
  섞여 들어오므로 어디서든 `padStart(2,'0')` 을 거칩니다.
- **서버는 조회 결과를 200건에서 잘라냅니다.** 크롤러가 학과별 200건 초과 시 학년(1~6)으로
  분할 재조회해 우회합니다 — 이 로직을 건드리면 조용히 과목이 누락됩니다.
- **백업본을 섞지 마십시오.** 크롤 폴더에는 `mileage_data_1.json` 처럼 이전 세대 결과가
  남아 있을 수 있습니다. 정본은 `mileage_data.json` 하나입니다.
- **이수구분(`classification`)·개설학과(`dept`)는 크롤 시점의 조회 맥락에 흔들립니다.**
  같은 교양 과목이 어느 학과 커리큘럼으로 조회됐는지에 따라 `학필`/`선교`/`계기`/`대교` 등으로
  달리 옵니다(실측: 3,133개 겹침 분반 중 757건이 크롤 간 상이). 전공 과목은 안정적입니다.
- **기존 DB(2026-07-24 빌드)의 `mileage_bids.rank` 는 원본 `mlgRank` 보다 1 큽니다.**
  소실된 옛 변환기의 off-by-one 입니다. 읽는 코드가 없어 무해하며, 지금 빌드는 원본 값을
  싣습니다. 그래서 `rank` 로 두 DB 를 조인하면 안 되고, 행 순서로 맞춰야 합니다
  (`build-db.mjs --verify-against` 가 그렇게 합니다).
- **`.db` 는 커밋하지 않습니다**(20MB+). `.gz` 만 추적하고 실행 시 자동 해제합니다.
- 대학 코드(`colleges.code`, 예 `s1104`)는 크롤 레코드에 없어 개설학과 표기
  ("공과대학 기계공학전공")의 대학명을 기존 표와 맞춰 되찾습니다. 그래서 **처음부터 새로
  만들 때도 `--base` 를 주는 편이 좋습니다**(대학 코드 표가 base 에만 있습니다).
