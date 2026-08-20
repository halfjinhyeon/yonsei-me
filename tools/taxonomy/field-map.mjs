/**
 * 연구·교육 6분야 분류 체계 — 구 체계 → 신 체계 이관 매핑 (단일 출처)
 *
 * 신 체계는 학부 교수 회의에서 확정된 공식 분류다(2026-08 사장님 전달). 명칭은
 * 한 글자도 바꾸지 않는다 — messages/ko.json 의 학부 소개 본문에 이미 같은 이름이
 * 인용돼 있고, 첨부 자료(yonsei-me-homepage.html · meta.json 의 research_areas)와
 * 글자 단위로 일치해야 한다.
 *
 * 구 체계와의 차이
 *   ① 4개는 사실상 개명 — 역학·재료→역학·소재, 열·유체→에너지·열유체,
 *      동역학·제어→로보틱스·제어, 생산·설계→설계·제조
 *   ② `computation`(계산·해석)은 **해체**된다. 교수 의견: "계산해석은 기존 분류
 *      체계와 어울리지 않는다 — 이론·실험·계측·제작·평가는 분야가 아니라 방법론이다."
 *   ③ `bioNano`(바이오·나노)는 `microNano` + `bioPhotonics` 둘로 **분할**된다.
 *
 * 연구실(교수) 배정은 추정하지 않는다. 첨부 자료의 `ME.AREAS` 큐레이션(이메일 기준,
 * "자동분류 오분류 방지"라고 명시)을 그대로 옮겼다. 교수 이동은 LAB_FIELD 한 곳만 고친다.
 *
 * 과목 배정은 자료에 없어 과목명 기준으로 새로 판정했다(COURSE_FIELD). 구 4개 분야
 * 소속 과목은 FIELD_RENAME 으로 자동 이관되고, 해체·분할 대상 67과목만 여기 적는다.
 */

/** 신 체계 6키 — 표시 순서(01→06)가 곧 배열 순서다. 공식 명칭·영문 표기 그대로. */
export const FIELDS = [
  { key: 'mechanicsMaterials', ko: '역학 · 소재', en: 'Mechanics & Materials' },
  { key: 'energyThermofluid', ko: '에너지 · 열유체', en: 'Energy / Thermal-Fluid Systems' },
  { key: 'roboticsControl', ko: '로보틱스 · 제어', en: 'Robotics & Intelligent Control' },
  { key: 'designManufacturing', ko: '설계 · 제조', en: 'Design & Smart Manufacturing' },
  { key: 'microNano', ko: '마이크로 · 나노', en: 'Micro / Nano Systems' },
  { key: 'bioPhotonics', ko: '바이오 · 포토닉스', en: 'Bio & Photonics' },
];

/** 구 키 → 신 키. computation·bioNano 는 1:1 대응이 없어 여기 없다(개별 판정). */
export const FIELD_RENAME = {
  mechanicsMaterials: 'mechanicsMaterials',
  thermoFluid: 'energyThermofluid',
  dynamicsControl: 'roboticsControl',
  manufacturingDesign: 'designManufacturing',
};

/** 연구실 33개 — 교수명 → 신 키. 첨부 자료의 이메일 큐레이션을 이름으로 옮긴 것. */
export const LAB_FIELD = {
  // 역학 · 소재
  강건욱: 'mechanicsMaterials',
  김대은: 'mechanicsMaterials',
  민경민: 'mechanicsMaterials',
  이형석: 'mechanicsMaterials',
  장용훈: 'mechanicsMaterials',
  전흥재: 'mechanicsMaterials',
  // 에너지 · 열유체
  김우철: 'energyThermofluid',
  김원정: 'energyThermofluid',
  송순호: 'energyThermofluid',
  이남규: 'energyThermofluid',
  이준상: 'energyThermofluid',
  이창훈: 'energyThermofluid',
  홍종섭: 'energyThermofluid',
  // 로보틱스 · 제어
  박노철: 'roboticsControl',
  신동준: 'roboticsControl',
  양현석: 'roboticsControl',
  최종은: 'roboticsControl',
  // 설계 · 제조
  강신일: 'designManufacturing',
  김석: 'designManufacturing',
  민병권: 'designManufacturing',
  유정훈: 'designManufacturing',
  윤준영: 'designManufacturing',
  이종수: 'designManufacturing',
  // 마이크로 · 나노
  김경식: 'microNano',
  김용준: 'microNano',
  김종백: 'microNano',
  김해진: 'microNano',
  전성찬: 'microNano',
  // 바이오 · 포토닉스
  김영주: 'bioPhotonics',
  류원형: 'bioPhotonics',
  정효일: 'bioPhotonics',
  주철민: 'bioPhotonics',
  현재상: 'bioPhotonics',
};

/**
 * 해체·분할 대상 과목의 개별 배정 (학정번호 → 신 키, null 이면 기초·공통).
 * 구 `computation` 20 + `bioNano` 38 (대학원) · `computation` 3 + `bioNano` 6 (학부).
 */
export const COURSE_FIELD = {
  // ── 구 computation(계산·해석) 해체 — 대학원 ──
  MEU5019: 'designManufacturing', // 위상최적설계이론
  MEU5028: 'mechanicsMaterials', // 재료의 원자모사 방법론
  MEU5041: 'mechanicsMaterials', // 역학및전자기학응용해석
  MEU5045: 'roboticsControl', // 매개변수추정
  MEU5100: 'energyThermofluid', // 전산유체특론
  MEU5241: 'designManufacturing', // 응용수치해석
  MEU5370: 'mechanicsMaterials', // 유한요소법
  MEU6011: 'designManufacturing', // 컴퓨터해석기구학특론
  MEU6041: 'designManufacturing', // 최적설계공학
  MEU6071: 'designManufacturing', // 소프트컴퓨팅응용시스템설계
  MEU6111: 'designManufacturing', // 구조최적설계
  MEU6180: 'designManufacturing', // 신뢰성공학
  MEU6260: 'energyThermofluid', // 전산유체역학
  MEU6350: 'designManufacturing', // 전기부품신뢰성설계
  MEU6360: 'designManufacturing', // 설계최적화특론
  MEU6420: 'energyThermofluid', // 전산난류특론
  MEU7009: 'designManufacturing', // 위상최적설계이론
  MEU7013: 'energyThermofluid', // 응용전산유체역학
  MEU7018: 'microNano', // 전산 나노 과학
  MEU7270: 'mechanicsMaterials', // 근사해법

  // ── 구 bioNano(바이오·나노) 분할 — 대학원 ──
  MEU5004: 'microNano', // 나노기전소자
  MEU5007: 'microNano', // 고급나노생산송정
  MEU5012: 'bioPhotonics', // 생체공학용재료 특론
  MEU5013: 'microNano', // 나노소자의 기본원리
  MEU5014: 'bioPhotonics', // 바이오전산유체역학
  MEU5015: 'bioPhotonics', // 의생물학용 마이크로시스템의 설계 및 제조
  MEU5016: 'microNano', // 나노전자기학개론
  MEU5017: 'microNano', // 반도체소자이론
  MEU5021: 'bioPhotonics', // 바이오메디칼 광학 이미징
  MEU5022: 'bioPhotonics', // 기계공학에서의 광학기술 응용
  MEU5023: 'bioPhotonics', // 생체 시스템의 기계적 거동
  MEU5025: 'bioPhotonics', // 생체물리학
  MEU5032: 'bioPhotonics', // 마이크로 바이오 메카트로닉스
  MEU5035: 'microNano', // 나노테크날러지
  MEU5044: 'microNano', // 첨단 나노제작 기술
  MEU5060: 'bioPhotonics', // 나노광자공학특론
  MEU5090: 'microNano', // 나노과학개론
  MEU5110: 'bioPhotonics', // 바이오산업창업과경영
  MEU5450: 'microNano', // 마이크로시스템 설계
  MEU5480: 'bioPhotonics', // 생체분석시스템
  MEU6001: 'microNano', // 전자기학개론
  MEU6002: 'bioPhotonics', // 세포역학
  MEU6004: 'microNano', // 박막플라즈마공정
  MEU6006: 'bioPhotonics', // 마이크로옵틱스설계제조
  MEU6070: 'bioPhotonics', // 포토닉스
  MEU6080: 'microNano', // 마이크로시스템역학
  MEU6090: 'bioPhotonics', // 세포칩 특론
  MEU6170: 'bioPhotonics', // 첨단레이져광공학
  MEU6411: 'bioPhotonics', // 마이크로광부품제조특론
  MEU6440: 'microNano', // 플라즈마공학
  MEU6600: 'microNano', // MEMS특론
  MEU6620: 'bioPhotonics', // 바이오엔지니어링특론
  MEU6630: 'microNano', // 나노트라이볼로지
  MEU6640: 'bioPhotonics', // 바이오엔지니어링특론II
  MEU7008: 'microNano', // 양자론과 양자역학개론
  MEU7014: 'bioPhotonics', // 메디칼디바이스 설계 및 개발
  MEU7015: 'bioPhotonics', // 분자및세포역학
  MEU7160: 'bioPhotonics', // 광공학특론

  // ── 학부 ──
  // 공학정보처리는 2학년 '대교'다 — 같은 종별의 공학수학·물리·화학처럼 기초·공통으로 옮긴다.
  ENG1108: null,
  MEU3003: 'designManufacturing', // 공학수치해석
  MEU3801: 'designManufacturing', // 컴퓨터해석기반설계
  MEU3004: 'bioPhotonics', // 바이오의료기계
  MEU3010: 'microNano', // 마이크로기계시스템
  MEU3015: 'microNano', // 전자기학및응용
  MEU3700: 'bioPhotonics', // 생체역학
  MEU3710: 'microNano', // 나노기계공학
  MEU3012: 'bioPhotonics', // 광공학
};
