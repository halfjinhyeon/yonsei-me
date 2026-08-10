/**
 * 마일리지 예측 번들 생성기 (개발 전용 · 학기마다 1회 실행)
 *
 *   node tools/mileage/precompute.mjs [--target 2026-20] [--db <경로>] [--out <경로>]
 *
 *   · `--db` 생략 시 tools/mileage/data/mileage-history.db (없으면 `.db.gz` 를 자동 해제).
 *     DB 는 tools/mileage/build-db.mjs 가 크롤 JSON 에서 만든다.
 *   · `--out` 생략 시 public/data/mileage-<년>-<학기>.json (+ `-detail.json`).
 *   · 위치 인자 `<db> [출력경로]` 도 예전처럼 받는다.
 *   · 학기를 바꿀 때는 아래 RECENCY_ALIAS 와 src/lib/mileage/bundle.ts 의 MILEAGE_TERM 을
 *     함께 손봐야 한다 — 자세한 절차는 tools/mileage/README.md.
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
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath } from './db-util.mjs';

/**
 * 과거 학기 담당 교수 보강표(tools/mileage/professor-history.csv).
 *
 * 크롤링 원본에는 현재 학기 교수만 있어, 분반-교수 교체가 잦은 과목은 분반 번호로 이력을
 * 묶으면 서로 다른 교수의 컷이 섞인다. 이 표가 있는 (과목·분반·학기)는 실제 교수를 붙여
 * 교수 기준으로 재배치한다. 표에 없으면 기존대로 분반 계보를 따른다.
 */
function loadProfessorHistory() {
  const p = join(dirname(fileURLToPath(import.meta.url)), 'professor-history.csv');
  const map = new Map(); // "code|division|year|semester" -> professor
  if (!existsSync(p)) return map;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('year,')) continue;
    const [year, semester, code, division, professor] = t.split(',').map((x) => x.trim());
    if (!year || !code || !division || !professor) continue;
    map.set(`${code}|${division.padStart(2, '0')}|${year}|${semester}`, professor);
  }
  return map;
}
const profHistory = loadProfessorHistory();

// ── 인자 ───────────────────────────────────────────────────────
// 학기·경로를 상수로 박아 두면 다음 학기에 "어디를 고쳐야 하는지" 를 다시 찾아야 한다.
// 기본값은 현재 배포 학기(2026-2)라 인자 없이 돌려도 지금과 같은 결과가 나온다.
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
if (flags.help !== undefined) {
  console.error('사용법: node tools/mileage/precompute.mjs [--target 2026-20] [--db <경로>] [--out <경로>]');
  process.exit(0);
}

/** 예측 대상 학기 — "YYYY-SS"(10=1학기 · 20=2학기 · 11=여름 · 21=겨울) */
const [TARGET_YEAR, TARGET_SEM] = (flags.target ?? '2026-20').split('-');
if (!/^\d{4}$/.test(TARGET_YEAR ?? '') || !/^\d{2}$/.test(TARGET_SEM ?? '')) {
  console.error(`--target 형식이 잘못됐다: ${flags.target} (예: 2026-20)`);
  process.exit(1);
}

const dbPath = resolveDbPath(flags.db ?? positional[0]);
const outPath = flags.out ?? positional[1] ?? `public/data/mileage-${TARGET_YEAR}-${TARGET_SEM}.json`;

/**
 * 라인업 일치 학기 오버라이드 — {과목코드: {'년-학기': 부여할 학기 서수}}.
 *
 * 🔁 **학기 갱신 시 재검토 항목** — 특정 학기의 교수 구성에만 유효한 수동 보정이다.
 *    `--target` 을 바꿨다면 이 표를 먼저 다시 확인하라(아래 ⚠️ 참고).
 *
 * 컷은 형제 분반 라인업(교수 구성)의 함수인데 최신성 가중은 시간만 본다. 대상 학기의
 * 라인업이 직전 학기가 아니라 더 과거 학기와 일치하면, 그 학기 관측에 대상 학기 서수를
 * 부여해 "최신 학기처럼" 취급한다(HistoryPoint.recencyOrd → predict.ts recencyWeight).
 *
 * MEU3600 응용고체역학: 2026-2 라인업(전흥재+장용훈)은 2025-2(장용훈+이형석)가 아니라
 * 2024-2·2023-2와 동일하다(제보 + 형제분반 조사 보고서로 확인). 2024-2 관측(전흥재 컷2,
 * 장용훈 컷18=만점)에 최신 가중을 준다. 서수 계산은 predict.ts semesterOrdinal 과 동일:
 * 년×2 + (1학기·여름=0, 2학기·겨울=1) → 2026-2 = 4053.
 *
 * ⚠️ 학기가 바뀌면(TARGET 변경) 이 표의 유효성을 반드시 재검토할 것 — 라인업이 또
 * 바뀌면 이 항목은 삭제해야 한다. 백테스트는 이 파일을 거치지 않으므로 영향 없음.
 */
const RECENCY_ALIAS = {
  // 서수 계산은 predict.ts semesterOrdinal 과 같아야 한다(여름 11 은 1학기, 겨울 21 은 2학기 자리)
  MEU3600: { '2024-20': Number(TARGET_YEAR) * 2 + (TARGET_SEM === '10' || TARGET_SEM === '11' ? 0 : 1) },
};

const db = new DatabaseSync(dbPath);

// ── ① 진짜 컷 계산 ─────────────────────────────────────────────
//
// 합격자 중 최저 배점. 합격 표기가 없는 학기는 summary 로 폴백한다.
//
// ⚠️ **컷은 청중 그룹별로 따로 잡는다.** 전공자 자리와 비전공자 자리는 따로 배정되므로
//    둘을 섞은 "합격자 전체의 최저 배점"은 어느 쪽의 컷도 아니다.
//
//    실측 ① MEU3801-02(민경민) 2025-2 — 전공자는 31명이 만점 18 로 붙고 **또 다른 31명이
//         만점을 걸고도 떨어졌다**. 그런데 비전공자 1명이 9점에 붙어 전체 컷이 9 가 됐다.
//         전공자에게 "9점이면 된다"는 예측은 거짓이고, 진실은 "만점 18 + 동점전"이다.
//         MEU3600-02 2025-2 도 같은 형태다(전체 15 vs 전공 18).
//    실측 ② 반대 방향 — 교양·타과 과목에서는 비전공자 컷이 전체 컷보다 높다. 비전공자 컷이
//         전체 컷보다 2점 이상 높은 분반-학기가 801건이다. 이 사이트 사용자(기계공학부
//         학생)는 교양에서 **비전공자**이므로 그쪽이 통째로 과소평가돼 있었다.
//
// 규칙: 학정번호가 MEU 로 시작하면 전공자 컷(major LIKE 'Y%'), 그 밖에는 비전공자 컷.
// 그 그룹에 (별표 제외) 합격자가 하나도 없으면 기존대로 전체 컷으로 폴백한다 —
// 이때는 `grouped=0` 으로 표시해 동점 통계도 함께 전원 기준으로 돌린다(같은 모집단 유지).
//
// ⚠️ major 는 'Y(Y)'·'Y(N)'·'N(Y)'·'N(N)' 네 값으로, 앞 글자가 주전공 여부다(NULL 없음).
const GROUP_CUT = process.env.GROUP_CUT !== '0';
/** 이 과목의 청중 — 우리 사이트 사용자는 기계공학부 학생이다 */
const isMajorAudience = (code) => code.startsWith('MEU');

const cutRows = db
  .prepare(
    `SELECT course_code, division, year, semester,
            MIN(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='') THEN mileage END) AS cut,
            MIN(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='')
                      AND major LIKE 'Y%' THEN mileage END) AS cutMajor,
            MIN(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='')
                      AND (major IS NULL OR major NOT LIKE 'Y%') THEN mileage END) AS cutNon,
            COUNT(*) AS bids
       FROM mileage_bids
      GROUP BY course_code, division, year, semester`,
  )
  .all();

const summaryRows = db
  .prepare(
    `SELECT course_code, division, year, semester, capacity, applicants,
            min_mileage, avg_mileage, max_mileage, max_allowed, major_ratio, year_quotas
       FROM mileage_summary`,
  )
  .all();

const sumKey = (r) => `${r.course_code}|${r.division}|${r.year}|${r.semester}`;
const summaryMap = new Map(summaryRows.map((r) => [sumKey(r), r]));

/**
 * 분반·학기별 **유효 컷** — 청중 그룹 컷, 그 그룹에 합격자가 없으면 전체 컷으로 폴백.
 *
 * `grouped=1` 은 그룹으로 좁혀 잡은 값, `0` 은 폴백(전원 대상)이다. 아래의 동점 통계
 * (학년별 컷·tieWin·이수율 승부선·학년 우대 실측)는 전부 이 플래그를 따라가야 한다 —
 * 컷은 전공자 기준인데 승률은 전원 기준이면 화면이 서로 다른 모집단을 섞어 말하게 된다.
 */
const effCut = new Map();
let groupedCuts = 0;
let fallbackCuts = 0;
for (const r of cutRows) {
  const aud = isMajorAudience(r.course_code) ? 1 : 0;
  const g = aud ? r.cutMajor : r.cutNon;
  const ok = GROUP_CUT && g !== null && g !== undefined;
  if (ok) groupedCuts++;
  else fallbackCuts++;
  effCut.set(sumKey(r), { cut: ok ? Number(g) : (r.cut ?? null), aud, grouped: ok ? 1 : 0 });
}

/**
 * 유효 컷을 **임시 테이블**로 올려 원장 집계 질의가 조인만으로 그룹을 좁히게 한다.
 * TEMP 는 별도 임시 DB 에 만들어지므로 원본 파일(mileage_history.db)은 손대지 않는다.
 */
db.exec(
  `CREATE TEMP TABLE eff_cut (
     course_code TEXT, division TEXT, year TEXT, semester TEXT,
     aud INTEGER, cut REAL, grouped INTEGER,
     PRIMARY KEY (course_code, division, year, semester)
   )`,
);
{
  const ins = db.prepare('INSERT INTO eff_cut VALUES (?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for (const [k, v] of effCut) {
    const [c, d, y, sem] = k.split('|');
    ins.run(c, d, y, sem, v.aud, v.cut, v.grouped);
  }
  db.exec('COMMIT');
}
/** 원장 한 행이 그 분반·학기의 청중 그룹에 속하는가 — 폴백 학기(grouped=0)는 전원 포함 */
const IN_AUDIENCE = `(e.grouped = 0 OR (CASE WHEN b.major LIKE 'Y%' THEN 1 ELSE 0 END) = e.aud)`;

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
  // 컷: 청중 그룹 합격자 최저(없으면 전체) → 그래도 없으면 summary.min_mileage → 없으면 스킵
  const cutoff = effCut.get(k)?.cut ?? s.min_mileage;
  if (cutoff === null || cutoff === undefined) continue;
  const sk = `${code}|${division}`;
  if (!histBySection.has(sk)) histBySection.set(sk, []);
  histBySection.get(sk).push({
    year,
    semester,
    cutoff: Number(cutoff),
    capacity: s.capacity ?? null,
    applicants: s.applicants ?? null,
    // 그 학기의 실제 담당 교수(알 수 있는 과목만) — 이력을 교수 기준으로 재배치하는 근거
    professor: profHistory.get(`${code}|${division}|${year}|${semester}`),
    // 그 관측이 나온 분반. 교수가 분반을 옮기면 아래에서 이력이 재배치되므로, 관측 자신이
    // 어느 분반의 것이었는지를 들고 있어야 그 학기의 통계(동점 승률 등)를 되찾을 수 있다.
    division,
    // 라인업 일치 학기 오버라이드(RECENCY_ALIAS) — 해당하면 최신 학기 가중치를 준다
    recencyOrd: RECENCY_ALIAS[code]?.[`${year}-${semester}`],
  });
}

/** 분반의 가장 최근 학기(대상 학기 제외) */
const latestOf = (k) => {
  let best = null;
  for (const p of histBySection.get(k) ?? []) {
    const o = Number(p.year) * 2 + (p.semester === '10' ? 0 : 1);
    if (!best || o > best.o) best = { o, year: p.year, semester: p.semester };
  }
  return best;
};

/** 이력 포인트들 중 가장 최근 것 */
const latestPoint = (pts) => {
  let best = null;
  let bo = -Infinity;
  for (const p of pts ?? []) {
    const o = Number(p.year) * 2 + (p.semester === '10' ? 0 : 1);
    if (o > bo) {
      bo = o;
      best = p;
    }
  }
  return best;
};

/**
 * 학년별 컷·신청·합격 — 상세 화면(학년별 컷)과 예측 모델(동점 승률) 양쪽이 쓴다.
 * 두 곳에서 따로 긁지 않도록 여기서 한 번만 만든다.
 *
 * ⚠️ 컷과 같은 청중 그룹으로 좁힌다(eff_cut 조인). 전공자 컷을 쓰면서 "3학년 40명 지원
 *    30명 합격"에 비전공 지원자를 섞으면 화면의 두 숫자가 서로 다른 모집단을 말한다.
 */
const gradeCutRows = db
  .prepare(
    `SELECT b.course_code, b.division, b.year, b.semester, b.grade,
            MIN(CASE WHEN b.success='Y' AND (b.remark IS NULL OR TRIM(b.remark)='')
                     THEN b.mileage END) AS cut,
            COUNT(*) AS applied,
            SUM(CASE WHEN b.success='Y' THEN 1 ELSE 0 END) AS won
       FROM mileage_bids b
       JOIN eff_cut e
         ON e.course_code=b.course_code AND e.division=b.division
        AND e.year=b.year AND e.semester=b.semester
      WHERE b.grade IN ('1','2','3','4') AND ${IN_AUDIENCE}
      GROUP BY b.course_code, b.division, b.year, b.semester, b.grade`,
  )
  .all();

const gradeCutIdx = new Map();
/** (분반·학기) → 합격/신청 = 만점 동점 시 승률의 대용치 */
const tieWinIdx = new Map();
const tieAcc = new Map();
for (const r of gradeCutRows) {
  gradeCutIdx.set(`${r.course_code}|${r.division}|${r.year}|${r.semester}|${r.grade}`, r);
  const k = `${r.course_code}|${r.division}|${r.year}|${r.semester}`;
  const a = tieAcc.get(k) ?? { won: 0, applied: 0 };
  a.won += r.won ?? 0;
  a.applied += r.applied ?? 0;
  tieAcc.set(k, a);
}
for (const [k, a] of tieAcc) if (a.applied > 0) tieWinIdx.set(k, a.won / a.applied);

/**
 * **동점 통계의 근거 학기** — 라인업 일치 오버라이드(RECENCY_ALIAS)를 원장 조회에도 적용한다.
 *
 * μ 는 `recencyOrd` 로 별칭 학기를 "최신처럼" 보는데, 동점 통계(승부선 winMin·학년별 실적·
 * 만점 동점 승률 tieWin)만 진짜 최신 학기를 보면 화면과 예측이 서로 다른 학기를 말하게 된다.
 * MEU3600-02(장용훈)가 그 예다 — 2025-2 원장은 그 자리에 다른 교수가 있어 동점자가 1명뿐이라
 * 승부선이 형성되지 않지만(winMin=0), 라인업이 같은 2024-2 는 만점 동점자 96명이 이수율로
 * 갈렸다(winMin=0.7). 학생에게 필요한 것은 후자다.
 *
 * 별칭 학기를 쓰는 조건은 **그 학기에 이 분반의 근거 이력(교수 소유로 재구성된 pts)이 있고,
 * 그 분반·학기의 입찰 원장까지 실제로 있을 때**뿐이다. 하나라도 없으면 null 을 돌려 기존
 * 동작(최신 학기)을 그대로 둔다. 별칭이 여러 개면 그중 가장 최근 학기를 고른다.
 */
function aliasTieBasis(code, pts) {
  const alias = RECENCY_ALIAS[code];
  if (!alias) return null;
  let best = null;
  for (const key of Object.keys(alias)) {
    const [year, semester] = key.split('-');
    for (const p of pts ?? []) {
      if (p.year !== year || p.semester !== semester) continue;
      // 원장(입찰 기록)이 없는 학기는 어차피 집계가 비므로 쓰지 않는다
      if (!tieWinIdx.has(`${code}|${p.division}|${year}|${semester}`)) continue;
      const o = Number(year) * 2 + (semester === '10' ? 0 : 1);
      if (!best || o > best.o) best = { o, year, semester, division: p.division };
    }
  }
  return best;
}

// ── ③ 학년 우대 실측 ───────────────────────────────────────────
// 동점(배점 = 컷) 상황에서 학년별 합격률을 본다. 상위 학년이 유리하면 비율이 높다.
// 컷도 동점자 집합도 청중 그룹 기준이다(eff_cut 조인) — 위 gradeCutRows 와 같은 이유.
const tieRows = db
  .prepare(
    `SELECT b.grade AS grade,
            SUM(CASE WHEN b.success='Y' THEN 1 ELSE 0 END) AS win,
            COUNT(*) AS total
       FROM mileage_bids b
       JOIN eff_cut e
         ON e.course_code=b.course_code AND e.division=b.division
        AND e.year=b.year AND e.semester=b.semester
      WHERE e.cut IS NOT NULL AND b.mileage = e.cut AND b.grade IN ('1','2','3','4')
        AND ${IN_AUDIENCE}
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
            professor, time_slot, room, college, dept
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
  // 강의실 원문("공D402", 복수 시간대면 "공D604/동영상" 처럼 슬래시로 이어진다).
  // 미니 시간표 칸이 교수와 함께 보여 준다.
  room: (c.room ?? '').trim(),
  capacity: null,
  // 이 과목의 **실제 만점**. 36 은 전교 상한일 뿐 과목마다 다르다(기계공학 전공 다수가 18).
  // 모델이 σ 상한과 확률 곡선의 정의역을 여기서 잡는다.
  maxAllowed: (() => {
    const m = maxAllowed.get(`${c.course_code}|${c.division}`);
    return m && Number.isFinite(m.value) && m.value > 0 ? Math.round(m.value) : 36;
  })(),
  // 만점 동점 승률 — 아래 이력 재구성에서 그 분반이 실제로 쓴 최신 학기 값으로 덮어쓴다.
  tieWin: null,
}));

/**
 * 담당 교수 자료가 있는 과목 — 이 과목들은 이력을 **교수 소유로 재구성**한다.
 *
 * 교수가 분반을 서로 맞바꾸는 과목(공학수학이 대표적)에서는 "분반 번호"가 흐름의 단위가
 * 아니다. 김재우 교수가 23-2 01분반 → 24-2 07분반 → 26-2 02분반으로 옮겼다면,
 * 02분반의 예측 근거는 "02분반의 과거 기록"(= 남의 것)이 아니라 "김재우 교수의 과거 기록"이다.
 * 모델에 특례를 넣어 우회하는 대신, 데이터 단계에서 소유권을 바로잡는다(사용자 지시).
 */
const coursesWithProfData = new Set();
for (const key of profHistory.keys()) coursesWithProfData.add(key.split('|')[0]);

/** 과목별 전체 이력 포인트(분반 무관) — 교수 소유 재구성의 원천 */
const pointsByCourse = new Map();
for (const [sk, pts] of histBySection) {
  const code = sk.split('|')[0];
  if (!pointsByCourse.has(code)) pointsByCourse.set(code, []);
  pointsByCourse.get(code).push(...pts);
}

const histories = [];
/** "code|division" → 그 분반이 실제로 근거로 삼는 이력 포인트(교수 소유 재구성 반영) */
const ownPoints = new Map();
let rekeyed = 0;
for (const s of sections) {
  let pts;
  if (coursesWithProfData.has(s.code) && s.professor) {
    // 이 교수가 이 과목에서 실제로 맡았던 학기 전부(어느 분반이든)
    const own = (pointsByCourse.get(s.code) ?? []).filter((p) => p.professor === s.professor);
    if (own.length) {
      pts = own;
      rekeyed++;
    } else {
      // 이 과목을 처음 맡는 교수 — 분반 기록은 남의 것이므로 쓰지 않는다.
      // 상위 계층(과목/학과)으로 자연히 폴백된다.
      pts = [];
    }
  } else {
    // 교수 자료가 없는 과목은 기존대로 분반 계보를 따른다(담당이 안정적이라 대부분 무해)
    pts = histBySection.get(`${s.code}|${s.division}`) ?? [];
  }
  ownPoints.set(`${s.code}|${s.division}`, pts);
  if (pts.length) {
    histories.push({ code: s.code, division: s.division, professor: s.professor, points: pts });
  }
  // 만점 동점 승률은 **이 분반이 실제로 근거로 삼는 이력**의 최신 학기에서 가져온다.
  // 교수가 분반을 옮겼다면 그때 그 교수가 있던 분반의 통계여야 한다(현재 분반 번호가 아니라).
  // 라인업 일치 오버라이드가 걸린 과목은 최신 학기 대신 그 별칭 학기를 본다(aliasTieBasis).
  const lp = aliasTieBasis(s.code, pts) ?? latestPoint(pts);
  if (lp) {
    s.tieWin = tieWinIdx.get(`${s.code}|${lp.division}|${lp.year}|${lp.semester}`) ?? null;
    if (s.tieWin !== null) s.tieWin = Math.round(s.tieWin * 1000) / 1000;
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

/**
 * 과거 학기 **분반 편성표** — 경쟁분반 보정(형제 라인업 판정)의 입력.
 *
 * 왜 histories 로는 안 되는가: 위에서 이력을 교수 소유로 재구성하면서, 올해 개설하지 않는
 * 교수의 분반은 어느 이력에도 실리지 않고 사라진다(예: MEU3600 2025-2 이형석). 형제 집합은
 * "그 학기에 열려 있던 전부"여야 하므로 재구성을 거치지 않은 원본을 따로 넘긴다.
 * 담당 교수는 보강표가 정본이고, 보강표에 **등재된 과목**의 미기재 학기는 현재 교수로 메우지
 * 않는다(그 과목은 교수가 분반을 옮긴다는 사실이 이미 확인된 과목이라 오귀속이 곧 가짜
 * 라인업 변화가 된다) — 미상('')으로 두면 흡인력 α=1 중립으로 처리된다.
 */
const observations = [];
for (const [k, s] of summaryMap) {
  const [code, division, year, semester] = k.split('|');
  if (year === TARGET_YEAR && semester === TARGET_SEM) continue;
  const csv = profHistory.get(`${code}|${division}|${year}|${semester}`);
  observations.push({
    code,
    division,
    year,
    semester,
    professor: csv ?? (coursesWithProfData.has(code) ? '' : (profByKey.get(`${code}|${division}`) ?? '')),
    capacity: s.capacity ?? null,
    applicants: s.applicants ?? null,
  });
}

// ── 예측 적합 (엔진 재사용) ────────────────────────────────────
const { predictAll, buildRivalModel, DEFAULT_TUNING, semesterOrdinal } = await import(
  '../../src/lib/mileage/predict.ts'
);
/** 각 분반이 μ 의 근거로 삼는 최신 관측 — 경쟁분반 진단에서 기준 학기로 쓴다 */
const basePoint = new Map();
for (const s of sections) {
  const lp = latestPoint(
    coursesWithProfData.has(s.code) && s.professor
      ? (pointsByCourse.get(s.code) ?? []).filter((p) => p.professor === s.professor)
      : (histBySection.get(`${s.code}|${s.division}`) ?? []),
  );
  if (lp) basePoint.set(`${s.code}|${s.division}`, lp);
}
const predictions = predictAll({
  sections,
  histories,
  observations,
  target: { year: TARGET_YEAR, semester: TARGET_SEM },
});

// (분반별 만점은 sections.maxAllowed 로 **모델에 미리** 넘겨 σ 상한까지 반영시킨다.
//  예전처럼 예측이 끝난 뒤 maxMileage 만 덮어쓰면 σ 는 36 기준으로 계산돼 곡선이 평평해졌다.)

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
  // [code, division, name, professor, credits, deptName, classification, grade, timeText,
  //  mu, sigma, basis, samples, maxMileage, piSat, tieWin, underEnrolled, lineupChanged, room]
  // ⚠️ 14번 이후는 **뒤에 덧붙인** 열이다 — 기존 파서(0…13 고정 인덱스)는 그대로 동작한다.
  rows: sections.map((s, i) => {
    const p = predictions[i];
    return [
      s.code, s.division, s.name, s.professor, s.credits, s.deptName,
      s.classification, s.grade, s.timeText,
      p.mu, p.sigma, p.basis, p.samples, p.maxMileage,
      p.piSat, p.tieWin, p.underEnrolled ? 1 : 0, p.lineupChanged ? 1 : 0,
      s.room,
    ];
  }),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(bundle));

// ── ⑤ 상세 데이터(지연 로딩용 별도 파일) ───────────────────────
// 기본 통계·정원&규정·과거 이력 세 가지를 담는다(사용자 지시 4). 초기 로딩을 무겁게 하지
// 않으려고 본 번들과 분리해, 사용자가 과목 상세를 처음 열 때만 받는다.
const detailPath = outPath.replace(/\.json$/, '-detail.json');

// 학년별 컷(gradeCutRows·gradeCutIdx)과 분반의 최신 학기(latestOf)는 예측 단계에서 이미
// 만들어 두었다(모델의 동점 승률 입력과 같은 자료를 써야 화면과 예측이 어긋나지 않는다).

/**
 * 동점(배점=컷)에서 갈린 총이수학점 비율 — 같은 학년 안에서 순위를 가르는 실질 기준.
 *
 * ⚠️ **분자가 0인 값(`0/126` 등)은 결측이지 "이수율 0%"가 아니다.** 원장 전체에서 14,581건이
 *    `0/126` 인데 그중 3학년이 8,292건·4학년이 5,018건이다 — 3·4학년이 이수학점 0 일 수 없다.
 *    학기당 6~10% 가 이 형태다. 이걸 실값으로 취급하면 MIN 이 0 으로 눌려 승부선이 0 이 되고,
 *    화면에는 "이수율 0%인 동점자도 합격 — 승부선 미형성"이라는 사실과 다른 안내가 뜬다.
 *    실제로 MEU3600-02 2025-2 동점 합격자는 100/135·103/140 처럼 대부분 100학점대인데
 *    섞여 있던 `0/130` 2건이 승부선을 0 으로 만들었다. 그래서 0/ 은 제외한다.
 *    (1학년 첫 학기는 진짜 0 일 수 있으나, 그 경우도 승부선으로는 쓸 수 없는 값이라 손실이 없다.)
 */
const tieCreditRows = db
  .prepare(
    `SELECT b.course_code, b.division, b.year, b.semester,
            MIN(CASE WHEN b.success='Y' THEN
                CAST(substr(b.earned_ratio,1,instr(b.earned_ratio,'/')-1) AS REAL)
              / NULLIF(CAST(substr(b.earned_ratio,instr(b.earned_ratio,'/')+1) AS REAL),0) END) AS winMin,
            MAX(CASE WHEN b.success<>'Y' THEN
                CAST(substr(b.earned_ratio,1,instr(b.earned_ratio,'/')-1) AS REAL)
              / NULLIF(CAST(substr(b.earned_ratio,instr(b.earned_ratio,'/')+1) AS REAL),0) END) AS loseMax
       FROM mileage_bids b
       JOIN eff_cut e
         ON e.course_code=b.course_code AND e.division=b.division
        AND e.year=b.year AND e.semester=b.semester
      WHERE e.cut IS NOT NULL AND b.mileage = e.cut
        AND b.earned_ratio LIKE '%/%'
        AND b.earned_ratio NOT LIKE '0/%'
        AND ${IN_AUDIENCE}
      GROUP BY b.course_code, b.division, b.year, b.semester`,
  )
  .all();

const tieCreditIdx = new Map(
  tieCreditRows.map((r) => [`${r.course_code}|${r.division}|${r.year}|${r.semester}`, r]),
);
const summaryByKey = new Map(summaryRows.map((r) => [sumKey(r), r]));

/**
 * 한 학기·한 분반의 **학년별 실적** — `{ 학년: [컷, 학년 정원, 신청, 합격] }`.
 *
 * 화면의 '과거 이력'을 보는 사람은 전 학년의 컷이 아니라 **자기 학년의 컷**을 알고 싶다.
 * 학년 정원이 걸린 과목은 학년마다 자리를 따로 채우므로 같은 분반이어도 컷이 크게 다르다
 * (아래 ②정원&규정의 perGrade 와 같은 자료를 학기별로 편 것이다).
 *
 * - 컷이 `null` = 그 학년 합격자 0명(전멸). 행을 지우지 않고 신청 수만 싣는다 —
 *   "그 학년은 한 명도 못 들었다"가 지원자에게 가장 중요한 정보다.
 * - 학년 정원이 `null` = 그 학기엔 학년별 배정이 없었다(전 학년이 같은 정원에서 경쟁).
 *   이때는 학년별 컷이 실질적 의미가 없으므로 **화면이 전체 컷을 대신 보여야 한다.**
 * - 신청·합격은 컷과 같은 청중 그룹(전공자/비전공자) 기준이다(`gradeCutIdx` 가 이미 좁혔다).
 */
function gradeSlices(code, division, year, semester, sum) {
  let quotas = null;
  try {
    quotas = sum?.year_quotas ? JSON.parse(sum.year_quotas) : null;
  } catch {
    quotas = null;
  }
  const out = {};
  for (const g of ['1', '2', '3', '4']) {
    const r = gradeCutIdx.get(`${code}|${division}|${year}|${semester}|${g}`);
    const seats = Number(quotas?.[g] ?? 0) || 0;
    const applied = r?.applied ?? 0;
    if (!applied && !seats) continue; // 자리도 없고 지원도 없던 학년은 실을 것이 없다
    out[g] = [r?.cut ?? null, seats || null, applied, r?.won ?? 0];
  }
  return Object.keys(out).length ? out : null;
}

const detail = {};
for (const s of sections) {
  const k = `${s.code}|${s.division}`;
  const pts = (histBySection.get(k) ?? [])
    .slice()
    .sort((a, b) => Number(b.year) * 2 + (b.semester === '10' ? 0 : 1) - (Number(a.year) * 2 + (a.semester === '10' ? 0 : 1)));
  /**
   * 기본 통계·학년별 실적·승부선의 근거 학기·분반 — rows 의 tieWin 과 **같은 근거**
   * (교수 소유 재구성 반영, ownPoints)를 쓴다.
   *
   * 교수가 분반을 옮겼으면 "이 분반 번호의 작년"은 다른 교수의 시장이다. 실례:
   * 유체역학 02분반(2026-2 김원정)의 작년 02분반은 이준상 담당에 미달(49/60·컷 1)이었고,
   * 김원정의 작년은 03분반 초과(87/60·컷 18)였다 — 분반 번호 계보를 보면 예측 컷 17과
   * "내 학년 작년 컷 1"이 한 화면에 같이 뜨는 모순이 난다. 교수 이력이 없는 분반
   * (재구성 미적용·처음 맡는 교수)은 기존대로 분반 번호 계보로 폴백한다.
   * 라인업 일치 오버라이드가 걸린 과목은 그 별칭 학기가 다시 우선한다(aliasTieBasis).
   */
  const own = latestPoint(ownPoints.get(k));
  const last = own ?? latestOf(k);
  const lastDiv = own ? own.division : s.division;
  const lastSum = last ? summaryByKey.get(`${s.code}|${lastDiv}|${last.year}|${last.semester}`) : null;
  const tb = aliasTieBasis(s.code, ownPoints.get(k));
  const tieAt = tb ?? last;
  const tieDiv = tb ? tb.division : lastDiv;

  // 학년별 컷(동점 통계 근거 학기 기준)
  //
  // ⚠️ 합격자가 0명인 학년(cut=null)도 **반드시 남긴다**. 그 학년이 전멸했다는 사실은
  //    지원자에게 가장 중요한 정보인데, 예전엔 cut 이 없다는 이유로 행째 지워져
  //    "표시할 게 없음"과 구분되지 않았다. 예: MEU3600-02(장용훈) 2024-2 는 2학년
  //    13명 전원 탈락 — 제보에서 "2학년은 못 들었다"고 지목된 바로 그 사례다.
  //    cut 은 null 로 두고(합격자가 없어 컷이 정의되지 않음) 지원·합격 수만 싣는다.
  const perGrade = {};
  if (tieAt) {
    for (const g of ['1', '2', '3', '4']) {
      const r = gradeCutIdx.get(`${s.code}|${tieDiv}|${tieAt.year}|${tieAt.semester}|${g}`);
      if (r && r.applied > 0) {
        perGrade[g] = { cut: r.cut ?? null, applied: r.applied, won: r.won ?? 0 };
      }
    }
  }
  const tc = tieAt ? tieCreditIdx.get(`${s.code}|${tieDiv}|${tieAt.year}|${tieAt.semester}`) : null;
  // 최신 학기와 같은 자리를 본 경우엔 표기를 붙이지 않는다(기존 파일과 바이트 동일)
  const tieBasis =
    tb && !(last && tb.year === last.year && tb.semester === last.semester && tieDiv === lastDiv)
      ? `${tb.year}-${tb.semester}`
      : undefined;

  let quotas = null;
  try {
    quotas = lastSum?.year_quotas ? JSON.parse(lastSum.year_quotas) : null;
    if (quotas && Object.values(quotas).every((v) => !v)) quotas = null; // 전부 0이면 학년 제한 없음
  } catch {
    quotas = null;
  }

  detail[`${s.code}-${s.division}`] = {
    // ① 기본 통계
    stats: lastSum
      ? {
          semester: `${last.year}-${last.semester}`,
          capacity: lastSum.capacity ?? null,
          applicants: lastSum.applicants ?? null,
          avg: lastSum.avg_mileage ?? null,
          max: lastSum.max_mileage ?? null,
        }
      : null,
    // ② 정원 & 규정
    rules: {
      maxAllowed: lastSum?.max_allowed ?? null,
      majorQuota: lastSum?.major_ratio ?? null,
      yearQuotas: quotas,
    },
    /**
     * **현재 담당 교수의 이 과목 이력** — 분반을 옮겼어도 전부 따라온다.
     *
     * 학생은 분반 번호가 아니라 "누가 가르치는가"를 보고 고르므로, 화면의 '과거 이력'은
     * 이것이 주(主)가 되어야 한다(사용자 지시). 예측 모델이 실제로 쓰는 자료와도 일치한다.
     * [학기, 그때의 분반, 컷, 정원, 신청자, 학년별 실적?]
     *
     * ⚠️ 6번째 칸(학년별 실적)은 **뒤에 덧붙인** 것이다 — 기존 파서(0…4 고정 구조분해)는
     *    그대로 동작한다. 학년별 자료가 하나도 없는 학기에는 아예 넣지 않는다(용량).
     */
    professorHistory: s.professor
      ? [...histBySection.entries()]
          .filter(([k]) => k.startsWith(`${s.code}|`))
          .flatMap(([k, ps]) => {
            const div = k.split('|')[1];
            return ps
              .filter((p) => p.professor && p.professor === s.professor)
              .map((p) => {
                const sm = summaryByKey.get(`${s.code}|${div}|${p.year}|${p.semester}`);
                const byGrade = gradeSlices(s.code, div, p.year, p.semester, sm);
                const row = [
                  `${p.year}-${p.semester}`,
                  div,
                  p.cutoff,
                  sm?.capacity ?? null,
                  sm?.applicants ?? null,
                ];
                if (byGrade) row.push(byGrade);
                return row;
              });
          })
          .sort((a, b) => b[0].localeCompare(a[0]))
      : [],
    // 학년별 컷 + 동점 시 총이수학점 비율 경계
    perGrade: Object.keys(perGrade).length ? perGrade : null,
    // 소수 4자리 — 원장의 이수율이 그 정밀도로 나오고(예: 0.2103), 승부선은 내 이수율과
    // 소수점에서 갈리는 일이 실제로 있어 3자리로 뭉개면 판정이 뒤집힐 수 있다.
    tieCredit: tc && tc.winMin !== null ? { winMin: +tc.winMin.toFixed(4), loseMax: tc.loseMax !== null ? +tc.loseMax.toFixed(4) : null } : null,
    /**
     * perGrade·tieCredit(그리고 본 번들 rows 의 tieWin)이 근거로 삼은 학기 "YYYY-SS".
     * 최신 학기를 그대로 쓴 보통의 분반에는 **없다** — 기존 파서와 하위호환을 지키려는 것이다.
     */
    tieBasis,
  };
}

writeFileSync(detailPath, JSON.stringify({ v: 1, detail }));

// ── 리포트 ────────────────────────────────────────────────────
const byBasis = {};
for (const p of predictions) byBasis[p.basis] = (byBasis[p.basis] ?? 0) + 1;
const size = (JSON.stringify(bundle).length / 1024).toFixed(0);
console.log(`✔ ${outPath}  (${size} KB)`);
console.log(`  분반 ${sections.length}개 · 이력 보유 ${histories.length}개`);
console.log(
  `  컷 정의: ${GROUP_CUT ? '청중 그룹별(MEU=전공자 · 그 밖=비전공자)' : '전체(그룹 미분리)'}` +
    ` — 그룹 컷 ${groupedCuts}개 · 전체 컷 폴백 ${fallbackCuts}개`,
);
console.log(`  교수 이력 보강: ${profHistory.size}건 · 교수 소유로 재구성한 분반 ${rekeyed}개`);
console.log(`  추정 근거:`, byBasis);
console.log(
  `  학년 동점 합격률:`,
  Object.fromEntries(grades.map((g) => [g, `${((tieRate[g] ?? 0) * 100).toFixed(1)}% (n=${tieN[g] ?? 0})`])),
);
console.log(`  gradeShift:`, gradeShift, `— ${shiftNote}`);

// ── ⑥ 경쟁분반(형제분반) 진단 ─────────────────────────────────
//
// μ 보정 자체는 백테스트가 기각해 꺼져 있다(src/lib/mileage/predict.ts 주석). 그래도 "형제
// 라인업이 바뀌었다"는 표시는 번들에 싣고, 아래에서 **보정을 켰다면 얼마였을지**를 근거와
// 함께 찍는다. 다음에 이 판단을 재검토할 사람이 숫자부터 볼 수 있게 하려는 것이다.
const changedCount = predictions.filter((p) => p.lineupChanged).length;
console.log(`  라인업 변화(형제 교수 집합이 직전과 다름): ${changedCount}개 분반`);

const DIAG = (process.env.DIAG_COURSE ?? 'MEU3600').split(',').filter(Boolean);
if (DIAG.length) {
  const targetOrd = semesterOrdinal(TARGET_YEAR, TARGET_SEM);
  const rival = buildRivalModel(sections, histories, observations, targetOrd, {
    ...DEFAULT_TUNING,
    rivalMode: 'share',
  });
  console.log(`\n  경쟁분반 진단 (보정을 켰다면 · β=${rival.beta.toFixed(4)}):`);
  for (const code of DIAG) {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.code !== code) continue;
      const lp = basePoint.get(`${s.code}|${s.division}`);
      const d = rival.evaluate(
        s,
        lp ? { year: lp.year, semester: lp.semester, division: lp.division } : null,
      );
      const p = predictions[i];
      console.log(
        `    ${code}-${s.division} ${s.professor}  μ=${p.mu} (보정 시 ${(p.mu + d.adjust).toFixed(1)}, Δ${d.adjust >= 0 ? '+' : ''}${d.adjust.toFixed(2)})`,
      );
      console.log(
        `      α=${d.alpha.toFixed(3)} · 기준학기 ${lp ? `${lp.year}-${lp.semester}(${lp.division}분반)` : '없음'}` +
          ` · 예상 신청자 ${d.expectedApplicants?.toFixed(1) ?? '-'} · 예상 경쟁률 ${d.expectedRatio?.toFixed(2) ?? '-'}` +
          ` (기준 ${d.baseRatio?.toFixed(2) ?? '-'})`,
      );
      console.log(
        `      형제 [${d.prevSiblings.join(', ') || '-'}] → [${d.targetSiblings.join(', ') || '-'}]  변화=${d.lineupChanged}`,
      );
    }
  }
}
