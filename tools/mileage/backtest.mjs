/**
 * 마일리지 예측 백테스트 (개발 전용)
 *
 *   node --experimental-strip-types tools/mileage/backtest.mjs <mileage_history.db> [target=2026-10]
 *
 * 목표 학기의 실제 컷을 정답으로 두고, 그 이전 학기까지만 써서 예측한 뒤 오차를 잰다.
 * "최신 컷을 얼마나 중시할지"(반감기) 같은 모수를 감이 아니라 수치로 고르기 위한 자.
 *
 * 지표
 *   MAE      평균절대오차(마일리지 점수)
 *   Median   중앙값 오차 — 소수의 대형 오차에 휘둘리지 않는다
 *   Hit±3    오차 3점 이내 비율
 *   Brier    확률 예측의 정확도(낮을수록 좋음). 실제 합격/불합격을 맞혔는지까지 본다
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 과거 담당 교수 보강표 — precompute 와 동일 자료 */
function loadProfessorHistory() {
  const p = join(dirname(fileURLToPath(import.meta.url)), 'professor-history.csv');
  const m = new Map();
  if (!existsSync(p) || process.env.NO_PROF_HISTORY) return m;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('year,')) continue;
    const [y, s, c, d, prof] = t.split(',').map(x => x.trim());
    if (!y || !c || !d || !prof) continue;
    m.set(`${c}|${d.padStart(2,'0')}|${y}|${s}`, prof);
  }
  return m;
}
const profHistory = loadProfessorHistory();
const ONLY = process.env.ONLY_COURSE || null;

const dbPath = process.argv[2];
const target = process.argv[3] ?? '2026-10';
if (!dbPath) {
  console.error('사용법: node --experimental-strip-types tools/mileage/backtest.mjs <db> [2026-10]');
  process.exit(1);
}
const [TY, TS] = target.split('-');
const db = new DatabaseSync(dbPath);
// 튜닝 모수 스윕용 — 환경변수로 덮어쓴다
const TUNING = {};
if (process.env.HALF_LIFE) TUNING.halfLife = Number(process.env.HALF_LIFE);
if (process.env.TAU_SECTION) TUNING.tauSection = Number(process.env.TAU_SECTION);

const { predictAll, admitProbability } = await import('../../src/lib/mileage/predict.ts');

// ── 실제 컷(정답) — 합격자 중 최저 배점 ──────────────────────────
const cutRows = db
  .prepare(
    `SELECT course_code, division, year, semester,
            MIN(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='') THEN mileage END) AS cut
       FROM mileage_bids GROUP BY course_code, division, year, semester`,
  )
  .all();
const cutMap = new Map(cutRows.map((r) => [`${r.course_code}|${r.division}|${r.year}|${r.semester}`, r.cut]));

const summary = db
  .prepare(`SELECT course_code, division, year, semester, min_mileage, max_allowed FROM mileage_summary`)
  .all();

/** 학기 순서 비교 — "2025-20" < "2026-10" */
const ord = (y, s) => Number(y) * 10 + (s === '10' ? 0 : 1);
const targetOrd = ord(TY, TS);

// ── 학습용 이력(목표 학기 이전만) ───────────────────────────────
const histBySection = new Map();
for (const s of summary) {
  if (ord(s.year, s.semester) >= targetOrd) continue; // 미래 정보 차단
  const cut = cutMap.get(`${s.course_code}|${s.division}|${s.year}|${s.semester}`) ?? s.min_mileage;
  if (cut === null || cut === undefined) continue;
  const k = `${s.course_code}|${s.division}`;
  if (!histBySection.has(k)) histBySection.set(k, []);
  histBySection.get(k).push({
    year: s.year,
    semester: s.semester,
    cutoff: Number(cut),
    capacity: null,
    applicants: null,
    professor: profHistory.get(`${s.course_code}|${s.division}|${s.year}|${s.semester}`),
  });
}

// ── 평가 대상: 목표 학기에 실제로 컷이 존재하는 분반 ────────────
const courses = db.prepare(`SELECT course_code, division, title, credits, professor, dept FROM courses`).all();
const metaByKey = new Map(courses.map((c) => [`${c.course_code}|${c.division}`, c]));

const evalSet = [];
for (const s of summary) {
  if (s.year !== TY || s.semester !== TS) continue;
  const truth = cutMap.get(`${s.course_code}|${s.division}|${TY}|${TS}`);
  if (truth === null || truth === undefined) continue;
  if (ONLY && s.course_code !== ONLY) continue;
  evalSet.push({ code: s.course_code, division: s.division, truth: Number(truth) });
}

// predictAll 에 넘길 sections — 평가 대상 + 계층 통계용 메타
const sections = evalSet.map((e) => {
  const m = metaByKey.get(`${e.code}|${e.division}`) ?? {};
  return {
    code: e.code,
    division: e.division,
    name: m.title ?? '',
    professor: (m.professor ?? '').trim(),
    credits: Number(m.credits ?? 3),
    deptCode: m.dept ?? '',
    deptName: '',
    classification: '',
    grade: '',
    timeText: '',
    capacity: null,
  };
});

const histories = [];
for (const [k, pts] of histBySection) {
  const [code, division] = k.split('|');
  const m = metaByKey.get(k);
  histories.push({ code, division, professor: (m?.professor ?? '').trim(), points: pts });
}

const preds = predictAll({ sections, histories, target: { year: TY, semester: TS }, tuning: TUNING });
const predByKey = new Map(preds.map((p) => [`${p.code}|${p.division}`, p]));

// ── 지표 계산 ───────────────────────────────────────────────────
const errs = [];
let brier = 0;
let brierN = 0;
const byBasis = {};

for (const e of evalSet) {
  const p = predByKey.get(`${e.code}|${e.division}`);
  if (!p) continue;
  const err = Math.abs(p.mu - e.truth);
  errs.push(err);
  byBasis[p.basis] ??= [];
  byBasis[p.basis].push(err);

  // 확률 보정: 실제 컷보다 높게 걸었으면 합격이어야 한다.
  // 컷 근처 ±상한 범위에서 여러 배점을 시험해 Brier score 를 낸다.
  const cap = p.maxMileage;
  for (let m = 1; m <= cap; m += Math.max(1, Math.round(cap / 12))) {
    const prob = admitProbability(p, m, 0);
    const actual = m >= e.truth ? 1 : 0;
    brier += (prob - actual) ** 2;
    brierN++;
  }
}

errs.sort((a, b) => a - b);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : NaN);
const hit = (a, t) => (a.filter((x) => x <= t).length / a.length) * 100;

console.log(`\n대상 학기: ${TY}-${TS === '10' ? '1학기' : '2학기'}`);
console.log(`평가 분반: ${errs.length}개 (학습에 쓴 이력: ${histories.length}개 분반)\n`);
console.log(`  MAE       ${mean(errs).toFixed(2)} mp`);
console.log(`  중앙값     ${med(errs).toFixed(2)} mp`);
console.log(`  Hit ±1    ${hit(errs, 1).toFixed(1)} %`);
console.log(`  Hit ±3    ${hit(errs, 3).toFixed(1)} %`);
console.log(`  Hit ±5    ${hit(errs, 5).toFixed(1)} %`);
console.log(`  Brier     ${(brier / brierN).toFixed(4)}  (낮을수록 좋음)`);
console.log(`\n  추정 근거별 MAE:`);
for (const [b, arr] of Object.entries(byBasis).sort((a, c) => c[1].length - a[1].length)) {
  console.log(`    ${b.padEnd(10)} n=${String(arr.length).padStart(4)}  MAE ${mean(arr).toFixed(2)}`);
}
