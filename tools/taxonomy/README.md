# 연구·교육 6분야 분류 체계 (2026-08 개편)

학부 교수 회의에서 확정된 공식 분류다. **명칭·구성을 임의로 바꾸지 않는다.**

| # | 한국어 | English | 키 |
|---|--------|---------|-----|
| 01 | 역학 · 소재 | Mechanics & Materials | `mechanicsMaterials` |
| 02 | 에너지 · 열유체 | Energy / Thermal-Fluid Systems | `energyThermofluid` |
| 03 | 로보틱스 · 제어 | Robotics & Intelligent Control | `roboticsControl` |
| 04 | 설계 · 제조 | Design & Smart Manufacturing | `designManufacturing` |
| 05 | 마이크로 · 나노 | Micro / Nano Systems | `microNano` |
| 06 | 바이오 · 포토닉스 | Bio & Photonics | `bioPhotonics` |

## 구 체계에서 무엇이 바뀌었나

4개는 사실상 개명이고, 둘이 진짜 변경이다.

- `computation`(계산·해석) **해체** — 교수 의견: "계산해석은 기존 분류 체계와 어울리지
  않는다. 이론·실험·계측·제작·평가는 분야가 아니라 방법론이다."
- `bioNano`(바이오·나노) → `microNano` + `bioPhotonics` **분할**

## 연구실 배정은 추정하지 않는다

연구실 33개의 분야 배정(`LAB_FIELD`)은 학부가 이메일 기준으로 직접 큐레이션한 목록을
그대로 옮긴 것이다(자동 분류의 오분류를 막으려고 사람이 정한 값). 교수가 분야를 옮기면
`field-map.mjs` 의 `LAB_FIELD` **한 곳만** 고치고 아래 절차를 다시 돌린다.

과목 207개는 자료에 배정이 없어 과목명 기준으로 판정했다(`COURSE_FIELD`). 구 4개 분야
소속 과목은 `FIELD_RENAME` 으로 자동 이관되고, 해체·분할 대상 67과목만 개별로 적혀 있다.

## 바꾸는 절차

```bash
# ① 레포 파일 (빌드 시점 폴백 스냅샷)
node tools/taxonomy/migrate-fields.mjs            # 드라이런
node tools/taxonomy/migrate-fields.mjs --apply

# ② 프로덕션 DB (Phase 3 이후 콘텐츠 원본 — 이걸 해야 사이트가 바뀐다)
node tools/taxonomy/migrate-fields-db.mjs         # 드라이런
node tools/taxonomy/migrate-fields-db.mjs --apply
```

둘 다 **멱등**이라 여러 번 돌려도 안전하다. DB 쪽은 레포 내용을 밀어넣지 않고 DB 에
들어 있는 내용에 같은 변환만 적용한다 — CMS 편집분(연구실 사진·인턴 모집 여부·히어로
슬라이드 사진)을 덮어쓰지 않기 위해서다.

### ⚠️ DB 를 고쳐도 화면은 바로 안 바뀐다

이 스크립트들은 Postgres 에 직접 쓰기 때문에 CMS 저장 경로(`/api/admin/content`)와 달리
`revalidateTag('content')` 를 부르지 않는다. 그래서 반영까지 두 겹의 캐시를 기다려야 한다:

- `fetchAllContentFiles`(content-runtime.ts) — 전량 조회 `unstable_cache`, TTL **1시간**
- 각 페이지의 ISR — `export const revalidate = 300`, **5분**

실제로 겪은 모습: 교과목 페이지만 구 데이터로 남아 탭 수가 `역학·소재 27 · 나머지 0` 으로
보였다(구 키라 새 탭에 하나도 안 걸린다). 다른 페이지는 멀쩡해서 데이터가 안 들어간 줄
알기 쉬운데, **ISR 창이 아직 안 끝났을 뿐**이었다. 5분 뒤 저절로 맞았다.

바로 반영이 필요하면 CMS 에서 아무 콘텐츠나 한 번 저장하면 된다(그 경로가 태그를 턴다).
확인은 DB·레포가 아니라 **화면의 탭 수**로 한다:

```bash
curl -s https://<도메인>/ko/graduate/courses | grep -o '역학 · 소재</span><span[^>]*>[0-9]*'
```

## 코드 쪽 단일 출처

- `src/lib/research-fields.ts` — 타입 + 표시 순서. **클라이언트 컴포넌트가 값으로
  import 하므로** `src/lib/faculty.ts`(node:fs 사용, 서버 전용)에 두면 번들이 깨진다.
- `messages/{ko,en}.json` 의 `research.fieldFilter` — 화면 라벨.
- `src/lib/admin/resources.ts` 의 `FIELD_OPTIONS` — CMS 선택지.
- `src/components/admin/InlineFields.tsx` 의 `FIELD_BADGE` — 배지 색.
- `src/components/CurriculumFlow.tsx` 의 `LANES` — 체계도 레인 순서. 탭 순서(공식
  01→06)와 다르다: 그대로 쓰면 화살표의 레인 통과가 9회인데, 설계·제조와 로보틱스·제어를
  맞바꾸면 5회로 줄어든다(6! 전수 탐색 최소값).

## 히어로 사진

분야 구성이 바뀌면 새 분야가 임시로 물려받은 사진을 제 사진으로 갈아야 한다. 파일을 R2 에
올리고 `content/hero-slides.json` 의 URL 을 고친 뒤:

```bash
node tools/taxonomy/sync-hero-images.mjs           # 드라이런
node tools/taxonomy/sync-hero-images.mjs --apply   # DB 의 image·imageMobile 만 갱신
```

분야 키·순서·라벨은 건드리지 않는다. CMS 히어로 편집기로 올려도 결과는 같다.

마이크로·나노(2026-08 신설)는 구 계산·해석 슬라이드 사진이 코드 에디터 스톡컷이라 쓸 수
없어, 학부가 이미 쓰던 현미경 원본(6720×4480)에서 대물렌즈부를 크롭해 만들었다 —
`public/img/hero{,-mobile}/마이크로나노.jpg`. 학부 자체 촬영본이 생기면 CMS 에서 교체할 것.
