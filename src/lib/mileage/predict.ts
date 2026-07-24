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

/** 오래된 학기일수록 가중치를 낮춘다(최근 경향 반영). 반감기 2학기. */
function recencyWeight(p: HistoryPoint, latestYear: number): number {
  const age = Math.max(0, latestYear - Number(p.year)) * 2 + (p.semester === '10' ? 1 : 0);
  return Math.pow(0.5, age / 2);
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

function summarize(points: HistoryPoint[], latestYear: number): Level | null {
  if (points.length === 0) return null;
  const cuts = points.map((p) => p.cutoff);
  const ws = points.map((p) => recencyWeight(p, latestYear));
  return { mu: weightedMean(cuts, ws), sigma: stdev(cuts), n: points.length };
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
  /** 이력의 최신 연도(가중치 계산 기준) */
  latestYear: number;
}

/**
 * 전체 분반에 대해 컷 분포 모수를 추정한다.
 * 이력이 없는 분반도 상위 계층/그룹 평균으로 반드시 값을 갖는다(빠지는 과목 없음).
 */
export function predictAll({ sections, histories, latestYear }: PredictInput): SectionPrediction[] {
  // 계층별 인덱스 구성
  const byCourseProfDiv = new Map<string, HistoryPoint[]>();
  const byCourseProf = new Map<string, HistoryPoint[]>();
  const byCourse = new Map<string, HistoryPoint[]>();
  const push = (m: Map<string, HistoryPoint[]>, k: string, pts: HistoryPoint[]) => {
    const cur = m.get(k);
    if (cur) cur.push(...pts);
    else m.set(k, [...pts]);
  };
  for (const h of histories) {
    push(byCourseProfDiv, `${h.code}|${h.professor}|${h.division}`, h.points);
    push(byCourseProf, `${h.code}|${h.professor}`, h.points);
    push(byCourse, h.code, h.points);
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
  const globalMu = globalPoints.length ? summarize(globalPoints, latestYear)!.mu : COLD_MU;

  return sections.map((s) => {
    const kSec = `${s.code}|${s.professor}|${s.division}`;
    const kProf = `${s.code}|${s.professor}`;
    const lSec = summarize(byCourseProfDiv.get(kSec) ?? [], latestYear);
    const lProf = summarize(byCourseProf.get(kProf) ?? [], latestYear);
    const lCourse = summarize(byCourse.get(s.code) ?? [], latestYear);
    const lGroup = summarize(byGroup.get(groupKeyOf(s)) ?? [], latestYear);

    // 상위 → 하위로 순차 축소: 전체 → 그룹 → 과목 → 교수 → 분반
    const muGroup = shrink(lGroup, globalMu, TAU.course);
    const muCourse = shrink(lCourse, muGroup, TAU.course);
    const muProf = shrink(lProf, muCourse, TAU.professor);
    const mu = shrink(lSec, muProf, TAU.section);

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
