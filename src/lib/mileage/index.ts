/** 마일리지 전략 플래너 엔진 — 공개 API */
export * from './types';
export { normalCdf, predictAll, admitProbability, probabilityCurve, mileageForProbability } from './predict';
export {
  creditDistribution,
  probabilityAtLeast,
  distributionFor,
  histogramBars,
  type CreditDistribution,
  type DistributionItem,
} from './distribute';
export { allocate, efficientFrontier, type AllocEntry, type AllocationResult } from './allocate';
