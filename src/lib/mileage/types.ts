/**
 * 마일리지 전략 플래너 — 데이터 계약(단일 출처).
 *
 * ⚠️ 이 계약은 참조 프로젝트(yonsei-timetable)의 산출물과 무관하다. 우리는 연세대 공개
 *    강의편람 API에서 우리가 직접 수집한 이력으로 우리 모델을 적합시킨다(tools/mileage 참고).
 *    참조 프로젝트의 학습된 모델 산출물(precomputed_curves.json)은 사용하지 않는다.
 */

/** 학기 구분 — 연세대 코드 체계(10=1학기, 11=여름, 20=2학기, 21=겨울) */
export type SemesterCode = '10' | '11' | '20' | '21';

/** 분반 식별자 — "같은 과목, 다른 교수"를 반드시 구분하기 위한 최소 키.
 *  과목코드만으로는 부족하다(사용자 지시 2). */
export interface SectionKey {
  /** 학정번호 (예: MEU3600) */
  code: string;
  /** 분반 (예: "01") */
  division: string;
}

/** 한 분반의 정적 메타데이터 — 학기마다 갱신 */
export interface SectionMeta extends SectionKey {
  /** 과목명 */
  name: string;
  /** 담당 교수명. 빈 문자열이면 미배정 */
  professor: string;
  credits: number;
  /** 개설 학과/전공 코드 (교양·타전공 포함 — 전 과목을 담는다, 사용자 지시 1) */
  deptCode: string;
  deptName: string;
  /** 이수구분 (전공필수/전공선택/교양 등 원문 표기) */
  classification: string;
  /** 대상 학년 원문("3", "전학년" 등). 없으면 빈 문자열 */
  grade: string;
  /** 강의 시간 원문 (시간표 충돌 판정에 사용) */
  timeText: string;
  /** 정원. 미상이면 null */
  capacity: number | null;
  /**
   * 이 분반에 걸 수 있는 **실제 만점**(mileage_summary.max_allowed).
   *
   * 전교 상한 36 이 아니라 과목마다 다르다 — 기계공학 전공과목 다수가 18 이다. 이 값을
   * 모르고 36 을 쓰면 σ 상한(만점/2.5)이 두 배로 헐거워져 확률 곡선이 평평해진다.
   * 미상이면 undefined → 36 으로 본다.
   */
  maxAllowed?: number;
  /**
   * 만점 동점 시의 대략적 승률(= 가장 최근 학기의 학년별 합격률 Σwon/Σapplied).
   *
   * 컷이 만점에 닿은 분반은 정규 CDF 로 설명할 수 없다 — 만점을 걸어도 동점자끼리
   * 총이수학점·졸업예정 등으로 갈린다. 그때의 승률을 데이터로 주입한다. 전처리(precompute·
   * backtest)에서 계산해 넣는다. 미상이면 null.
   */
  tieWin?: number | null;
}

/** 과거 한 학기의 수강신청 결과 관측치 — 모델 적합의 원재료 */
export interface HistoryPoint {
  year: string;
  semester: SemesterCode;
  /**
   * 그 학기의 실제 담당 교수. 분반-교수 교체가 잦은 과목(예: 공학수학)에서 이력을
   * 교수 기준으로 재배치하기 위해 쓴다. 자료가 없으면 undefined —
   * 이 경우 "분반 계보"(같은 분반 번호 = 같은 흐름)로 취급한다.
   */
  professor?: string;
  /**
   * **이 관측이 실제로 나온 분반.**
   *
   * 이력은 교수 기준으로 재배치되므로(`SectionHistory.division` = 지금 분반), 관측 하나하나가
   * 어느 분반의 것이었는지는 따로 들고 있어야 한다. 경쟁분반 보정이 "그 학기에 이 교수가
   * 어느 자리에 있었나"를 알아야 형제 분반을 골라낼 수 있다. 없으면 `SectionHistory.division`
   * 으로 본다(하위 호환).
   */
  division?: string;
  /**
   * 최신성 가중용 학기 서수 오버라이드. 라인업(형제 교수 구성)이 대상 학기와 같은 과거
   * 학기를 "최신 학기처럼" 취급할 때 쓴다 — 예: 응용고체역학(MEU3600)의 2026-2 라인업은
   * 2025-2가 아니라 2024-2와 같으므로(전흥재+장용훈), 2024-2 관측에 대상 학기 서수를 준다
   * (사용자 지시 + 형제분반 조사 보고서). 없으면 실제 학기 서수.
   */
  recencyOrd?: number;
  /**
   * 합격자 중 최저 배점(= 컷). 미달(전원 수용)이면 0.
   *
   * **청중 그룹 기준이다** — 학정번호가 MEU 면 전공자(major 'Y*') 합격자만, 그 밖이면
   * 비전공자 합격자만 본다(우리 사용자는 기계공학부 학생이라 교양·타과에서는 비전공자다).
   * 그 그룹에 합격자가 없으면 전체 합격자로 폴백한다. 근거는 precompute.mjs ① 절 주석.
   */
  cutoff: number;
  /** 정원. 미상이면 null */
  capacity: number | null;
  /** 신청자 수. 미상이면 null */
  applicants: number | null;
}

/** 한 분반의 전체 이력 */
export interface SectionHistory extends SectionKey {
  professor: string;
  points: HistoryPoint[];
}

/**
 * 과거 한 학기의 **분반 편성 관측** — 컷이 아니라 "그 학기에 누가 몇 자리를 열었나"이다.
 *
 * 왜 `SectionHistory` 로 부족한가: 이력은 교수 소유로 재배치되면서 **일부 관측이 탈락한다**
 * (그 교수가 올해 개설하지 않으면 그 분반의 기록은 어느 이력에도 실리지 않는다). 경쟁분반
 * 보정은 "그 학기 형제 분반 **전부**"를 알아야 하므로, 재배치를 거치지 않은 원본 편성표를
 * 따로 받는다. 컷이 없는 분반(신청자 0 등)도 정원을 차지했으므로 포함한다.
 */
export interface CourseObservation {
  code: string;
  division: string;
  year: string;
  semester: string;
  /** 그 학기의 담당 교수. 미상이면 빈 문자열(흡인력 α = 1 중립으로 처리) */
  professor: string;
  capacity: number | null;
  applicants: number | null;
}

/**
 * 모델이 산출하는 분반별 예측. 확률 곡선을 통째로 저장하지 않고 **모수만** 저장한다 —
 * 곡선은 런타임에 정규 CDF로 즉석 계산되므로 데이터가 수십 배 작다.
 */
export interface SectionPrediction extends SectionKey {
  professor: string;
  /** 컷 추정 평균(마일리지 점수) */
  mu: number;
  /** 컷 추정 표준편차(불확실성) */
  sigma: number;
  /** 이 추정이 어느 계층에서 왔는지 — UI 신뢰도 표시에 쓴다 */
  basis: PredictionBasis;
  /** 유효 표본 수(축소 전 실제 관측 개수) */
  samples: number;
  /** 이 과목에 걸 수 있는 최대 마일리지(정책상 상한 = max_allowed, 미상이면 36) */
  maxMileage: number;
  /**
   * 만점 포화 확률 π — 과거 이력 중 "컷이 만점이었다"(= 만점끼리 동점으로 갈렸다)는
   * 학기의 최신성 가중 비율(0~1).
   *
   * π 가 크면 그 분반은 정규 CDF 가 아니라 "만점을 걸고 동점 경쟁"이 실제 모형이다.
   * `admitProbability` 가 이 비율만큼 곡선을 동점 승률(`tieWin`)로 갈아끼운다.
   *
   * ⚠️ 하위 호환을 위해 선택 필드다(구 번들에는 없다). 없으면 0 = 포화 없음으로 본다.
   */
  piSat?: number;
  /** 만점 동점 시 승률(0~1). 미상이면 null → 기본 0.6 */
  tieWin?: number | null;
  /**
   * 미달 분반 — 가장 최근 학기에 신청자 ≤ 정원이었다.
   * 이런 분반은 1점만 걸어도 사실상 들어간다(컷 0). 모형이 σ 로 만들어 내는
   * "낮은 배점의 위험"이 실제로는 존재하지 않으므로 확률에 바닥을 깐다.
   */
  underEnrolled?: boolean;
  /**
   * **형제 분반의 교수 라인업이 직전 학기와 달라졌다.**
   *
   * 같은 과목의 다른 분반 교수가 바뀌면 수요 쏠림이 바뀌어 컷이 움직인다. 이 플래그가 켜진
   * 분반은 "작년 컷이 올해에도 통한다"는 가정이 특히 약하다는 뜻이므로 UI 가 경고를 붙일 수
   * 있다. 하위 호환을 위한 선택 필드(구 번들에는 없다).
   */
  lineupChanged?: boolean;
}

/** 추정 근거 계층 — 낮을수록 정확 */
export type PredictionBasis =
  | 'section' // L1 동일 과목+교수+분반
  | 'professor' // L2 동일 과목+교수
  | 'course' // L3 동일 과목(교수 무관)
  | 'group' // L4 동일 학과·학년대(cold start)
  | 'none'; // 근거 없음 — 기본값만

/** 배포되는 예측 번들(정적 JSON) */
export interface MileageBundle {
  meta: {
    /** 이 번들이 대상으로 하는 학기 */
    year: string;
    semester: SemesterCode;
    /** 생성 시각(ISO) */
    generatedAt: string;
    /** 모델 식별자 — 방법론 변경 시 올린다 */
    model: string;
    /** 학년별 컷 보정치(동점자 규칙상 상위 학년 우대) */
    gradeShift: Record<string, number>;
  };
  sections: SectionMeta[];
  predictions: SectionPrediction[];
}

/** 사용자가 담은 한 과목의 계획 */
export interface PlannedCourse {
  key: SectionKey;
  /** 배분한 마일리지 */
  mileage: number;
  /** 졸업 필수도 가중치(1=선택, 2=권장, 3=필수). 최적화 목적함수에 쓰인다 */
  weight: number;
}

/** 사용자 프로필 — 예측 보정 입력 */
export interface MileageProfile {
  /** 학년 1~4 */
  grade: number;
  /** 학기 예산(연세대 정책상 72 또는 76) */
  budget: number;
}
