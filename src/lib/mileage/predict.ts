/**
 * 마일리지 컷 예측 — 계층적 경험 베이즈(hierarchical empirical Bayes) 축소 추정.
 *
 * 방법론(자체 설계):
 *   ① 관측 단위는 (과목·교수·분반·학기)의 "컷"(합격자 중 최저 배점)이다.
 *   ② 컷을 정규분포 N(μ, σ²)로 보고, 표본이 적은 분반은 상위 계층의 평균으로 **축소**한다.
 *        L1 동일 과목+교수+분반 → L2 동일 과목+교수 → L3 동일 과목 → L4 동일 학과·학년대
 *      축소 가중치 w = n / (n + τ) 로, 표본이 많을수록 자기 계층을 신뢰한다(경험 베이즈).
 *      이 구조가 "같은 과목이라도 교수가 다르면 다른 예측"을 데이터가 뒷받침하는 만큼만
 *      반영하게 해 준다(사용자 지시 2).
 *   ③ 합격 확률은 닫힌 형식으로 P(합격 | m) = Φ((m − μ) / σ). 학습된 모델 파일이 필요 없고
 *      브라우저에서 즉시 계산된다.
 *
 * 참조 프로젝트가 쓴 LightGBM 분위수 회귀와는 계열이 다른 독립 설계다.
 */

import type {
  HistoryPoint,
  PredictionBasis,
  SectionHistory,
  SectionMeta,
  SectionPrediction,
} from './types';

/** 계층별 축소 상수 τ — 클수록 상위 계층으로 더 강하게 끌어당긴다.
 *  값이 작을수록 "그 계층의 표본을 믿는다". 학기 수가 많지 않아 보수적으로 잡았다. */
const TAU = { section: 1.2, professor: 2.0, course: 3.0 } as const;

/** 컷 분포의 최소 표준편차 — 표본이 1개뿐일 때 과신을 막는 하한 */
const MIN_SIGMA = 2.5;
/** 표본이 아예 없을 때 쓰는 기본 불확실성 */
const COLD_SIGMA = 7.0;
/** 근거가 전혀 없을 때의 기본 컷 */
const COLD_MU = 8;

/** 표준정규 누적분포 Φ — Abramowitz–Stegun 7.1.26 유리근사(오차 < 1.5e-7) */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** 표본 표준편차(n−1). 표본이 1개 이하면 null */
function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** 학기 서수 — 2025-1학기 < 2025-2학기 < 2026-1학기 순으로 정렬되는 정수 */
export function semesterOrdinal(year: string | number, semester: string): number {
  // 여름(11)·겨울(21) 계절학기는 각각 직전 정규학기와 같은 자리에 둔다(수강신청 경쟁이 별개)
  const half = semester === '10' || semester === '11' ? 0 : 1;
  return Number(year) * 2 + half;
}

/**
 * 최신성 가중치 — 오래된 학기일수록 낮춘다.
 *
 * 컷은 담당 교수·정원·학과 사정에 따라 학기마다 움직이고, 무엇보다 **과거 담당 교수 정보가
 * 데이터에 없다**(courses 테이블에 학기 구분이 없어 현재 학기 교수만 안다). 분반 번호가 같아도
 * 교수가 바뀌었을 수 있으므로, 오래된 관측을 평등하게 섞으면 지금과 무관한 값을 끌어온다.
 * 그래서 최신 학기에 강하게 무게를 싣는다(사용자 지시: "제일 최신 컷에 근거").
 *
 * halfLife = 가중치가 절반이 되는 학기 수. 작을수록 최신 관측만 본다.
 */
function recencyWeight(p: HistoryPoint, targetOrd: number, halfLife: number): number {
  const dist = Math.max(0, targetOrd - semesterOrdinal(p.year, p.semester));
  return Math.pow(0.5, dist / halfLife);
}

/** 가중 평균 */
function weightedMean(values: number[], weights: number[]): number {
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum === 0) return mean(values);
  return values.reduce((a, v, i) => a + v * weights[i], 0) / wsum;
}

/** 한 계층의 요약통계 */
interface Level {
  mu: number;
  sigma: number | null;
  n: number;
}

/**
 * 최신성 가중을 적용한 표준편차.
 *
 * μ 를 최신 가중평균으로 구하면서 σ 는 전 학기 균등 편차로 구하면 둘이 어긋난다 —
 * "최근 두 학기는 일치하는데 3년 전이 달랐다"는 경우 불확실성이 과대평가되고,
 * 그 결과 확률 곡선이 실제보다 완만해져 보정(Brier)이 나빠진다. 같은 가중으로 맞춘다.
 *
 * 유효 표본수 n_eff = (Σw)² / Σw² 로 불편보정한다(가중이 한 점에 쏠릴수록 n_eff → 1).
 */
function weightedStdev(values: number[], weights: number[], mu: number): number | null {
  const sw = weights.reduce((a, b) => a + b, 0);
  const sw2 = weights.reduce((a, b) => a + b * b, 0);
  if (sw <= 0 || sw2 <= 0) return null;
  const nEff = (sw * sw) / sw2;
  if (nEff <= 1.000001) return null; // 사실상 한 점 — 편차를 말할 수 없다
  const varW = values.reduce((a, v, i) => a + weights[i] * (v - mu) * (v - mu), 0) / sw;
  return Math.sqrt(varW * (nEff / (nEff - 1)));
}

function summarize(points: HistoryPoint[], targetOrd: number, halfLife: number): Level | null {
  if (points.length === 0) return null;
  const cuts = points.map((p) => p.cutoff);
  const ws = points.map((p) => recencyWeight(p, targetOrd, halfLife));
  const mu = weightedMean(cuts, ws);
  return { mu, sigma: weightedStdev(cuts, ws, mu), n: points.length };
}

/** 계층 하나를 상위 추정치 쪽으로 축소 */
function shrink(level: Level | null, parentMu: number, tau: number): number {
  if (!level) return parentMu;
  const w = level.n / (level.n + tau);
  return w * level.mu + (1 - w) * parentMu;
}

export interface PredictInput {
  /** 이번 학기 개설 분반 전체 — 교양·타전공을 포함해 하나도 빠뜨리지 않는다(사용자 지시 1) */
  sections: SectionMeta[];
  /** 과거 이력 전체 */
  histories: SectionHistory[];
  /** 예측 대상 학기 — 최신성 가중치의 기준점 */
  target: { year: string | number; semester: string };
  /** 튜닝 모수(백테스트로 고른다) */
  tuning?: Partial<Tuning>;
}

export interface Tuning {
  /** 최신성 반감기(학기). 작을수록 최신 컷만 본다 */
  halfLife: number;
  /** 계층 축소 상수 — 클수록 상위 계층으로 강하게 끌어당긴다 */
  tauSection: number;
  tauProfessor: number;
  tauCourse: number;
}

/**
 * 백테스트(2026-1학기, 평가 1,187분반)로 고른 값.
 *
 *   halfLife   MAE    중앙값   Hit±3    Brier
 *   99(균등)   4.34   2.00    58.3%   0.0953   ← 최신성 미적용
 *   1.0        4.10   1.70    61.6%   0.0919
 *   0.5        4.11   1.40    65.7%   0.0938   ← 채택
 *   0.3        4.17   1.10    65.3%   0.0965
 *
 * 0.5 를 고른 이유: 학생 체감에 가장 가까운 "예측이 3점 이내였나"(Hit±3)가 최고이고
 * MAE 도 최상위권이다. Brier(확률 보정)는 1.0 대비 0.002 나쁘지만, 그 차이보다
 * 적중률 4pp 가 더 크다고 판단했다. 이 값에서 최신 학기가 전체 가중의 약 73% 를 차지한다
 * (사용자 지시: "제일 최신 컷에 근거").
 */
export const DEFAULT_TUNING: Tuning = {
  halfLife: 0.5,
  tauSection: TAU.section,
  tauProfessor: TAU.professor,
  tauCourse: TAU.course,
};

/**
 * 전체 분반에 대해 컷 분포 모수를 추정한다.
 * 이력이 없는 분반도 상위 계층/그룹 평균으로 반드시 값을 갖는다(빠지는 과목 없음).
 */
export function predictAll({ sections, histories, target, tuning }: PredictInput): SectionPrediction[] {
  const T = { ...DEFAULT_TUNING, ...tuning };
  const targetOrd = semesterOrdinal(target.year, target.semester);
  // 계층별 인덱스 구성
  const byCourseProfDiv = new Map<string, HistoryPoint[]>();
  const byCourseProf = new Map<string, HistoryPoint[]>();
  const byCourse = new Map<string, HistoryPoint[]>();
  const push = (m: Map<string, HistoryPoint[]>, k: string, pts: HistoryPoint[]) => {
    const cur = m.get(k);
    if (cur) cur.push(...pts);
    else m.set(k, [...pts]);
  };
  /**
   * 이력 한 점의 담당 교수. 자료가 있으면 그 학기의 실제 교수를, 없으면 그 분반의
   * (현재) 교수를 쓴다 — 후자는 "분반 계보" 가정이며 담당이 안정적인 대부분의 과목에서 무해하다.
   */
  const profOf = (h: SectionHistory, p: HistoryPoint) => p.professor ?? h.professor;

  for (const h of histories) {
    for (const p of h.points) {
      const prof = profOf(h, p);
      // L1(분반): 같은 분반이면서 그 학기 담당 교수까지 같은 관측만 넣는다.
      //   분반 번호가 같아도 교수가 바뀌었다면 다른 흐름이므로 여기서 제외된다(사용자 지시).
      push(byCourseProfDiv, `${h.code}|${prof}|${h.division}`, [p]);
      // L2(교수): 분반이 달라도 같은 교수가 가르친 이력은 그 교수를 따라간다.
      push(byCourseProf, `${h.code}|${prof}`, [p]);
      // L3(과목): 교수 무관
      push(byCourse, h.code, [p]);
    }
  }

  // L4 그룹(학과 + 학년대) 평균 — cold start 기준선
  const byGroup = new Map<string, HistoryPoint[]>();
  const groupKeyOf = (s: SectionMeta) => `${s.deptCode}|${levelOf(s.code)}`;
  const sectionByCourse = new Map<string, SectionMeta>();
  for (const s of sections) sectionByCourse.set(s.code, s);
  for (const h of histories) {
    const s = sectionByCourse.get(h.code);
    if (s) push(byGroup, groupKeyOf(s), h.points);
  }
  const globalPoints = histories.flatMap((h) => h.points);
  const globalMu = globalPoints.length ? summarize(globalPoints, targetOrd, T.halfLife)!.mu : COLD_MU;

  return sections.map((s) => {
    const kSec = `${s.code}|${s.professor}|${s.division}`;
    const kProf = `${s.code}|${s.professor}`;
    const lSec = summarize(byCourseProfDiv.get(kSec) ?? [], targetOrd, T.halfLife);
    const lProf = summarize(byCourseProf.get(kProf) ?? [], targetOrd, T.halfLife);
    const lCourse = summarize(byCourse.get(s.code) ?? [], targetOrd, T.halfLife);
    const lGroup = summarize(byGroup.get(groupKeyOf(s)) ?? [], targetOrd, T.halfLife);

    // 상위 → 하위로 순차 축소: 전체 → 그룹 → 과목 → 교수 → 분반
    const muGroup = shrink(lGroup, globalMu, T.tauCourse);
    const muCourse = shrink(lCourse, muGroup, T.tauCourse);
    const muProf = shrink(lProf, muCourse, T.tauProfessor);
    const mu = shrink(lSec, muProf, T.tauSection);

    // 불확실성: 가장 구체적인 계층의 표준편차를 쓰되, 표본이 적으면 넓힌다.
    //
    // ⚠️ 상위 계층으로 폴백할 때는 **교수 간 편차**가 섞인다(같은 과목이라도 교수에 따라 컷이
    //    30점 넘게 갈리므로). 그 값을 그대로 이 분반의 불확실성으로 쓰면 σ가 배점 상한에
    //    맞먹어 확률 곡선이 평평해지고 정보가 사라진다. 그래서 상한을 씌운다 —
    //    σ ≤ 상한/2.5 면 곡선이 여전히 의미 있는 기울기를 갖는다. 표본이 부족하다는 사실은
    //    basis·samples 로 UI 가 별도 표시한다(수치를 과신하게 만들지 않는다).
    const ownSigma = lSec?.sigma ?? null;
    const fallbackSigma = lProf?.sigma ?? lCourse?.sigma ?? lGroup?.sigma ?? null;
    const rawSigma = ownSigma ?? fallbackSigma;
    const n = lSec?.n ?? 0;
    const maxMileage = 36;
    const widened =
      rawSigma === null ? COLD_SIGMA : rawSigma * (1 + 1 / Math.max(1, n));
    const sigma = Math.min(maxMileage / 2.5, Math.max(MIN_SIGMA, widened));

    const basis: PredictionBasis = lSec
      ? 'section'
      : lProf
        ? 'professor'
        : lCourse
          ? 'course'
          : lGroup
            ? 'group'
            : 'none';

    return {
      code: s.code,
      division: s.division,
      professor: s.professor,
      mu: round1(mu),
      sigma: round1(sigma),
      basis,
      samples: n,
      maxMileage: 36,
    };
  });
}

/** 학정번호에서 수준(1000/2000/…)을 뽑는다 — 그룹 키에 사용 */
function levelOf(code: string): string {
  const m = code.match(/(\d)\d{3}/);
  return m ? `${m[1]}000` : '0';
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * 합격 확률 P(합격 | 마일리지 m).
 * 컷이 m 미만이면 합격이므로 P = Φ((m − μ)/σ).
 * 학년 보정: 동점자 규칙상 상위 학년이 유리 → 체감 컷을 낮춘다.
 */
export function admitProbability(
  pred: Pick<SectionPrediction, 'mu' | 'sigma'>,
  mileage: number,
  gradeShift = 0,
): number {
  if (mileage <= 0) return 0;
  const z = (mileage - (pred.mu - gradeShift)) / Math.max(0.5, pred.sigma);
  // 마일리지를 아무리 높여도 100%를 단언하지 않는다(동점·정책 변수 존재)
  return Math.min(0.99, Math.max(0, normalCdf(z)));
}

/** 확률 곡선 전체(0…maxMileage) — 차트 렌더용 */
export function probabilityCurve(pred: SectionPrediction, gradeShift = 0): number[] {
  const out: number[] = [];
  for (let m = 0; m <= pred.maxMileage; m++) out.push(admitProbability(pred, m, gradeShift));
  return out;
}

/** 목표 확률을 처음 넘어서는 최소 마일리지 — "안전선" 안내에 쓴다 */
export function mileageForProbability(
  pred: SectionPrediction,
  target: number,
  gradeShift = 0,
): number {
  for (let m = 0; m <= pred.maxMileage; m++) {
    if (admitProbability(pred, m, gradeShift) >= target) return m;
  }
  return pred.maxMileage;
}
