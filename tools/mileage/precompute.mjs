/**
 * 마일리지 예측 번들 생성기 (개발 전용 · 학기마다 1회 실행)
 *
 *   node tools/mileage/precompute.mjs <mileage_history.db> [출력경로]
 *
 * 하는 일
 *   ① SQLite 이력에서 **진짜 컷**을 계산한다 — 합격자(success='Y') 중 최저 배점.
 *      mileage_summary.min_mileage 는 미달 학기에 전체 최저값이라 컷과 다르다.
 *   ② 이번 학기 개설 전 분반(교양·타전공 포함, 하나도 빠짐없이)에 대해
 *      계층적 경험 베이즈 축소 추정으로 컷 분포(μ, σ)를 적합한다.
 *   ③ 동점자 규칙의 학년 우대를 실측해 gradeShift 로 환산한다.
 *   ④ 런타임이 쓰는 압축 JSON 번들을 public/data/ 에 쓴다.
 *
 * ⚠️ 예측 모델은 우리 자체 설계다(src/lib/mileage/predict.ts). 참조 프로젝트의 학습된
 *    산출물(precomputed_curves.json)은 쓰지 않는다. 원자료(이력 DB)만 활용한다.
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.argv[2];
const outPath = process.argv[3] ?? 'public/data/mileage-2026-20.json';
if (!dbPath) {
  console.error('사용법: node tools/mileage/precompute.mjs <mileage_history.db> [출력경로]');
  process.exit(1);
}

/** 예측 대상 학기 */
const TARGET_YEAR = '2026';
const TARGET_SEM = '20';

const db = new DatabaseSync(dbPath);

// ── ① 진짜 컷 계산 ─────────────────────────────────────────────
// 합격자 중 최저 배점. 합격 표기가 없는 학기는 summary 로 폴백한다.
const cutRows = db
  .prepare(
    `SELECT course_code, division, year, semester,
            MIN(CASE WHEN success='Y' THEN mileage END) AS cut,
            COUNT(*) AS bids
       FROM mileage_bids
      GROUP BY course_code, division, year, semester`,
  )
  .all();

const summaryRows = db
  .prepare(
    `SELECT course_code, division, year, semester, capacity, applicants,
            min_mileage, max_allowed
       FROM mileage_summary`,
  )
  .all();

const sumKey = (r) => `${r.course_code}|${r.division}|${r.year}|${r.semester}`;
const summaryMap = new Map(summaryRows.map((r) => [sumKey(r), r]));
const cutMap = new Map(cutRows.map((r) => [sumKey(r), r]));

/** 분반별 최대 배점 상한(가장 최근 값) */
const maxAllowed = new Map();
for (const r of summaryRows) {
  const k = `${r.course_code}|${r.division}`;
  const prev = maxAllowed.get(k);
  if (!prev || `${r.year}${r.semester}` > prev.stamp) {
    maxAllowed.set(k, { stamp: `${r.year}${r.semester}`, value: r.max_allowed ?? 36 });
  }
}

// 이력 포인트 조립 — 대상 학기 자신은 제외(미래를 미리 보지 않는다)
const histBySection = new Map();
for (const [k, s] of summaryMap) {
  const [code, division, year, semester] = k.split('|');
  if (year === TARGET_YEAR && semester === TARGET_SEM) continue;
  const c = cutMap.get(k);
  // 컷: 합격자 최저 → 없으면 summary.min_mileage → 그래도 없으면 스킵
  const cutoff = c?.cut ?? s.min_mileage;
  if (cutoff === null || cutoff === undefined) continue;
  const sk = `${code}|${division}`;
  if (!histBySection.has(sk)) histBySection.set(sk, []);
  histBySection.get(sk).push({
    year,
    semester,
    cutoff: Number(cutoff),
    capacity: s.capacity ?? null,
    applicants: s.applicants ?? null,
  });
}

// ── ③ 학년 우대 실측 ───────────────────────────────────────────
// 동점(배점 = 컷) 상황에서 학년별 합격률을 본다. 상위 학년이 유리하면 비율이 높다.
const tieRows = db
  .prepare(
    `SELECT b.grade AS grade,
            SUM(CASE WHEN b.success='Y' THEN 1 ELSE 0 END) AS win,
            COUNT(*) AS total
       FROM mileage_bids b
       JOIN (SELECT course_code, division, year, semester,
                    MIN(CASE WHEN success='Y' THEN mileage END) AS cut
               FROM mileage_bids GROUP BY course_code, division, year, semester) t
         ON t.course_code=b.course_code AND t.division=b.division
        AND t.year=b.year AND t.semester=b.semester
      WHERE t.cut IS NOT NULL AND b.mileage = t.cut AND b.grade IN ('1','2','3','4')
      GROUP BY b.grade`,
  )
  .all();

const tieRate = {};
const tieN = {};
for (const r of tieRows) {
  tieRate[r.grade] = r.total > 0 ? r.win / r.total : 0.5;
  tieN[r.grade] = r.total;
}

/**
 * 학년 보정은 **근거가 충족될 때만** 적용한다.
 *
 * 실측(2023-2~2026-1): 1학년 표본은 69건뿐이고 전원 합격이었다 — 1학년 정원이 0인 과목이
 * 많아 "1학년이 컷에서 경쟁하는 상황" 자체가 특수한 표본이라 생기는 선택 편향이다.
 * 2·3·4학년은 73.5% / 72.5% / 72.1% 로 사실상 동일하고, 오히려 학년이 오를수록 미세하게
 * 낮아 "상위 학년 우선"과 반대 방향이다. 즉 컷 지점의 승패는 학년이 아니라 다른 동점 기준
 * (신청학점·졸업예정·재학학기 등)이 지배한다.
 *
 * 따라서 표본이 충분하고(≥500) 효과가 규칙과 같은 방향(학년↑ → 합격률↑)일 때만 보정하고,
 * 아니면 0으로 둔다. 편향된 수치로 보정하는 것은 보정하지 않는 것만 못하다.
 */
const MIN_TIE_SAMPLE = 500;
const grades = ['1', '2', '3', '4'];
const usable = grades.filter((g) => (tieN[g] ?? 0) >= MIN_TIE_SAMPLE);
const monotonic =
  usable.length >= 3 &&
  usable.every((g, i) => i === 0 || tieRate[g] >= tieRate[usable[i - 1]] - 1e-9);

const gradeShift = {};
let shiftNote;
if (monotonic) {
  const rs = usable.map((g) => tieRate[g]);
  const avgRate = rs.reduce((a, b) => a + b, 0) / rs.length;
  for (const g of grades) {
    const r = tieRate[g];
    gradeShift[g] =
      r === undefined || (tieN[g] ?? 0) < MIN_TIE_SAMPLE
        ? 0
        : Math.round(Math.max(-1.5, Math.min(1.5, (r - avgRate) * 3)) * 10) / 10;
  }
  shiftNote = '실측 학년 효과 적용';
} else {
  for (const g of grades) gradeShift[g] = 0;
  shiftNote = '학년 효과 미식별(표본 편향/비단조) → 보정 없음';
}

// ── ② 이번 학기 개설 분반 전체 ─────────────────────────────────
const courses = db
  .prepare(
    `SELECT course_code, division, title, credits, grade, classification,
            professor, time_slot, college, dept
       FROM courses`,
  )
  .all();

const deptNames = new Map(
  db.prepare('SELECT code, name FROM departments').all().map((r) => [r.code, r.name]),
);

const sections = courses.map((c) => ({
  code: c.course_code,
  division: c.division,
  name: c.title ?? '',
  professor: (c.professor ?? '').trim(),
  credits: Number(c.credits ?? 3),
  deptCode: c.dept ?? '',
  deptName: deptNames.get(c.dept) ?? c.dept ?? '',
  classification: c.classification ?? '',
  grade: c.grade ?? '',
  timeText: c.time_slot ?? '',
  capacity: null,
}));

const histories = [];
for (const s of sections) {
  const pts = histBySection.get(`${s.code}|${s.division}`);
  if (pts && pts.length) {
    histories.push({ code: s.code, division: s.division, professor: s.professor, points: pts });
  }
}
// 이력에만 있고 이번 학기엔 없는 분반도 계층 통계에 기여시킨다(과목/교수 단위 표본 확보)
const seen = new Set(histories.map((h) => `${h.code}|${h.division}`));
const profByKey = new Map(courses.map((c) => [`${c.course_code}|${c.division}`, (c.professor ?? '').trim()]));
for (const [sk, pts] of histBySection) {
  if (seen.has(sk)) continue;
  const [code, division] = sk.split('|');
  histories.push({ code, division, professor: profByKey.get(sk) ?? '', points: pts });
}

// ── 예측 적합 (엔진 재사용) ────────────────────────────────────
const { predictAll } = await import('../../src/lib/mileage/predict.ts');
const predictions = predictAll({ sections, histories, latestYear: 2026 });

// 분반별 상한 반영
for (const p of predictions) {
  const m = maxAllowed.get(`${p.code}|${p.division}`);
  if (m && Number.isFinite(m.value) && m.value > 0) p.maxMileage = Math.round(m.value);
}

// ── ④ 압축 번들 출력 ──────────────────────────────────────────
// 키를 짧게 쓰고 배열로 눕혀 용량을 줄인다(3천여 분반).
const bundle = {
  v: 1,
  meta: {
    year: TARGET_YEAR,
    semester: TARGET_SEM,
    generatedAt: new Date().toISOString(),
    model: 'hierarchical-empirical-bayes-1.0',
    gradeShift,
  },
  // [code, division, name, professor, credits, deptName, classification, grade, timeText, mu, sigma, basis, samples, maxMileage]
  rows: sections.map((s, i) => {
    const p = predictions[i];
    return [
      s.code, s.division, s.name, s.professor, s.credits, s.deptName,
      s.classification, s.grade, s.timeText,
      p.mu, p.sigma, p.basis, p.samples, p.maxMileage,
    ];
  }),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(bundle));

// ── 리포트 ────────────────────────────────────────────────────
const byBasis = {};
for (const p of predictions) byBasis[p.basis] = (byBasis[p.basis] ?? 0) + 1;
const size = (JSON.stringify(bundle).length / 1024).toFixed(0);
console.log(`✔ ${outPath}  (${size} KB)`);
console.log(`  분반 ${sections.length}개 · 이력 보유 ${histories.length}개`);
console.log(`  추정 근거:`, byBasis);
console.log(
  `  학년 동점 합격률:`,
  Object.fromEntries(grades.map((g) => [g, `${((tieRate[g] ?? 0) * 100).toFixed(1)}% (n=${tieN[g] ?? 0})`])),
);
console.log(`  gradeShift:`, gradeShift, `— ${shiftNote}`);
