/**
 * 백테스트 채택 규칙 — 신·구 DB 의 예측 덤프를 공통 분반으로 재고 "병합해도 되는가" 를 판정한다.
 *
 *   import { ADOPTION_RULE, compareDumps, judgeAdoption, formatComparison } from './backtest-rule.mjs';
 *   const cmp = compareDumps(prevDumpPath, newDumpPath);
 *   const verdict = judgeAdoption(cmp);        // { applicable, pass, reasons }
 *
 * 입력은 `tools/mileage/backtest.mjs` 가 `DUMP=<경로>` 로 남기는 JSON 이다:
 *   { "<학정번호>|<분반>": { mu, err, brier, basis, truth }, … }
 *
 * 왜 별도 모듈인가
 *   오케스트레이터(update-semester.mjs)는 최상위에서 파이프라인이 곧장 도는 CLI 라
 *   `import` 하는 순간 크롤이 시작된다. 규칙을 단위로 시험하려면 부작용 없는 모듈이어야 해서
 *   비교·판정만 여기로 뺐다. 오케스트레이터 ⑥ 이 이 모듈을 부른다.
 *
 * 정본 문서: tools/automation-phase3.md 2절 P3-2
 */
import { readFileSync } from 'node:fs';

/**
 * 채택 임계 — 공통 분반 기준.
 *
 * 목적은 **개선 판정이 아니다**. 크롤이 깨지거나 필드 매핑이 어긋난 채로 데이터가
 * 병합되는 사고를 거르는 것이다(automation-phase3.md P3-2). 그래서 "새 DB 가 더 좋아야
 * 통과" 가 아니라 "눈에 띄게 나빠지지 않으면 통과" 로 잡았다. 학기마다 데이터가 늘면 보통
 * 조금씩 좋아지고, 나빠지더라도 소수점 단위다 — 실측(2026-20 재생성)에서 MAE 4.228 ·
 * Hit±3 65.0% 가 그대로 재현됐다. 두 학기 운영해 보고 수치를 조인다.
 *
 * · maeWorsenMax  MAE 는 낮을수록 좋다 → (새 − 이전) 이 이 값을 **넘으면** 실패
 * · hitDropMaxPct Hit±3 은 높을수록 좋다 → (새 − 이전) 이 −이 값보다 **낮으면** 실패
 */
export const ADOPTION_RULE = { maeWorsenMax: 0.1, hitDropMaxPct: 0.5 };

/** 한 덤프의 지표. keys 는 공통 분반 키 목록. */
function stat(dump, keys) {
  let sumErr = 0;
  let hit = 0;
  let sumBrier = 0;
  let nBrier = 0;
  for (const k of keys) {
    const e = Math.abs(dump[k].err);
    sumErr += e;
    if (e <= 3) hit++;
    if (Number.isFinite(dump[k].brier)) {
      sumBrier += dump[k].brier;
      nBrier++;
    }
  }
  return {
    mae: sumErr / keys.length,
    hit: (hit / keys.length) * 100,
    brier: nBrier > 0 ? sumBrier / nBrier : Number.NaN,
  };
}

/**
 * 두 덤프를 **공통 분반만** 비교한다. 한쪽에만 있는 분반을 섞으면 난이도가 다른 표본을
 * 비교하게 돼 지표가 데이터 변화가 아니라 표본 변화를 반영한다.
 *
 * @returns {{ keys: number, prevTotal: number, newTotal: number,
 *             prev: {mae,hit,brier}|null, next: {mae,hit,brier}|null,
 *             delta: {mae,hit,brier}|null }}
 */
export function compareDumps(prevPath, newPath) {
  const prev = JSON.parse(readFileSync(prevPath, 'utf-8'));
  const next = JSON.parse(readFileSync(newPath, 'utf-8'));
  const keys = Object.keys(prev).filter(
    (k) => next[k] && Number.isFinite(prev[k].err) && Number.isFinite(next[k].err),
  );
  const base = { keys: keys.length, prevTotal: Object.keys(prev).length, newTotal: Object.keys(next).length };
  if (keys.length === 0) return { ...base, prev: null, next: null, delta: null };
  const p = stat(prev, keys);
  const n = stat(next, keys);
  return { ...base, prev: p, next: n, delta: { mae: n.mae - p.mae, hit: n.hit - p.hit, brier: n.brier - p.brier } };
}

/**
 * 규칙 판정. 공통 분반이 없으면 `applicable:false` — 규칙을 적용하지 않고(통과로 두고)
 * 호출부가 경고만 남긴다. 판정 불가를 실패로 다루면 첫 학기처럼 비교 기준이 없는 상황에서
 * 파이프라인이 통째로 멈춘다.
 */
export function judgeAdoption(cmp, rule = ADOPTION_RULE) {
  if (!cmp || cmp.keys === 0 || !cmp.delta) return { applicable: false, pass: true, reasons: [] };
  const reasons = [];
  if (cmp.delta.mae > rule.maeWorsenMax) {
    reasons.push(
      `MAE 가 ${cmp.delta.mae >= 0 ? '+' : ''}${cmp.delta.mae.toFixed(3)}점 악화 — 허용치 +${rule.maeWorsenMax} 초과 ` +
        `(이전 ${cmp.prev.mae.toFixed(3)} → 새 ${cmp.next.mae.toFixed(3)})`,
    );
  }
  if (cmp.delta.hit < -rule.hitDropMaxPct) {
    reasons.push(
      `Hit±3 가 ${cmp.delta.hit.toFixed(1)}%p 하락 — 허용치 −${rule.hitDropMaxPct}%p 초과 ` +
        `(이전 ${cmp.prev.hit.toFixed(1)}% → 새 ${cmp.next.hit.toFixed(1)}%)`,
    );
  }
  return { applicable: true, pass: reasons.length === 0, reasons };
}

/**
 * 화면 폭 — 한글·한중일 문자는 두 칸을 차지하는데 `padEnd`/`padStart` 는 한 자로 센다.
 * 표가 어긋나면 사람이 표를 안 본다(이 표를 보고 채택을 판단한다).
 */
const width = (s) => [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣＀-｠]/.test(ch) ? 2 : 1), 0);
const padL = (s, w) => ' '.repeat(Math.max(0, w - width(s))) + s;
const padR = (s, w) => s + ' '.repeat(Math.max(0, w - width(s)));

/**
 * 사람이 보는 비교표. 들여쓴 줄 배열을 돌려준다(오케스트레이터 출력과 PR 본문이 같은 표를 쓴다).
 */
export function formatComparison(cmp) {
  const lines = [`  공통 분반 ${cmp.keys}개 (이전 ${cmp.prevTotal} · 새 ${cmp.newTotal})`];
  if (!cmp.delta) {
    lines.push('    (공통 분반이 없어 비교표를 만들 수 없다.)');
    return lines;
  }
  const num = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const row = (label, s, suffix) =>
    `    ${padR(label, 9)}${padL(num(s.mae, 2), 8)}${padL(num(s.hit, 1) + `%${suffix}`, 9)}${padL(num(s.brier, 4), 10)}`;
  lines.push(`    ${padR('구분', 9)}${padL('MAE', 8)}${padL('Hit±3', 9)}${padL('Brier', 10)}`);
  lines.push(row('이전 DB', cmp.prev, ''));
  lines.push(row('새 DB', cmp.next, ''));
  lines.push(row('차이', cmp.delta, 'p'));
  lines.push('    (MAE·Brier 는 낮을수록, Hit±3 은 높을수록 좋다.)');
  return lines;
}

/** 규칙 자체를 한 줄로 — 배너·PR 본문에서 임계를 눈으로 확인할 수 있게 한다. */
export function ruleLine(rule = ADOPTION_RULE) {
  return `채택 규칙: MAE 악화 ≤ ${rule.maeWorsenMax.toFixed(2)}점 · Hit±3 하락 ≤ ${rule.hitDropMaxPct.toFixed(1)}%p`;
}
