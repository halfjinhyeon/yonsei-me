/**
 * 연구·교육 6분야 분류 체계 — 타입과 표시 순서.
 *
 * ⚠️ 이 파일은 클라이언트 컴포넌트도 **값으로** import 한다(분야 탭 순서). 그래서
 * `@/lib/faculty` 가 아니라 여기에 둔다 — faculty.ts 는 node:fs 를 쓰는 서버 전용
 * 모듈이라, 거기서 상수를 가져오면 webpack 이 클라이언트 번들에 fs 를 끌어와 터진다.
 *
 * 6분야는 학부 교수 회의에서 확정된 공식 분류다. 명칭·구성을 임의로 바꾸지 않는다.
 * 구 체계(바이오·나노 / 계산·해석 …)에서의 이관 매핑은 tools/taxonomy/field-map.mjs.
 */

/** 6개 연구 분야 taxonomy 키 (분야 필터 공통 타입) */
export type ResearchField =
  | 'mechanicsMaterials'
  | 'energyThermofluid'
  | 'roboticsControl'
  | 'designManufacturing'
  | 'microNano'
  | 'bioPhotonics';

/** 분야 탭·레인의 표시 순서(01→06) — 목록·카탈로그·체계도가 공유하는 단일 출처.
 *  화면 라벨은 messages/*.json 의 research.fieldFilter 에서 온다. */
export const RESEARCH_FIELDS: ResearchField[] = [
  'mechanicsMaterials',
  'energyThermofluid',
  'roboticsControl',
  'designManufacturing',
  'microNano',
  'bioPhotonics',
];
