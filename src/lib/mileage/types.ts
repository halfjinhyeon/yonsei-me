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
  /** 합격자 중 최저 배점(= 컷). 미달(전원 수용)이면 0 */
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
  /** 이 과목에 걸 수 있는 최대 마일리지(정책상 상한) */
  maxMileage: number;
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
