/**
 * 마일리지 컷 예측 — 계층적 경험 베이즈(hierarchical empirical Bayes) 축소 추정.
 *
 * 방법론(자체 설계):
 *   ① 관측 단위는 (과목·교수·분반·학기)의 "컷"(합격자 중 최저 배점)이다. 단, **컷은 청중
 *      그룹별로 잡는다** — 전공자 자리와 비전공자 자리를 따로 채우므로 둘을 섞은 최저 배점은
 *      어느 쪽의 컷도 아니다(정의와 실측 근거는 tools/mileage/precompute.mjs ① 절).
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
  CourseObservation,
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

/**
 * 만점 포화 확률 π 의 축소 상수 — π = Σw(컷=만점) / (Σw + PI_TAU).
 *
 * 날것의 비율을 그대로 쓰면 과신한다. 실측(2026-1학기 대상, 1,182분반): 직전 이력이 전부
 * 만점 포화였던 분반이 **이번에도 포화한 비율은 65.6%** 였다. 격자 탐색도 내부 최적을
 * 뚜렷이 가리킨다 — π 를 날것으로(τ=0) 0.1214, 아예 끄면(τ→∞) 0.1203, 최적에서 0.1175.
 *
 * ⚠️ 가중치는 **가장 최근 관측을 1로 정규화한 뒤** 더한다. 정규화하지 않으면 축소의 세기가
 *    "목표 학기와 최신 관측 사이의 거리"에 딸려 간다 — 반감기 0.5 에서 한 학기 차이는
 *    w=0.25 지만 두 학기(= 매년 한 학기만 열리는 과목) 차이는 w=0.0625 라, 똑같은 이력인데도
 *    π 상한이 0.35 와 0.118 로 갈렸다. 2026-2 번들은 예측 대상이 가을 과목이라 최신 관측이
 *    죄다 두 학기 전이고, 그래서 π 가 통째로 뭉개져 있었다(백테스트는 대상이 2026-1 이라
 *    이 붕괴를 볼 수 없었다). 개설 주기가 포화 확률을 좌우해서는 안 된다.
 *
 * τ=2.0 은 정규화 후 격자의 최적이면서(Brier 0.1176, 1.75~2.0 구간이 평평) 정규화 전
 * 최적값 0.5 와 **같은 유효 π** 를 준다: 0.25/(0.25+0.5) = 1/(1+2.0) = 0.33.
 * 백테스트가 고른 세기는 그대로 두고 개설 주기 의존성만 걷어낸 값이다.
 */
const PI_TAU = 2.0;

/**
 * 미달 판정의 여유율 — 신청자 ≤ 정원 × 이 값일 때만 "미달"로 본다.
 *
 * 정원을 아슬아슬하게 못 채운 분반(신청/정원 = 0.95 같은)은 다음 학기에 쉽게 뒤집힌다.
 * 실측: 직전 학기 신청 ≤ 정원이던 722개 분반 중 이번에도 미달인 비율은 73% 뿐이었고,
 * 그중 31.6% 는 이번 학기 컷이 2점 이상으로 올랐다(최대 36). 10% 여유를 요구하면
 * 그 오탐이 줄어 Brier 가 0.1237 → 0.1188 로 내려간다.
 */
const UNDER_MARGIN = 0.9;

/**
 * 미달 분반의 합격 확률 바닥값.
 *
 * 처음에는 0.95 로 잡았는데 백테스트가 이를 명확히 기각했다(Brier 0.1237 → 0.1373).
 * 직전 미달 분반의 **이번 학기 실제 컷**은 68.4% 만 1점 이하였고 p90 은 12점이었다.
 * 즉 "직전에 미달이었다"는 확실성이 아니라 3분의 2 정도의 기대치다. 0.65 가 그 실측과
 * 맞고 격자 탐색의 최적이기도 하다(0.60~0.70 구간이 평평).
 */
const UNDER_FLOOR = 0.65;

/**
 * **만점 이력 바닥** — 관측이 전부 만점이었던 분반은 축소가 만점 아래로 끌어내리지 못하게 한다.
 *
 * 왜 필요한가: 컷이 만점에 닿은 관측은 "컷 = 만점"이 아니라 **"컷 ≥ 만점"인 우측 절단**이다.
 * 실제 수요가 만점을 얼마나 넘었는지는 관측할 수 없다. 그런데 계층 축소는 이 점을 일반 관측과
 * 똑같이 다뤄 상위 계층(비포화 분반이 섞인 과목 평균) 쪽으로 끌어내린다. 관측이 1~2개뿐이면
 * w = n/(n+τ) 가 작아 그 하향이 커진다 — 2025-2 MEU3801-01(이종수, 이력이 만점 18 하나뿐)이
 * μ 14.4 로 내려앉고 실제는 18 이었다.
 *
 * 규칙: **최신성 가중 관측이 전부 포화**(π = 1)이고, 축소 후 μ 가 이미 만점에서 이 값 이내면
 * μ 를 만점으로 되돌린다. 두 조건이 다 필요하다 — π=1 만으로는 만점 36 짜리 인기 과목이
 * 무너지는 경우(컷 36 → 10)를 그대로 맞고, 게이트가 없으면 손해가 이득을 넘는다.
 *
 * 백테스트(가용한 목표 학기 전부, `rivalMode:'off'`, 전체 MAE):
 *
 *   설정                    2024-2      2025-1      2025-2      2026-1     적용분반 승-패
 *   π=1 게이트 없음          악화        악화         악화        악화       128승 135패 ← 기각
 *   π=1 · 만점≤18          −0.010      −0.009      −0.005      −0.005     131승  64패
 *   π=1 · 만점−μ ≤ 3       −0.007      −0.015      −0.004      −0.007     144승  75패
 *   **π=1 · 만점−μ ≤ 4**   **−0.005**  **−0.013**  **−0.008**  **−0.009** 157승  85패 ← 채택
 *   π=1 · 만점−μ ≤ 5       −0.009      −0.011      −0.007      −0.009     161승  89패
 *
 * 네 학기 전부 MAE 가 내려가고, 보정이 실제로 움직인 분반의 짝지은 승패는 157승 85패
 * (부호검정 p < 0.0001)다. 경쟁분반 보정이 기각된 이유(방향 적중 49%, 상관 0)와 정확히
 * 대비되는 신호다. 3~5 가 평평한 고원이라 값이 칼날 위에 있지 않고, 4 는 그 가운데이면서
 * 동기가 된 사례(MEU3801-01, 만점−μ = 3.6)를 포함한다.
 *
 * 비용: Brier 가 학기당 최대 +0.0002 나빠진다(0.1157 → 0.1159). μ 를 만점에 붙이면 만점
 * 미만 배점의 확률이 조금 낙관적이 되기 때문이다. 반감기 0.5 를 고를 때와 같은 성격의
 * 교환이고(그때는 Brier +0.002 를 Hit±3 +4pp 와 바꿨다), 여기서는 그 20분의 1 값이다.
 *
 * ⚠️ 기각된 변형도 남겨 둔다 — 같은 자료로 다시 재 보려는 다음 사람을 위해.
 *   ① **절단 인지 축소** τ_eff = τ·(1 − s·π): 게이트 없이는 2025-2 에서 128승 135패로 졌다.
 *      만점 36 짜리 분반이 포화에서 무너질 때의 손해가 이득을 삼킨다.
 *   ② **비대칭 축소**(하위 μ > 상위 μ 일 때만 약화): ① 과 사실상 같은 표본을 건드리고
 *      2025-2 에서 65승 65패 — 정확히 동전던지기였다.
 */
const SAT_FLOOR_GAP = 4;

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
  // recencyOrd: 라인업이 대상 학기와 같은 과거 학기를 최신처럼 취급하는 오버라이드
  // (types.ts HistoryPoint.recencyOrd 주석 참고 — precompute 의 RECENCY_ALIAS 가 주입)
  return decayWeight(p.recencyOrd ?? semesterOrdinal(p.year, p.semester), targetOrd, halfLife);
}

/** 같은 감쇠를 학기 서수만으로 — 이력 포인트가 아닌 관측(편성표)에도 쓴다 */
function decayWeight(ord: number, targetOrd: number, halfLife: number): number {
  return Math.pow(0.5, Math.max(0, targetOrd - ord) / halfLife);
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

/**
 * **교수 내 잔차**를 풀링한 표준편차 — 상위 계층 폴백용.
 *
 * 왜 필요한가: 같은 과목이라도 교수에 따라 컷이 3.8 / 12.4 / 16.1 처럼 크게 갈린다.
 * 과목 계층의 σ 를 그대로 폴백으로 쓰면 그 **교수 간 격차**가 "이 분반의 불확실성"으로
 * 둔갑해 σ 가 만점에 육박하고 확률 곡선이 평평해진다(정보 소멸). 우리가 알고 싶은 것은
 * "한 교수의 컷이 학기마다 얼마나 흔들리는가"이므로, 교수별 평균을 먼저 빼고 남은 잔차만
 * 모은다.
 *
 * 자유도: 교수 그룹마다 평균을 하나씩 추정했으므로 유효표본에서 그룹 수를 뺀다.
 * (빼지 않으면 1학기짜리 교수 그룹의 잔차가 전부 0 이라 σ 가 0 으로 붕괴한다.)
 * 남는 자유도가 없으면 null — 호출부가 COLD_SIGMA 로 간다.
 *
 * @param courseMu 교수를 모르는 관측의 기준선(과목 전체 가중평균)
 */
function pooledResidualSigma(
  byProf: Map<string, HistoryPoint[]> | undefined,
  courseMu: number,
  targetOrd: number,
  halfLife: number,
): number | null {
  if (!byProf || byProf.size === 0) return null;
  const resid: number[] = [];
  const ws: number[] = [];
  let groups = 0;
  for (const [prof, pts] of byProf) {
    if (pts.length === 0) continue;
    const w = pts.map((p) => recencyWeight(p, targetOrd, halfLife));
    const cuts = pts.map((p) => p.cutoff);
    // 담당 교수를 모르는 관측은 그 교수의 평균을 낼 수 없다 — 과목 전체 평균을 기준으로 쓴다.
    const center = prof === '' ? courseMu : weightedMean(cuts, w);
    groups++;
    for (let i = 0; i < pts.length; i++) {
      resid.push(cuts[i] - center);
      ws.push(w[i]);
    }
  }
  const sw = ws.reduce((a, b) => a + b, 0);
  const sw2 = ws.reduce((a, b) => a + b * b, 0);
  if (sw <= 0 || sw2 <= 0) return null;
  const nEff = (sw * sw) / sw2;
  const dof = nEff - groups;
  if (dof <= 1e-6) return null; // 평균을 빼고 나면 남는 정보가 없다
  const varW = resid.reduce((a, r, i) => a + ws[i] * r * r, 0) / sw;
  return Math.sqrt(varW * (nEff / dof));
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

/* ────────────────────────────────────────────────────────────────
 * 경쟁분반(형제분반) 수요 재배분 보정
 *
 * 문제: 계층 모형은 "이 교수의 지난 컷"을 본다. 그런데 컷은 그 교수 혼자 만든 값이 아니라
 * **그 학기 형제 분반이 누구였나**의 함수다. 같은 과목의 다른 분반에 인기 교수가 있으면
 * 수요가 갈려 컷이 낮고, 비인기 교수만 있으면 수요가 몰려 컷이 뛴다.
 *
 * 실증(MEU3600 응용고체역학, 정원·신청자·컷):
 *   2023-2  01 전흥재 40/25 컷1   · 02 장용훈 40/63  컷15
 *   2024-2  01 전흥재 40/53 컷2   · 02 장용훈 40/108 컷18(만점)
 *   2025-2  01 장용훈 50/76 컷18  · 02 이형석 50/87  컷15   ← 형제가 인기 교수로 바뀌자 분산
 *   2026-2  01 전흥재          · 02 장용훈             ← 2023·2024형 라인업으로 회귀
 * 장용훈의 컷은 자기 실력이 아니라 "옆 분반이 전흥재냐 이형석이냐"에 따라 움직였다.
 *
 * 설계 — 세 단계.
 *   ① 흡인력 α  : 과목·학기마다 각 분반의 (신청자 점유율 ÷ 정원 점유율)을 재고, 교수별로
 *                 최신성 가중 기하평균을 낸다. α=1 이 중립, α>1 이면 정원 대비 사람을 더
 *                 끌어온다. 관측이 없는 교수는 α=1.
 *   ② 재배분    : 과목 총수요 D 를 라인업에 α·정원 비율로 나눈다.
 *                     예상 신청자_d = D · α_d·정원_d / Σ(α·정원)
 *                     예상 경쟁률_d = D · α_d / Σ(α·정원)
 *   ③ 탄력성 β  : 같은 교수의 연속 두 학기에서 (컷/만점)의 변화를 log 경쟁률 변화에 회귀해
 *                 "경쟁률이 e배 되면 컷이 만점의 몇 할 오르는가"를 데이터로 잰다.
 *                     μ_adj = μ + β · 만점 · (log 예상경쟁률 − log 기준경쟁률)
 *
 * 기준경쟁률의 정의가 이 보정의 성패를 가른다. 세 가지를 구현해 백테스트로 골랐다.
 *
 *   'share'(채택)  **척도 불변 재배분 지수**를 비교한다.
 *                    ρ_d = α_d · Σ정원 / Σ(α·정원)   ← "과목 평균 대비 내가 끌어오는 배수"
 *                    Δ  = log ρ_d(이번) − log ρ_d(직전)  (α_d 가 소거된다)
 *                  과목 전체가 몇 배로 커지든 ρ 는 변하지 않으므로, 학기마다 개설 규모가
 *                  달라지는 과목(교양이 특히 심하다)의 **계절 효과가 섞이지 않는다**.
 *   'model'        Σ(α·정원) 자체를 비교한다 — 과목 규모 변화까지 보정에 넣는 변형.
 *                  백테스트에서 명확히 기각됐다: 봄·가을 개설 규모 차이가 그대로 보정으로
 *                  들어가 교양 대형 과목을 크게 흔들었다(CHM1101 등 +3.8mp).
 *   'observed'     지시서 문구 그대로 직전의 **실측** 경쟁률과 비교 — 총수요 표류와 α
 *                  추정오차가 함께 들어온다.
 *
 * 어느 모드든 라인업이 그대로면 Δ=0 이라 무관한 분반은 건드리지 않는다(백테스트의
 * "라인업 유지" 서브셋이 소수점까지 동일한 것으로 확인).
 *
 * ═══ 판정: **기각**. μ 보정은 기본값에서 꺼져 있다(`rivalMode: 'off'`). ═══
 *
 * 기제(機制)는 옳게 구현됐고 개별 사례는 설득력이 있는데, **모집단 수준에서 신호가 없다.**
 * 두 학기를 독립적으로 평가한 결과(2026-1 대상 1,182분반 / 2025-2 대상 2,220분반):
 *
 *   보정이 실제로 움직인 분반   MAE           중앙값        Hit±3         Brier
 *   2026-1 (n=256)             4.80 → 4.84   1.20 → 1.00   64.8 → 65.2   0.1172 → 0.1175
 *   2025-2 (n=319)             5.03 → 5.09   1.70 → 1.60   61.1 → 60.5   0.1219 → 0.1219
 *
 * 지표가 서로 엇갈려 β 만 잘 고르면 될 것처럼 보이지만, **크기를 빼고 부호만 본 진단이
 * 분명하게 갈랐다** — 보정이 가리킨 방향이 기준선 잔차의 방향과 맞은 비율:
 *
 *   α 범위     2026-1        2025-2        보정량↔잔차 상관
 *   course     49.3%(n=134)  46.9%(n=179)  −0.076 / +0.002
 *   global     52.9%(n=121)  48.6%(n=177)  −0.086 / −0.001
 *   blend      50.7%(n=144)  50.0%(n=182)  −0.094 / −0.012
 *
 * 전부 동전던지기이고 상관은 0 이다. β 를 어떻게 조정해도(−0.2…0.8 격자 탐색) 이길 수 없는
 * 형태다 — 신호가 약한 게 아니라 **없다**. 무리해서 채택하면 무관한 분반에 잡음만 더한다.
 *
 * 왜 없는가(추정): ① 컷의 절반가량이 0 아니면 만점에 몰려 있어 재배분이 컷을 움직일 여지가
 * 작다. ② 학기별 담당 교수 자료가 기계공학·공학수학 몇 과목에만 있어(professor-history.csv),
 * 나머지는 "분반 번호 = 같은 교수"라는 가정으로 α 를 매기는데 그 가정이 흔들리면 α 가 곧
 * 잡음이 된다. ③ 재배분의 크기 자체가 작다 — 적용된 분반의 평균 |보정| 은 0.2mp 였다.
 *
 * 그래서 **남긴 것**: 재배분 기제 전체(모드 스위치로 언제든 켤 수 있다)와 `lineupChanged`
 * 플래그. 후자는 μ 를 건드리지 않고 "작년 컷을 그대로 믿기 어려운 분반"을 표시만 하므로
 * 위 기각과 무관하게 유효하다. 학기별 교수 자료가 늘어나면(②) 재평가할 값어치가 있다 —
 * `RIVAL=share node tools/mileage/backtest.mjs <db>` 로 언제든 다시 잰다.
 * ──────────────────────────────────────────────────────────────── */

/** 흡인력 α 의 축소 상수 — logα 를 0(중립) 쪽으로 당긴다. w = Σw/(Σw+τ) */
const RIVAL_TAU_ALPHA = 1.0;
/** 보정량의 상한 — 만점의 이 비율. 모형이 자기 근거를 넘어 폭주하지 못하게 한다 */
const RIVAL_CAP_FRAC = 1 / 3;

/** 교수 미상 분반의 라인업 식별자 — "이름은 모르지만 그 자리"로 취급한다 */
const lineupLabel = (professor: string, division: string) =>
  professor ? professor : `#${division}`;

interface RivalObs extends CourseObservation {
  ord: number;
}

/** 한 분반에 대한 재배분 진단 — 보정량과 그 근거를 함께 돌려준다(리포트·UI용) */
export interface RivalDiagnostics {
  /** 이 분반 담당 교수의 흡인력 α(1 = 중립) */
  alpha: number;
  /** 대상 학기 예상 신청자 수 */
  expectedApplicants: number | null;
  /** 대상 학기 예상 경쟁률(예상 신청자/정원) */
  expectedRatio: number | null;
  /** 비교 기준이 되는 직전 경쟁률 */
  baseRatio: number | null;
  /** log 경쟁률 변화량 — 보정의 원료 */
  logShift: number;
  /** 실제 적용된 μ 보정량(클램프 후) */
  adjust: number;
  /** 형제 교수 집합이 직전 학기와 달라졌는가 */
  lineupChanged: boolean;
  /** 직전 학기 형제 라인업(자기 제외) */
  prevSiblings: string[];
  /** 이번 학기 형제 라인업(자기 제외) */
  targetSiblings: string[];
}

const NEUTRAL_DIAG: RivalDiagnostics = {
  alpha: 1,
  expectedApplicants: null,
  expectedRatio: null,
  baseRatio: null,
  logShift: 0,
  adjust: 0,
  lineupChanged: false,
  prevSiblings: [],
  targetSiblings: [],
};

export interface RivalModel {
  /** 데이터에서 적합한(또는 주입된) 탄력성 */
  beta: number;
  /** β 회귀에 쓰인 (같은 교수 연속 학기) 쌍의 수 */
  betaPairs: number;
  /** 흡인력 α — 과목마다 따로 잰다(교수 인기는 과목을 넘어 이전되지 않는다) */
  alphaOf: (code: string, professor: string) => number;
  /**
   * 한 분반의 보정을 계산한다.
   * @param prev 이 분반의 μ 가 근거로 삼는 **직전 관측**(학기 + 그때의 분반). 없으면 보정 없음.
   */
  evaluate: (
    s: SectionMeta,
    prev: { year: string; semester: string; division: string } | null,
  ) => RivalDiagnostics;
}

/**
 * 경쟁분반 모형을 적합한다. 대상 학기 정보는 일절 쓰지 않는다(입력 관측은 전부 과거).
 */
export function buildRivalModel(
  sections: SectionMeta[],
  histories: SectionHistory[],
  observations: CourseObservation[] | undefined,
  targetOrd: number,
  T: Tuning,
): RivalModel {
  // ── 관측 테이블 ──────────────────────────────────────────────
  // 편성표가 따로 주어지면 그것이 정본이다. 없으면 이력에서 되살린다(교수 소유 재배치로
  // 일부 분반이 빠질 수 있어 정확도가 떨어진다 — 호출부가 편성표를 주는 편이 좋다).
  const obsByKey = new Map<string, RivalObs>();
  const addObs = (o: CourseObservation) => {
    if (!o.code || !o.division) return;
    const k = `${o.code}|${o.division}|${o.year}|${o.semester}`;
    const prev = obsByKey.get(k);
    // 같은 자리에 대한 중복 관측은 **교수를 아는 쪽**을 남긴다.
    if (prev && !(prev.professor === '' && o.professor !== '')) return;
    obsByKey.set(k, { ...o, ord: semesterOrdinal(o.year, o.semester) });
  };
  if (observations && observations.length) {
    for (const o of observations) addObs(o);
  } else {
    for (const h of histories) {
      for (const p of h.points) {
        addObs({
          code: h.code,
          division: p.division ?? h.division,
          year: p.year,
          semester: p.semester,
          professor: p.professor ?? h.professor ?? '',
          capacity: p.capacity ?? null,
          applicants: p.applicants ?? null,
        });
      }
    }
  }

  /** 과목·학기 → 그 학기의 전 분반 */
  const bySem = new Map<string, RivalObs[]>();
  /** 분반별 가장 최근에 확인된 정원 — 이번 학기 정원의 대용치(편람에 정원이 없다) */
  const latestCap = new Map<string, { ord: number; cap: number }>();
  /** 분반별 관측 시계열 — β 회귀용 */
  const byDiv = new Map<string, RivalObs[]>();
  for (const o of obsByKey.values()) {
    const sk = `${o.code}|${o.year}|${o.semester}`;
    const semList = bySem.get(sk);
    if (semList) semList.push(o);
    else bySem.set(sk, [o]);

    const dk = `${o.code}|${o.division}`;
    const divList = byDiv.get(dk);
    if (divList) divList.push(o);
    else byDiv.set(dk, [o]);

    if (o.capacity != null && o.capacity > 0) {
      const cur = latestCap.get(dk);
      if (!cur || o.ord > cur.ord) latestCap.set(dk, { ord: o.ord, cap: o.capacity });
    }
  }

  /** 과목별 정원 대용치 — 이력이 없는 신설 분반에 쓴다 */
  const courseCapAvg = new Map<string, number>();
  {
    const acc = new Map<string, { sum: number; n: number }>();
    for (const [dk, v] of latestCap) {
      const code = dk.slice(0, dk.indexOf('|'));
      const a = acc.get(code) ?? { sum: 0, n: 0 };
      a.sum += v.cap;
      a.n++;
      acc.set(code, a);
    }
    for (const [code, a] of acc) courseCapAvg.set(code, a.sum / a.n);
  }
  const capOfDiv = (code: string, division: string): number | null =>
    latestCap.get(`${code}|${division}`)?.cap ?? courseCapAvg.get(code) ?? null;

  // ── ① 흡인력 α ──────────────────────────────────────────────
  // 점유율의 비이므로 곱셈적이다 → log 공간에서 평균 내고 지수로 되돌린다.
  //
  // ⚠️ **과목별로 따로 잰다.** 교수의 흡인력은 과목을 건너 옮겨 붙지 않는다. 실측: 전흥재는
  //    15명짜리 교양(UCI2001)에서 정원 대비 2.7배를 끌어오지만 MEU3600 응용고체에서는
  //    0.57~0.66 이다. 전 과목을 풀링하면 그 교양이 α=1.55 를 만들어 내고, "응용고체에서
  //    전흥재는 약한 경쟁자"라는 **부호가 통째로 뒤집힌다**. 과목별 표본이 적으면 축소가
  //    자연히 α→1(중립)로 데려가므로, 모르면 중립이 되고 알 때만 움직인다.
  const alphaPtsCourse = new Map<string, { w: number; l: number }[]>();
  const alphaPtsGlobal = new Map<string, { w: number; l: number }[]>();
  for (const list of bySem.values()) {
    const use = list.filter(
      (o) => o.capacity != null && o.capacity > 0 && o.applicants != null && o.applicants > 0,
    );
    if (use.length < 2) continue; // 단일 분반은 점유율이라는 개념 자체가 없다
    let sumA = 0;
    let sumC = 0;
    for (const o of use) {
      sumA += o.applicants as number;
      sumC += o.capacity as number;
    }
    if (sumA <= 0 || sumC <= 0) continue;
    for (const o of use) {
      if (!o.professor) continue; // 미상 교수에게는 흡인력을 귀속시키지 않는다
      const a = ((o.applicants as number) / sumA) / ((o.capacity as number) / sumC);
      if (!(a > 0) || !Number.isFinite(a)) continue;
      const pt = { w: decayWeight(o.ord, targetOrd, T.halfLife), l: Math.log(a) };
      for (const [m, k] of [
        [alphaPtsCourse, `${o.code}|${o.professor}`],
        [alphaPtsGlobal, o.professor],
      ] as const) {
        const arr = m.get(k);
        if (arr) arr.push(pt);
        else m.set(k, [pt]);
      }
    }
  }
  /** logα 로 축소 — 부모(기본 0 = 중립) 쪽으로 끌어당긴다 */
  const shrinkLogAlpha = (pts: { w: number; l: number }[] | undefined, parent: number): number => {
    if (!pts || pts.length === 0) return parent;
    // ⚠️ PI_TAU 와 같은 이유로 **가장 최근 관측을 1로 정규화**한 뒤 축소한다. 정규화하지 않으면
    //    축소 세기가 개설 주기(매년 1회 개설이면 항상 두 학기 전)에 딸려 간다.
    let wMax = 0;
    for (const p of pts) if (p.w > wMax) wMax = p.w;
    if (!(wMax > 0)) return parent;
    let sw = 0;
    let swl = 0;
    for (const p of pts) {
      const w = p.w / wMax;
      sw += w;
      swl += w * p.l;
    }
    return (swl + T.rivalTauAlpha * parent) / (sw + T.rivalTauAlpha);
  };
  const globalLogAlpha = new Map<string, number>();
  for (const [prof, pts] of alphaPtsGlobal) globalLogAlpha.set(prof, shrinkLogAlpha(pts, 0));
  const alphaCache = new Map<string, number>();
  const alphaOf = (code: string, professor: string): number => {
    if (!professor) return 1;
    const key = `${code}|${professor}`;
    const hit = alphaCache.get(key);
    if (hit !== undefined) return hit;
    let v: number;
    if (T.rivalAlphaScope === 'global') {
      v = Math.exp(globalLogAlpha.get(professor) ?? 0);
    } else {
      // 'course' 는 중립(0)으로, 'blend' 는 전 과목 α 쪽으로 축소한다.
      const parent =
        T.rivalAlphaScope === 'blend' ? (globalLogAlpha.get(professor) ?? 0) : 0;
      v = Math.exp(shrinkLogAlpha(alphaPtsCourse.get(key), parent));
    }
    alphaCache.set(key, v);
    return v;
  };

  // ── ② 과목 총수요 D ─────────────────────────────────────────
  const demandOf = new Map<string, number>();
  {
    const acc = new Map<string, { sw: number; swa: number }>();
    for (const [sk, list] of bySem) {
      let sumA = 0;
      let any = false;
      for (const o of list) {
        if (o.applicants != null) {
          sumA += o.applicants;
          any = true;
        }
      }
      if (!any) continue;
      const code = sk.slice(0, sk.indexOf('|'));
      const w = decayWeight(list[0].ord, targetOrd, T.halfLife);
      const a = acc.get(code) ?? { sw: 0, swa: 0 };
      a.sw += w;
      a.swa += w * sumA;
      acc.set(code, a);
    }
    for (const [code, a] of acc) if (a.sw > 0) demandOf.set(code, a.swa / a.sw);
  }

  // ── ③ 탄력성 β ──────────────────────────────────────────────
  // 같은 교수·같은 분반의 **연속 두 학기 차분**으로 잰다. 차분이 분반 고정효과(과목 난이도,
  // 교수 인기)를 통째로 소거하므로, 남는 것은 "경쟁률이 움직이면 컷이 얼마나 따라가나"뿐이다.
  // 컷은 만점에 막히므로 만점으로 정규화해서 회귀한다(만점 18 과목과 36 과목을 같이 놓는다).
  const cutIdx = new Map<string, number>();
  for (const h of histories) {
    for (const p of h.points) {
      cutIdx.set(`${h.code}|${p.division ?? h.division}|${p.year}|${p.semester}`, p.cutoff);
    }
  }
  const capMaxOf = new Map<string, number>();
  for (const s of sections) {
    if (!capMaxOf.has(s.code)) {
      capMaxOf.set(s.code, s.maxAllowed && s.maxAllowed > 0 ? s.maxAllowed : 36);
    }
  }
  let sxy = 0;
  let sxx = 0;
  let betaPairs = 0;
  for (const [dk, list] of byDiv) {
    if (list.length < 2) continue;
    const code = dk.slice(0, dk.indexOf('|'));
    const cap = capMaxOf.get(code);
    if (!cap) continue; // 이번 학기에 없는 과목은 만점을 모른다 — 정규화할 수 없다
    const sorted = [...list].sort((a, b) => a.ord - b.ord);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      // 교수가 바뀐 구간은 "경쟁률 효과"와 "교수 효과"가 뒤섞인다 — 제외한다.
      if (lineupLabel(a.professor, a.division) !== lineupLabel(b.professor, b.division)) continue;
      if (!a.capacity || !b.capacity || !a.applicants || !b.applicants) continue;
      const c1 = cutIdx.get(`${a.code}|${a.division}|${a.year}|${a.semester}`);
      const c2 = cutIdx.get(`${b.code}|${b.division}|${b.year}|${b.semester}`);
      if (c1 === undefined || c2 === undefined) continue;
      const dx = Math.log(b.applicants / b.capacity) - Math.log(a.applicants / a.capacity);
      const dy = (c2 - c1) / cap;
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx === 0) continue;
      sxy += dx * dy;
      sxx += dx * dx;
      betaPairs++;
    }
  }
  const beta = T.rivalBeta ?? (sxx > 0 ? sxy / sxx : 0);

  // ── ④ 분반별 보정 ───────────────────────────────────────────
  const byCode = new Map<string, SectionMeta[]>();
  for (const s of sections) {
    const arr = byCode.get(s.code);
    if (arr) arr.push(s);
    else byCode.set(s.code, [s]);
  }

  const evaluate: RivalModel['evaluate'] = (s, prev) => {
    const alpha = alphaOf(s.code, s.professor);
    const lineup = byCode.get(s.code) ?? [s];
    const targetSiblings = lineup
      .filter((x) => x.division !== s.division)
      .map((x) => lineupLabel(x.professor, x.division))
      .sort();

    const prevList = prev ? (bySem.get(`${s.code}|${prev.year}|${prev.semester}`) ?? []) : [];
    const prevSiblings = prevList
      .filter((o) => o.division !== prev!.division)
      .map((o) => lineupLabel(o.professor, o.division))
      .sort();
    const lineupChanged =
      prev != null && prevList.length > 0
        ? targetSiblings.join('') !== prevSiblings.join('')
        : false;

    const base: RivalDiagnostics = {
      ...NEUTRAL_DIAG,
      alpha,
      lineupChanged,
      prevSiblings,
      targetSiblings,
    };

    if (T.rivalMode === 'off') return base;
    // 단일 분반 과목은 재배분할 상대가 없다(지시: 보정 0).
    if (lineup.length < T.rivalMinDivisions) return base;
    if (!prev || prevList.length === 0) return base;

    // Σ(α·정원) 과 Σ정원 — 이번 학기 라인업
    let sumT = 0;
    let capT = 0;
    for (const x of lineup) {
      const c = capOfDiv(s.code, x.division);
      if (c == null || !(c > 0)) return base;
      sumT += alphaOf(s.code, x.professor) * c;
      capT += c;
    }
    // 같은 값 — 직전 학기 라인업(그 학기의 실제 정원을 쓴다)
    let sumP = 0;
    let capP = 0;
    for (const o of prevList) {
      const c = o.capacity != null && o.capacity > 0 ? o.capacity : capOfDiv(s.code, o.division);
      if (c == null || !(c > 0)) return base;
      sumP += alphaOf(s.code, o.professor) * c;
      capP += c;
    }
    if (!(sumT > 0) || !(sumP > 0) || !(capT > 0) || !(capP > 0)) return base;

    const demand = demandOf.get(s.code) ?? null;
    const capSelf = capOfDiv(s.code, s.division);
    const expectedApplicants =
      demand != null && capSelf != null ? (demand * alpha * capSelf) / sumT : null;
    const expectedRatio = demand != null ? (demand * alpha) / sumT : null;

    let baseRatio: number | null;
    let logShift: number;
    if (T.rivalMode === 'observed') {
      // 지시서 문구대로 — 직전의 **실측** 경쟁률과 비교한다.
      const self = prevList.find((o) => o.division === prev.division);
      if (!self || !self.capacity || !self.applicants || expectedRatio == null) return base;
      baseRatio = self.applicants / self.capacity;
      logShift = Math.log(expectedRatio) - Math.log(baseRatio);
    } else if (T.rivalMode === 'model') {
      // 과목 규모 변화까지 포함 — 계절 효과가 섞여 백테스트에서 기각된 변형.
      baseRatio = demand != null ? (demand * alpha) / sumP : null;
      logShift = Math.log(sumP) - Math.log(sumT);
    } else {
      // 채택 — 척도 불변 재배분 지수 ρ = α_d·Σ정원/Σ(α·정원). α_d 가 소거된다.
      baseRatio = demand != null ? (demand * alpha) / sumP : null;
      logShift = Math.log(capT / sumT) - Math.log(capP / sumP);
    }
    if (!Number.isFinite(logShift)) return base;

    const cap = capMaxOf.get(s.code) ?? (s.maxAllowed && s.maxAllowed > 0 ? s.maxAllowed : 36);
    const limit = cap * T.rivalCapFrac;
    const adjust = Math.max(-limit, Math.min(limit, beta * cap * logShift));

    return {
      alpha,
      expectedApplicants,
      expectedRatio,
      baseRatio,
      logShift,
      adjust,
      lineupChanged,
      prevSiblings,
      targetSiblings,
    };
  };

  return { beta, betaPairs, alphaOf, evaluate };
}

export interface PredictInput {
  /** 이번 학기 개설 분반 전체 — 교양·타전공을 포함해 하나도 빠뜨리지 않는다(사용자 지시 1) */
  sections: SectionMeta[];
  /** 과거 이력 전체 */
  histories: SectionHistory[];
  /**
   * 과거 학기의 **분반 편성표**(경쟁분반 보정용). 없으면 이력에서 되살리지만, 교수 소유
   * 재배치로 빠진 분반이 생겨 형제 집합이 불완전해진다 — 호출부에서 넘겨 주는 편이 정확하다.
   */
  observations?: CourseObservation[];
  /** 예측 대상 학기 — 최신성 가중치의 기준점 */
  target: { year: string | number; semester: string };
  /** 튜닝 모수(백테스트로 고른다) */
  tuning?: Partial<Tuning>;
  /** 적합된 경쟁분반 모형을 돌려받는 통로(리포트·디버깅용) */
  onRivalModel?: (model: RivalModel) => void;
}

export interface Tuning {
  /** 최신성 반감기(학기). 작을수록 최신 컷만 본다 */
  halfLife: number;
  /** 계층 축소 상수 — 클수록 상위 계층으로 강하게 끌어당긴다 */
  tauSection: number;
  tauProfessor: number;
  tauCourse: number;
  /**
   * 교수 미상 관측을 현재 교수 것으로 가정할지.
   *
   * false(=가정하지 않음)가 이론적으로는 더 안전해 보이지만, 백테스트에서 이득이 없었다
   * (공학수학·전교 동일, 기계공학은 Hit±3 50.0%→46.9% 로 오히려 하락). 미상 관측을 버리면
   * 표본이 줄어 상위 계층으로 과하게 축소되는 쪽이 손해였다. 그래서 기본은 가정을 유지한다.
   * 교체가 확인된 학기는 어차피 실제 교수로 정확히 귀속되므로 오염은 제한적이다.
   */
  assumeLineage: boolean;

  /**
   * 경쟁분반 보정의 기준경쟁률 정의(설명은 위 절 주석 참고).
   *   'share'    척도 불변 재배분 지수 비교 — 채택
   *   'model'    Σ(α·정원) 비교 — 과목 규모 변화 포함(계절 효과 오염으로 기각)
   *   'observed' 직전의 실측 경쟁률과 비교
   *   'off'      보정 없음(기준선 재현용)
   */
  rivalMode: 'share' | 'model' | 'observed' | 'off';
  /** 탄력성 β 를 직접 주입한다. null 이면 이력에서 회귀로 적합 */
  rivalBeta: number | null;
  /**
   * 흡인력 α 의 추정 범위.
   *   'course' 그 과목 안에서만 — 채택(교수 인기는 과목을 넘어 이전되지 않는다)
   *   'blend'  과목별 α 를 전 과목 α 쪽으로 축소
   *   'global' 전 과목 풀링 — 소형 교양이 전공과목의 부호를 뒤집어 기각
   */
  rivalAlphaScope: 'course' | 'blend' | 'global';
  /** 흡인력 α 의 축소 상수 */
  rivalTauAlpha: number;
  /** 보정량 상한(만점 대비 비율) */
  rivalCapFrac: number;
  /** 보정을 적용할 최소 분반 수 — 2 면 다분반 과목에만 적용 */
  rivalMinDivisions: number;
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
  assumeLineage: false,
  /**
   * 경쟁분반 보정은 **꺼져 있다** — 백테스트가 기각했다(위 절 주석의 표 참고).
   * `lineupChanged` 플래그는 모드와 무관하게 계속 계산된다.
   */
  rivalMode: 'off',
  rivalBeta: null,
  rivalAlphaScope: 'course',
  rivalTauAlpha: RIVAL_TAU_ALPHA,
  rivalCapFrac: RIVAL_CAP_FRAC,
  rivalMinDivisions: 2,
};

/**
 * 전체 분반에 대해 컷 분포 모수를 추정한다.
 * 이력이 없는 분반도 상위 계층/그룹 평균으로 반드시 값을 갖는다(빠지는 과목 없음).
 */
export function predictAll({
  sections,
  histories,
  observations,
  target,
  tuning,
  onRivalModel,
}: PredictInput): SectionPrediction[] {
  const T = { ...DEFAULT_TUNING, ...tuning };
  const targetOrd = semesterOrdinal(target.year, target.semester);
  const rival = buildRivalModel(sections, histories, observations, targetOrd, T);
  onRivalModel?.(rival);
  // 계층별 인덱스 구성
  const byCourseProfDiv = new Map<string, HistoryPoint[]>();
  const byCourseProf = new Map<string, HistoryPoint[]>();
  const byCourse = new Map<string, HistoryPoint[]>();
  /** 과목 → (담당 교수 → 그 교수의 관측). 잔차 σ 계산용. 키 '' 는 교수 미상. */
  const byCourseProfPts = new Map<string, Map<string, HistoryPoint[]>>();
  const push = (m: Map<string, HistoryPoint[]>, k: string, pts: HistoryPoint[]) => {
    const cur = m.get(k);
    if (cur) cur.push(...pts);
    else m.set(k, [...pts]);
  };
  /**
   * 담당 교수 자료가 하나라도 있는 과목 — 이런 과목은 "분반 계보" 가정을 쓰지 않는다.
   *
   * 교수가 분반을 서로 맞바꾸는 과목(공학수학이 대표적)에서는, 담당 교수를 모르는 관측을
   * 현재 교수 것으로 가정하면 남의 컷을 그 교수에게 붙이게 된다. 이 과목이 교수를 바꾼다는
   * 사실 자체를 자료가 말해 주고 있으므로, 모르는 관측은 교수 계층에 넣지 않고
   * 과목 계층(L3)에만 기여시킨다 — 즉 "모르면 가정하지 않는다".
   */
  for (const h of histories) {
    for (const p of h.points) {
      // 그 학기의 실제 담당 교수. 자료가 없으면 이 분반의 (현재) 교수로 본다.
      //
      // ⚠️ 교수가 분반을 옮기는 과목은 **전처리 단계에서 이미 교수 기준으로 이력이 재구성**돼
      //    들어온다(tools/mileage/precompute.mjs). 즉 여기 h.points 는 "이 분반의 기록"이
      //    아니라 "이 담당 교수의 기록"이다. 모델은 그걸 그대로 계층에 넣기만 하면 된다.
      const prof = p.professor ?? h.professor;
      if (prof) {
        push(byCourseProfDiv, `${h.code}|${prof}|${h.division}`, [p]);
        push(byCourseProf, `${h.code}|${prof}`, [p]);
      }
      push(byCourse, h.code, [p]);
      let pm = byCourseProfPts.get(h.code);
      if (!pm) {
        pm = new Map();
        byCourseProfPts.set(h.code, pm);
      }
      push(pm, prof || '', [p]);
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
    const ptsSec = byCourseProfDiv.get(kSec) ?? [];
    const ptsProf = byCourseProf.get(kProf) ?? [];
    const ptsCourse = byCourse.get(s.code) ?? [];
    const lSec = summarize(ptsSec, targetOrd, T.halfLife);
    const lProf = summarize(ptsProf, targetOrd, T.halfLife);
    const lCourse = summarize(ptsCourse, targetOrd, T.halfLife);
    const lGroup = summarize(byGroup.get(groupKeyOf(s)) ?? [], targetOrd, T.halfLife);

    /**
     * 이 분반에 실제로 걸 수 있는 만점. **36 은 전교 상한일 뿐** 과목마다 다르다
     * (기계공학 전공과목 다수가 18). 이 값이 σ 상한과 확률 곡선의 정의역을 결정한다.
     *
     * ⚠️ 만점 이력 바닥(SAT_FLOOR_GAP)이 이 값을 필요로 해 μ 계산보다 앞에 둔다.
     */
    const cap = s.maxAllowed && s.maxAllowed > 0 ? s.maxAllowed : 36;

    // 상위 → 하위로 순차 축소: 전체 → 그룹 → 과목 → 교수 → 분반
    const muGroup = shrink(lGroup, globalMu, T.tauCourse);
    const muCourse = shrink(lCourse, muGroup, T.tauCourse);
    const muProf = shrink(lProf, muCourse, T.tauProfessor);
    let mu = shrink(lSec, muProf, T.tauSection);

    /**
     * 만점 이력 바닥 — 근거로 삼은 관측이 **하나도 빠짐없이** 만점이었다면(= 전부 우측 절단)
     * 축소가 만점 아래로 끌어내린 몫을 되돌린다. 상세한 근거는 SAT_FLOOR_GAP 주석 참고.
     *
     * 판정에 쓰는 관측은 분반(=이 교수) 자신의 것이고, 없으면 같은 과목 이 교수의 것이다.
     * 과목 계층(ptsCourse)은 쓰지 않는다 — 남의 분반이 포화했다는 사실은 이 분반의 근거가
     * 못 된다. 최신성 가중은 전부 양수라 "가중 비율 = 1" 과 "전부 포화"가 같은 조건이므로,
     * 부동소수 비교 대신 그대로 전수 판정한다.
     */
    const floorPts = ptsSec.length ? ptsSec : ptsProf;
    if (
      floorPts.length > 0 &&
      cap - mu <= SAT_FLOOR_GAP &&
      floorPts.every((p) => p.cutoff >= cap)
    ) {
      mu = cap;
    }

    // 불확실성: 가장 구체적인 계층의 표준편차를 쓰되, 표본이 적으면 넓힌다.
    //
    // 폴백 순서 — 분반(=교수) 자기 σ → 같은 교수의 과목 σ → **교수 내 잔차 풀링 σ**.
    // 마지막 항목이 핵심이다: 예전에는 과목/학과 계층의 σ 를 그대로 썼는데, 그 값에는
    // **교수 간 격차**가 섞여 있어(같은 과목의 교수별 컷이 3.8 / 12.4 / 16.1) σ 가 만점에
    // 육박했고 곡선이 평평해져 정보가 사라졌다. 교수별 평균을 뺀 잔차만 모으면 "한 교수의
    // 컷이 학기마다 얼마나 흔들리는가"라는 우리가 실제로 원하는 양이 나온다.
    //
    // 그래도 σ 는 만점/2.5 로 상한을 둔다 — 그 이상이면 곡선이 기울기를 잃는다. 표본이
    // 부족하다는 사실은 basis·samples 로 UI 가 별도 표시한다(수치를 과신하게 만들지 않는다).
    const ownSigma = lSec?.sigma ?? null;
    const residSigma = lCourse
      ? pooledResidualSigma(byCourseProfPts.get(s.code), lCourse.mu, targetOrd, T.halfLife)
      : null;
    const rawSigma = ownSigma ?? lProf?.sigma ?? residSigma;
    const n = lSec?.n ?? 0;
    const widened =
      rawSigma === null ? COLD_SIGMA : rawSigma * (1 + 1 / Math.max(1, n));
    const sigma = Math.min(cap / 2.5, Math.max(MIN_SIGMA, widened));

    /**
     * 만점 포화 π — "컷이 만점이었다"는 학기의 최신성 가중 비율.
     *
     * 컷이 만점에 닿았다는 것은 정원이 만점 응찰자만으로 다 찼다는 뜻이고, 그 학기의
     * 당락은 배점이 아니라 동점 규칙(총이수학점·졸업예정 등)이 갈랐다. 정규 CDF 로는
     * 표현할 수 없는 상태라 확률을 따로 섞는다.
     *
     * 날것의 비율이 아니라 PI_TAU 로 축소한 값이다 — 이유는 상수 주석 참고.
     *
     * ⚠️ 학기별 만점 이력이 따로 없어 **현재 만점(cap)으로 근사**한다. 만점 정책은 학기마다
     *    바뀌는 값이 아니라 실무상 안전한 근사다.
     *
     * 가중치는 가장 최근 관측이 1이 되도록 정규화한다 — 축소 세기가 개설 주기에 딸려 가지
     * 않게 하려는 것이다(PI_TAU 주석 참고).
     */
    const satPts = ptsSec.length ? ptsSec : ptsProf.length ? ptsProf : ptsCourse;
    let piSat = 0;
    if (satPts.length) {
      const rawW = satPts.map((p) => recencyWeight(p, targetOrd, T.halfLife));
      const wMax = Math.max(...rawW);
      if (wMax > 0) {
        let wSum = 0;
        let wSat = 0;
        for (let i = 0; i < satPts.length; i++) {
          const w = rawW[i] / wMax;
          wSum += w;
          if (satPts[i].cutoff >= cap) wSat += w;
        }
        piSat = wSat / (wSum + PI_TAU);
      }
    }

    /**
     * 미달 — 가장 최근 학기에 신청자가 정원에 **여유 있게** 못 미쳤다면 사실상 전원 수용이었다.
     * 이런 분반은 σ 가 만들어 내는 "낮은 배점의 위험"이 실제로는 존재하지 않는다.
     * 판정은 이 분반(=이 교수) 자신의 기록으로만 한다 — 남의 분반 정원은 근거가 못 된다.
     */
    let underEnrolled = false;
    let latest: HistoryPoint | null = null;
    let latestOrd = -Infinity;
    for (const p of ptsSec) {
      const o = semesterOrdinal(p.year, p.semester);
      if (o > latestOrd) {
        latestOrd = o;
        latest = p;
      }
    }
    if (
      latest &&
      latest.capacity !== null &&
      latest.capacity !== undefined &&
      latest.applicants !== null &&
      latest.applicants !== undefined &&
      latest.applicants <= latest.capacity * UNDER_MARGIN
    ) {
      underEnrolled = true;
    }

    const basis: PredictionBasis = lSec
      ? 'section'
      : lProf
        ? 'professor'
        : lCourse
          ? 'course'
          : lGroup
            ? 'group'
            : 'none';

    /**
     * 경쟁분반 재배분 보정 — μ 를 "형제 라인업이 그때와 얼마나 달라졌나"만큼 옮긴다.
     *
     * 기준이 되는 직전 관측은 **이 분반(=이 교수)의 최신 이력**이다. 교수가 분반을 옮겼다면
     * 그 학기 그가 실제로 있던 자리(latest.division)를 기준으로 형제를 골라야 한다.
     */
    //
    // ⚠️ 분반이 아니라 **교수**를 따라간다. 교수가 분반을 옮긴 학기는 `ptsSec`(과목+교수+분반)가
    //    비어 버려, 여기서 멈추면 정작 라인업이 바뀐 분반에서 보정이 한 번도 켜지지 않는다
    //    (실제로 MEU3600 이 그 경우였다). `ptsProf`(과목+교수, 분반 무관)로 폴백한다.
    let rivalLatest: HistoryPoint | null = latest;
    if (!rivalLatest) {
      let bestOrd = -Infinity;
      for (const p of ptsProf) {
        const o = semesterOrdinal(p.year, p.semester);
        if (o > bestOrd) {
          bestOrd = o;
          rivalLatest = p;
        }
      }
    }
    const rivalPrev = rivalLatest
      ? {
          year: rivalLatest.year,
          semester: rivalLatest.semester,
          division: rivalLatest.division ?? s.division,
        }
      : null;
    const rd = rival.evaluate(s, rivalPrev);
    // 컷은 0 아래로도, 만점 위로도 갈 수 없다.
    const muAdj = Math.max(0, Math.min(cap, mu + rd.adjust));

    return {
      code: s.code,
      division: s.division,
      professor: s.professor,
      mu: round1(muAdj),
      sigma: round1(sigma),
      basis,
      samples: n,
      maxMileage: cap,
      piSat: Math.round(piSat * 100) / 100,
      tieWin: s.tieWin ?? null,
      underEnrolled,
      lineupChanged: rd.lineupChanged,
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
 * 동점 승률을 모를 때의 기본값 — 실측 학년별 동점 합격률(72~74%)보다 보수적으로 잡는다.
 * `admitProbability` 와 `adjustTieWin` 이 같은 값을 써야 화면과 계산이 어긋나지 않는다.
 */
export const TIE_WIN_DEFAULT = 0.6;

/**
 * 합격 확률 P(합격 | 마일리지 m).
 *
 * 기본형은 컷을 정규분포로 본 Φ((m − μ)/σ) 이지만, 실제 데이터에는 정규분포가 설명하지
 * 못하는 **경계 상태**가 둘 있다. 둘을 혼합(mixture)으로 붙인다.
 *
 *   ① 만점 포화(확률 π = `piSat`) — 컷이 만점에 닿은 상태. 만점 미만을 걸면 기회 자체가
 *      없고, 만점을 걸면 정규분포가 아니라 **동점 규칙의 승률**(`tieWin`)이 답이다.
 *   ② 미달(`underEnrolled`) — 최근 학기에 신청자가 정원에 여유 있게 못 미친 분반.
 *      σ 가 만들어 내는 "낮은 배점의 위험"이 실제로는 없으므로 바닥값을 깐다.
 *
 *        P(m) = (1−π)·F(m)  +  π·[m ≥ 만점]·tie
 *
 * **F 는 컷 분포를 "만점 미만"으로 자른 조건부 CDF**다: F(m) = Φ((m−μ)/σ) / Φ((cap−μ)/σ).
 * 자르지 않으면 안 맞는다 — 포화하지 않은 학기라면 컷은 정의상 만점 미만이므로 만점을
 * 걸었을 때 합격은 확실한데, 무보정 Φ 는 거기서 0.6 같은 값을 준다. 백테스트가 이 차이를
 * 분명히 갈랐다(같은 π 로 무보정 0.1186 vs 절단 0.1175).
 *
 * 학년 보정: 동점자 규칙상 상위 학년이 유리 → 체감 컷을 낮춘다.
 */
export function admitProbability(
  pred: Pick<SectionPrediction, 'mu' | 'sigma'> &
    Partial<Pick<SectionPrediction, 'maxMileage' | 'piSat' | 'tieWin' | 'underEnrolled'>>,
  mileage: number,
  gradeShift = 0,
): number {
  if (mileage <= 0) return 0;
  const sigma = Math.max(0.5, pred.sigma);
  const mu = pred.mu - gradeShift;
  const cap = pred.maxMileage ?? 36;
  const pi = pred.piSat ?? 0;
  const tie = pred.tieWin ?? TIE_WIN_DEFAULT;

  const atCap = Math.max(normalCdf((cap - mu) / sigma), 1e-6);
  const nonSat = Math.min(1, normalCdf((mileage - mu) / sigma) / atCap);
  let p = (1 - pi) * nonSat + (mileage >= cap ? pi * tie : 0);
  if (pred.underEnrolled) p = Math.max(p, UNDER_FLOOR);
  // 마일리지를 아무리 높여도 100%를 단언하지 않는다(동점·정책 변수 존재)
  return Math.min(0.99, Math.max(0, p));
}

/** 확률 곡선 전체(0…maxMileage) — 차트 렌더용 */
export function probabilityCurve(pred: SectionPrediction, gradeShift = 0): number[] {
  const out: number[] = [];
  for (let m = 0; m <= pred.maxMileage; m++) out.push(admitProbability(pred, m, gradeShift));
  return out;
}

/* ────────────────────────────────────────────────────────────────
 * 신청자 속성 레이어 — 학년별 실적(perGrade) · 이수율(tieCredit)
 *
 * 앞의 모형은 "이 분반의 컷이 어디에 형성되는가"만 본다. 분반이 만점에서 포화하면
 * (piSat 이 큰 분반) 컷은 더 이상 정보가 아니고, 당락은 **신청자 자신의 속성**이 가른다.
 * 이 절은 그 속성 두 가지를 확률에 얹는다.
 *
 *   ① 학년(perGrade) — 데이터다. 작년 이 분반에서 내 학년이 몇 명 지원해 몇 명 붙었는지
 *      실제로 집계돼 있다(precompute.mjs 의 gradeCutRows). 표본이 작을 수 있으므로
 *      집계 승률(tieWin) 쪽으로 축소해 섞는다 — 앞의 계층 축소와 같은 형식이다.
 *
 *   ② 이수율(tieCredit.winMin) — **휴리스틱이다.**
 *      ⚠️ 이 레이어는 백테스트로 검증할 수 없다. 백테스트는 "그 학기의 컷이 몇 점이었나"를
 *         맞히는 문제라 개별 신청자의 속성이 들어갈 자리가 없고, 우리 자료에도 "이수율 r 인
 *         학생이 동점에서 이겼는가"를 학생 단위로 다시 재현할 수단이 없다. 그래서 아래
 *         세 상수(RATIO_*)는 측정값이 아니라 **설계 판단**이다(작업 지시로 정해진 값).
 *         정확한 승률이 아니라 "승부선을 넘었는가"라는 방향을 보여 주는 용도로만 쓴다.
 *      winMin 은 "작년 동점자 중 합격한 최저 이수율"이다. 0 이면 이수율 0% 인 동점자도
 *      붙었다는 뜻 — 승부선이 형성되지 않은 것이므로 이 레이어를 적용하지 않는다.
 * ──────────────────────────────────────────────────────────────── */

/**
 * 학년별 승률의 축소 상수 — w = n/(n+τ), n = 내 학년 지원자 수.
 * τ=2 는 앞의 PI_TAU 와 같은 세기다(관측 1건이면 자기 값에 1/3 만 무게).
 */
const GRADE_TIE_TAU = 2;

/** 이수율이 승부선 이상일 때 더하는 값과 그 상한(설계 판단 — 위 주석 참고) */
const RATIO_WIN_BONUS = 0.2;
const RATIO_WIN_CAP = 0.9;
/** 이수율이 승부선 미만일 때 곱하는 값(설계 판단 — 위 주석 참고) */
const RATIO_LOSE_FACTOR = 0.3;

export interface TieAdjustInput {
  /** 번들의 집계 동점 승률(학년 무관). 미상이면 null */
  tieWin: number | null | undefined;
  /** 상세의 perGrade[내 학년] — 작년 이 분반에서 내 학년의 지원·합격 실적 */
  /** cut 이 null 이면 그 학년 합격자가 0명(전멸) — 승률 계산에는 won/applied 만 쓴다 */
  perGrade?: { cut: number | null; applied: number; won: number } | null;
  /** 만점 동점전 분반인가(piSat ≥ 임계). 이수율 레이어는 이때만 적용한다 */
  satTie: boolean;
  /** 상세의 tieCredit.winMin — 작년 동점자 중 합격한 최저 이수율(0~1) */
  winMin?: number | null;
  /** 사용자가 입력한 이수율(0~1). 미입력이면 null */
  ratio?: number | null;
}

export interface TieAdjustResult {
  /** 보정된 동점 승률. 보정할 근거가 없으면 입력값 그대로(= null 가능) */
  tieWin: number | null;
  /** 학년별 실적을 섞었는가 */
  gradeBlended: boolean;
  /** 이수율 판정 — 승부선을 넘었으면 'win', 못 넘었으면 'lose', 판정 불가면 null */
  verdict: 'win' | 'lose' | null;
}

/**
 * 동점 승률에 신청자 속성을 반영한다. 순수 함수 — UI 는 결과만 소비한다.
 */
export function adjustTieWin({
  tieWin,
  perGrade,
  satTie,
  winMin,
  ratio,
}: TieAdjustInput): TieAdjustResult {
  const base = tieWin ?? null;
  let out = base;
  let gradeBlended = false;

  // ① 학년별 실적으로 교체(표본 축소 혼합)
  if (perGrade && perGrade.applied > 0) {
    const n = perGrade.applied;
    const w = n / (n + GRADE_TIE_TAU);
    const own = Math.min(1, Math.max(0, perGrade.won / n));
    out = w * own + (1 - w) * (base ?? TIE_WIN_DEFAULT);
    gradeBlended = true;
  }

  // ② 이수율 × 승부선 — 만점 동점전 분반에서만, 승부선이 실제로 형성된 경우에만
  let verdict: TieAdjustResult['verdict'] = null;
  if (satTie && ratio != null && winMin != null && winMin > 0) {
    verdict = ratio >= winMin ? 'win' : 'lose';
    const cur = out ?? TIE_WIN_DEFAULT;
    out = verdict === 'win' ? Math.min(RATIO_WIN_CAP, cur + RATIO_WIN_BONUS) : cur * RATIO_LOSE_FACTOR;
  }

  return { tieWin: out, gradeBlended, verdict };
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
