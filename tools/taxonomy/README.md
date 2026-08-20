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

## 코드 쪽 단일 출처

- `src/lib/research-fields.ts` — 타입 + 표시 순서. **클라이언트 컴포넌트가 값으로
  import 하므로** `src/lib/faculty.ts`(node:fs 사용, 서버 전용)에 두면 번들이 깨진다.
- `messages/{ko,en}.json` 의 `research.fieldFilter` — 화면 라벨.
- `src/lib/admin/resources.ts` 의 `FIELD_OPTIONS` — CMS 선택지.
- `src/components/admin/InlineFields.tsx` 의 `FIELD_BADGE` — 배지 색.
- `src/components/CurriculumFlow.tsx` 의 `LANES` — 체계도 레인 순서. 탭 순서(공식
  01→06)와 다르다: 그대로 쓰면 화살표의 레인 통과가 9회인데, 설계·제조와 로보틱스·제어를
  맞바꾸면 5회로 줄어든다(6! 전수 탐색 최소값).

## 남은 일

- **히어로 사진**: 구 계산·해석 슬라이드 사진을 마이크로·나노가 임시로 물려받았다.
  분야에 맞는 사진으로 CMS 에서 교체할 것.
