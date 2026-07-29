/**
 * 확보 학점 분포 — **정확 합성곱(exact convolution)**.
 *
 * 각 과목 i 가 서로 독립이고 확률 pᵢ 로 학점 cᵢ 를 확보한다고 보면, 총 확보 학점의 분포는
 * 학점이 가중된 포아송-이항(Poisson–binomial) 분포다. 이를 난수 시뮬레이션 없이
 * 동적계획법 합성곱으로 계산한다.
 *
 *   dp[k] = 총 k학점을 확보할 확률
 *   과목 하나를 추가할 때: dp'[k] = dp[k]·(1−p) + dp[k−c]·p
 *
 * 기존의 10,000회 Monte Carlo 대비 이점:
 *   · 정확하다 — 표본오차가 0 (10,000회는 ±0.5%p 수준의 잡음이 있다)
 *   · 재현 가능하다 — 같은 입력이면 항상 같은 출력(난수 없음)
 *   · 빠르다 — 과목 수 n, 총학점 C 에 대해 O(n·C), 실측 1ms 미만
 */

import type { SectionPrediction } from './types';
import { admitProbability } from './predict';

export interface DistributionItem {
  /** 합격 확률 0~1 */
  p: number;
  /** 이 과목의 학점 */
  credits: number;
}

export interface CreditDistribution {
  /** dp[k] = 정확히 k학점을 확보할 확률 (인덱스 = 학점) */
  pmf: number[];
  /** 기대 확보 학점 */
  expected: number;
  /** 가장 확률이 높은 학점 */
  mode: number;
  /** 총 신청 학점 */
  totalCredits: number;
}

/** 확보 학점의 정확한 확률질량함수를 계산한다. */
export function creditDistribution(items: DistributionItem[]): CreditDistribution {
  const totalCredits = items.reduce((a, it) => a + it.credits, 0);
  // dp[0] = 1 에서 시작해 과목을 하나씩 합성곱
  let dp = new Float64Array(totalCredits + 1);
  dp[0] = 1;

  for (const it of items) {
    const c = Math.max(0, Math.round(it.credits));
    const p = Math.min(1, Math.max(0, it.p));
    if (c === 0) continue;
    const next = new Float64Array(totalCredits + 1);
    for (let k = 0; k <= totalCredits; k++) {
      const cur = dp[k];
      if (cur === 0) continue;
      next[k] += cur * (1 - p); // 떨어짐
      if (k + c <= totalCredits) next[k + c] += cur * p; // 붙음
    }
    dp = next;
  }

  const pmf = Array.from(dp);
  let expected = 0;
  let mode = 0;
  for (let k = 0; k < pmf.length; k++) {
    expected += k * pmf[k];
    if (pmf[k] > pmf[mode]) mode = k;
  }
  return { pmf, expected, mode, totalCredits };
}

/** P(확보 학점 ≥ target) — 목표 달성 확률 */
export function probabilityAtLeast(dist: CreditDistribution, target: number): number {
  let s = 0;
  for (let k = Math.max(0, Math.ceil(target)); k < dist.pmf.length; k++) s += dist.pmf[k];
  return Math.min(1, Math.max(0, s));
}

/** 배분 상태에서 곧바로 분포를 구하는 헬퍼 */
export function distributionFor(
  entries: { pred: SectionPrediction; mileage: number; credits: number }[],
  gradeShift = 0,
): CreditDistribution {
  return creditDistribution(
    entries.map((e) => ({
      p: admitProbability(e.pred, e.mileage, gradeShift),
      credits: e.credits,
    })),
  );
}

/**
 * 차트용 막대 데이터 — 학점이 0인 구간이 많아 pmf 를 그대로 그리면 성기다.
 * 실제로 발생 가능한 학점 값(확률 > cutoff)만 추려 반환한다.
 */
export function histogramBars(
  dist: CreditDistribution,
  target: number,
  minP = 0.001,
): { credits: number; p: number; meetsTarget: boolean }[] {
  const bars: { credits: number; p: number; meetsTarget: boolean }[] = [];
  for (let k = 0; k < dist.pmf.length; k++) {
    if (dist.pmf[k] < minP) continue;
    bars.push({ credits: k, p: dist.pmf[k], meetsTarget: k >= target });
  }
  return bars;
}
