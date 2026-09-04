/**
 * 마일리지 예측 백테스트 (개발 전용)
 *
 *   node --experimental-strip-types tools/mileage/backtest.mjs [db] [target=2026-10]
 *
 *   db 를 생략하면 tools/mileage/data/mileage-history.db (없으면 `.db.gz` 자동 해제)를 쓴다.
 *   신·구 DB 비교처럼 특정 파일을 재려면 경로를 명시한다.
 *   `PROF_HISTORY=<csv>` 로 교수 보강표를 갈아 끼우고(자동 축적본 비교),
 *   `NO_PROF_HISTORY=1` 로 표 없이 잰다.
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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDbPath } from './db-util.mjs';

/**
 * 과거 담당 교수 보강표 — precompute 와 동일 자료·동일 파싱.
 *
 * `PROF_HISTORY=<csv>` 로 다른 표를 물리고(자동 축적본 비교), `NO_PROF_HISTORY` 로 끈다.
 * 교수 이름에 쉼표가 들어갈 수 있어(공동 담당) 앞 4칸만 끊고 나머지를 이름으로 본다.
 */
function loadProfessorHistory() {
  const p = process.env.PROF_HISTORY || join(dirname(fileURLToPath(import.meta.url)), 'professor-history.csv');
  const m = new Map();
  if (!existsSync(p) || process.env.NO_PROF_HISTORY) return m;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('year,')) continue;
    const cells = t.split(',');
    const [y, s, c, d] = cells.slice(0, 4).map(x => (x ?? '').trim());
    const prof = cells.slice(4).join(',').trim();
    if (!y || !c || !d || !prof) continue;
    m.set(`${c}|${d.padStart(2,'0')}|${y}|${s}`, prof);
  }
  return m;
}
const profHistory = loadProfessorHistory();
const ONLY = process.env.ONLY_COURSE || null;
const ONLY_PREFIX = process.env.ONLY_PREFIX || null;

// DB 경로 생략 시 기본 DB(gz 자동 해제) — precompute 와 같은 자료를 재게 하려는 것이다.
// 첫 인자가 "2026-10" 꼴이면 DB 를 생략하고 대상 학기만 준 것으로 본다.
const args = process.argv.slice(2);
const isTerm = (s) => /^\d{4}-\d{2}$/.test(s ?? '');
const dbPath = resolveDbPath(isTerm(args[0]) ? undefined : args[0]);
const target = (isTerm(args[0]) ? args[0] : args[1]) ?? '2026-10';
const [TY, TS] = target.split('-');
const db = new DatabaseSync(dbPath);
console.log(`DB: ${dbPath}`);
// 튜닝 모수 스윕용 — 환경변수로 덮어쓴다
const TUNING = {};
if (process.env.HALF_LIFE) TUNING.halfLife = Number(process.env.HALF_LIFE);
if (process.env.MAX_AGE) TUNING.maxAgeOwn = Number(process.env.MAX_AGE);
if (process.env.SAME_SEM) TUNING.sameSemesterOwn = true;
if (process.env.CROSS_W) TUNING.crossSemWeightOwn = Number(process.env.CROSS_W);
if (process.env.TAU_SECTION) TUNING.tauSection = Number(process.env.TAU_SECTION);
if (process.env.ASSUME_LINEAGE) TUNING.assumeLineage = true;
// 경쟁분반(형제분반) 수요 재배분 보정
if (process.env.RIVAL) TUNING.rivalMode = process.env.RIVAL; // model | observed | off
if (process.env.RIVAL_BETA) TUNING.rivalBeta = Number(process.env.RIVAL_BETA);
if (process.env.RIVAL_ALPHA_SCOPE) TUNING.rivalAlphaScope = process.env.RIVAL_ALPHA_SCOPE;
if (process.env.RIVAL_TAU_ALPHA) TUNING.rivalTauAlpha = Number(process.env.RIVAL_TAU_ALPHA);
if (process.env.RIVAL_CAP_FRAC) TUNING.rivalCapFrac = Number(process.env.RIVAL_CAP_FRAC);
if (process.env.RIVAL_MIN_DIV) TUNING.rivalMinDivisions = Number(process.env.RIVAL_MIN_DIV);

// 모델 A/B 비교용 — MODEL_PATH 로 다른 구현(예: 변경 전 엔진 사본)을 끼워 **같은 지표**로 잰다.
// 이게 없으면 엔진을 고칠 때마다 기준선을 다시 잴 방법이 없어 "개선"을 증명할 수 없다.
const modelUrl = process.env.MODEL_PATH
  ? pathToFileURL(process.env.MODEL_PATH).href
  : '../../src/lib/mileage/predict.ts';
const { predictAll, admitProbability } = await import(modelUrl);

/**
 * ── 청중 그룹별 컷 스위치 ───────────────────────────────────────
 *
 * 전공자 자리와 비전공자 자리는 따로 배정되므로 "합격자 전체의 최저 배점"은 어느 쪽의
 * 컷도 아니다(근거는 precompute.mjs ① 절 주석). 학정번호가 MEU 면 전공자 컷, 그 밖이면
 * 비전공자 컷을 쓰고, 그 그룹에 (별표 제외) 합격자가 없으면 전체 컷으로 폴백한다.
 *
 * 타깃(정답)이 바뀌는 변경이라 **이중 측정**이 필요하다. 그래서 스위치를 둘로 나눈다:
 *
 *   GROUP_CUT_TRUTH=1   정답(평가 대상 학기의 실제 컷)만 새 규칙으로
 *   GROUP_CUT_HIST=1    훈련 이력(과거 학기 컷 + 동점 승률)만 새 규칙으로
 *   GROUP_CUT=1         둘 다
 *
 * 공정 비교(채택 판정)는 **같은 정답 위에서** 이력만 갈아 끼워야 한다:
 *   GROUP_CUT_TRUTH=1                  … 구 이력으로 새 정답 맞히기
 *   GROUP_CUT_TRUTH=1 GROUP_CUT_HIST=1 … 새 이력으로 새 정답 맞히기
 * 아무 스위치도 안 켜면 변경 전 수치가 그대로 재현돼야 한다(회귀 감시).
 *
 * 그룹 표본이 얇을 때의 폴백 문턱 — 그룹 합격자 수가 이 값 미만이면 전체 컷을 쓴다.
 * 1 이면 "그룹 합격자가 1명이라도 있으면 그룹 컷"(기본 설계).
 */
const GROUP_CUT_TRUTH = process.env.GROUP_CUT === '1' || process.env.GROUP_CUT_TRUTH === '1';
const GROUP_CUT_HIST = process.env.GROUP_CUT === '1' || process.env.GROUP_CUT_HIST === '1';
const GROUP_MIN_N = Number(process.env.GROUP_MIN_N ?? 1);
/** 이 과목의 청중 — 우리 사이트 사용자는 기계공학부 학생이다 */
const isMajorAudience = (code) => code.startsWith('MEU');

// ── 실제 컷(정답) — 합격자 중 최저 배점 ──────────────────────────
const cutRows = db
  .prepare(
    `SELECT course_code, division, year, semester,
            MIN(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='') THEN mileage END) AS cut,
            MIN(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='')
                      AND major LIKE 'Y%' THEN mileage END) AS cutMajor,
            SUM(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='')
                      AND major LIKE 'Y%' THEN 1 ELSE 0 END) AS nMajor,
            MIN(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='')
                      AND (major IS NULL OR major NOT LIKE 'Y%') THEN mileage END) AS cutNon,
            SUM(CASE WHEN success='Y' AND (remark IS NULL OR TRIM(remark)='')
                      AND (major IS NULL OR major NOT LIKE 'Y%') THEN 1 ELSE 0 END) AS nNon
       FROM mileage_bids GROUP BY course_code, division, year, semester`,
  )
  .all();
const bidKey = (r) => `${r.course_code}|${r.division}|${r.year}|${r.semester}`;
/** 전체 컷(변경 전 정의) */
const cutMap = new Map(cutRows.map((r) => [bidKey(r), r.cut]));
/** 청중 그룹 컷 — 그룹 합격자가 GROUP_MIN_N 미만이면 전체 컷으로 폴백 */
const cutGroupMap = new Map();
/** 그룹으로 좁혀 잡았는가(=1). 동점 승률 통계도 이 플래그를 따라간다. */
const groupedMap = new Map();
for (const r of cutRows) {
  const aud = isMajorAudience(r.course_code);
  const g = aud ? r.cutMajor : r.cutNon;
  const n = aud ? r.nMajor : r.nNon;
  const ok = g !== null && g !== undefined && n >= GROUP_MIN_N;
  cutGroupMap.set(bidKey(r), ok ? Number(g) : r.cut);
  groupedMap.set(bidKey(r), ok);
}
/** 정답용·이력용 컷 조회 — 스위치에 따라 갈아 끼운다 */
const truthCutOf = (k) => (GROUP_CUT_TRUTH ? cutGroupMap : cutMap).get(k);
const histCutOf = (k) => (GROUP_CUT_HIST ? cutGroupMap : cutMap).get(k);

const summary = db
  .prepare(
    `SELECT course_code, division, year, semester, capacity, applicants, min_mileage, max_allowed
       FROM mileage_summary`,
  )
  .all();

/**
 * 분반별 **실제 만점**(max_allowed) — 가장 최근 값. 36 은 전교 상한일 뿐이라 과목마다 다르다.
 * precompute 와 같은 규칙으로 뽑아야 백테스트와 배포 번들이 같은 모형을 잰다.
 */
const maxAllowed = new Map();
for (const r of summary) {
  const k = `${r.course_code}|${r.division}`;
  const prev = maxAllowed.get(k);
  if (!prev || `${r.year}${r.semester}` > prev.stamp) {
    maxAllowed.set(k, { stamp: `${r.year}${r.semester}`, value: r.max_allowed ?? 36 });
  }
}
const capOf = (code, division) => {
  const m = maxAllowed.get(`${code}|${division}`);
  return m && Number.isFinite(m.value) && m.value > 0 ? Math.round(m.value) : 36;
};

/**
 * 동점 승률의 대용치 — 학년별 (합격/신청) 합계. 만점 포화 분반에서 정규 CDF 대신 쓴다.
 * ⚠️ 목표 학기는 제외한다(미래 정보 차단). 분반의 **직전 학기** 값을 쓴다.
 */
const gradeRows = db
  .prepare(
    `SELECT course_code, division, year, semester,
            COUNT(*) AS applied,
            SUM(CASE WHEN success='Y' THEN 1 ELSE 0 END) AS won,
            SUM(CASE WHEN major LIKE 'Y%' THEN 1 ELSE 0 END) AS appliedMajor,
            SUM(CASE WHEN major LIKE 'Y%' AND success='Y' THEN 1 ELSE 0 END) AS wonMajor,
            SUM(CASE WHEN major IS NULL OR major NOT LIKE 'Y%' THEN 1 ELSE 0 END) AS appliedNon,
            SUM(CASE WHEN (major IS NULL OR major NOT LIKE 'Y%') AND success='Y' THEN 1 ELSE 0 END) AS wonNon
       FROM mileage_bids
      WHERE grade IN ('1','2','3','4')
      GROUP BY course_code, division, year, semester`,
  )
  .all();
// 동점 승률도 컷과 같은 모집단으로 잰다 — 컷이 전공자 기준인데 승률이 전원 기준이면
// 모형이 서로 다른 두 집단을 하나로 섞는다. 폴백 학기(grouped=false)는 전원 기준 그대로.
const tieWinIdx = new Map();
for (const r of gradeRows) {
  const k = bidKey(r);
  let applied = r.applied;
  let won = r.won;
  if (GROUP_CUT_HIST && groupedMap.get(k)) {
    const aud = isMajorAudience(r.course_code);
    applied = aud ? r.appliedMajor : r.appliedNon;
    won = aud ? r.wonMajor : r.wonNon;
  }
  if (applied > 0) tieWinIdx.set(k, won / applied);
}

/** 학기 순서 비교 — "2025-20" < "2026-10" */
const ord = (y, s) => Number(y) * 10 + (s === '10' ? 0 : 1);
const targetOrd = ord(TY, TS);

// ── 학습용 이력(목표 학기 이전만) ───────────────────────────────
const histBySection = new Map();
for (const s of summary) {
  if (ord(s.year, s.semester) >= targetOrd) continue; // 미래 정보 차단
  const cut = histCutOf(`${s.course_code}|${s.division}|${s.year}|${s.semester}`) ?? s.min_mileage;
  if (cut === null || cut === undefined) continue;
  const k = `${s.course_code}|${s.division}`;
  if (!histBySection.has(k)) histBySection.set(k, []);
  histBySection.get(k).push({
    year: s.year,
    semester: s.semester,
    cutoff: Number(cut),
    // 미달(신청 ≤ 정원) 판정에 쓴다 — 예전엔 null 로 버려서 그 신호를 아예 못 봤다.
    capacity: s.capacity ?? null,
    applicants: s.applicants ?? null,
    professor: profHistory.get(`${s.course_code}|${s.division}|${s.year}|${s.semester}`),
    // 경쟁분반 보정이 "그 학기에 이 관측이 어느 자리였나"를 알아야 형제를 고를 수 있다.
    division: s.division,
  });
}

/** 분반의 목표 학기 직전 학기(= 이력 중 최신) */
const latestOf = (k) => {
  let best = null;
  for (const p of histBySection.get(k) ?? []) {
    const o = Number(p.year) * 2 + (p.semester === '10' ? 0 : 1);
    if (!best || o > best.o) best = { o, year: p.year, semester: p.semester };
  }
  return best;
};

// ── 평가 대상: 목표 학기에 실제로 컷이 존재하는 분반 ────────────
const courses = db.prepare(`SELECT course_code, division, title, credits, professor, dept FROM courses`).all();
const metaByKey = new Map(courses.map((c) => [`${c.course_code}|${c.division}`, c]));

/**
 * 그 학기의 담당 교수 추정 — 경쟁분반 보정의 입력.
 *
 * 보강표에 있으면 그 값이 정본이다. 보강표에 **과목 자체가 등재된** 경우에는, 등재되지 않은
 * 학기를 현재 교수로 메우면 안 된다(그 과목은 교수가 분반을 옮긴다는 사실이 이미 확인된
 * 과목이므로 오귀속이 곧 가짜 라인업 변화가 된다) → 미상('')으로 둔다. 보강표에 전혀 없는
 * 과목은 담당이 안정적이라고 보고 분반 계보(현재 교수)를 따른다.
 */
const coursesWithProfData = new Set();
for (const key of profHistory.keys()) coursesWithProfData.add(key.split('|')[0]);
const profAt = (code, division, year, semester) => {
  const csv = profHistory.get(`${code}|${division}|${year}|${semester}`);
  if (csv) return csv;
  if (coursesWithProfData.has(code)) return '';
  return (metaByKey.get(`${code}|${division}`)?.professor ?? '').trim();
};

/**
 * 과거 학기 **분반 편성표** — 컷이 없는 분반(신청자 0 등)도 정원을 차지했으므로 포함한다.
 * 목표 학기는 넣지 않는다(미래 정보 차단).
 */
const observations = [];
for (const s of summary) {
  if (ord(s.year, s.semester) >= targetOrd) continue;
  observations.push({
    code: s.course_code,
    division: s.division,
    year: s.year,
    semester: s.semester,
    professor: profAt(s.course_code, s.division, s.year, s.semester),
    capacity: s.capacity ?? null,
    applicants: s.applicants ?? null,
  });
}

const evalSet = [];
for (const s of summary) {
  if (s.year !== TY || s.semester !== TS) continue;
  const truth = truthCutOf(`${s.course_code}|${s.division}|${TY}|${TS}`);
  if (truth === null || truth === undefined) continue;
  if (ONLY && s.course_code !== ONLY) continue;
  if (ONLY_PREFIX && !s.course_code.startsWith(ONLY_PREFIX)) continue;
  evalSet.push({ code: s.course_code, division: s.division, truth: Number(truth) });
}

// predictAll 에 넘길 sections — 평가 대상 + 계층 통계용 메타
const sections = evalSet.map((e) => {
  const m = metaByKey.get(`${e.code}|${e.division}`) ?? {};
  // ⚠️ courses 테이블의 교수는 "현재 학기(2026-2)" 기준이다. 과거 학기를 평가할 때 그 값을
  //    쓰면 그 학기의 실제 담당자와 어긋나 평가가 부정확해진다. 보강표가 있으면
  //    목표 학기의 실제 교수를 쓴다.
  const trueProf = profHistory.get(`${e.code}|${e.division}|${TY}|${TS}`);
  const last = latestOf(`${e.code}|${e.division}`);
  return {
    code: e.code,
    division: e.division,
    name: m.title ?? '',
    professor: (trueProf ?? m.professor ?? '').trim(),
    credits: Number(m.credits ?? 3),
    deptCode: m.dept ?? '',
    deptName: '',
    classification: '',
    grade: '',
    timeText: '',
    capacity: null,
    maxAllowed: capOf(e.code, e.division),
    tieWin: last
      ? (tieWinIdx.get(`${e.code}|${e.division}|${last.year}|${last.semester}`) ?? null)
      : null,
  };
});

const histories = [];
for (const [k, pts] of histBySection) {
  const [code, division] = k.split('|');
  const m = metaByKey.get(k);
  histories.push({ code, division, professor: (m?.professor ?? '').trim(), points: pts });
}

/**
 * ── 라인업 변화 서브셋 ─────────────────────────────────────────
 *
 * "직전 학기 대비 형제 교수 집합이 바뀐 분반"만 따로 잰다. 경쟁분반 보정이 노리는 표본이
 * 정확히 이것이므로, 여기서 좋아지지 않으면 보정은 기각이다.
 *
 * ⚠️ 이 판정은 **모델 밖에서** 한다. 예측 결과의 `lineupChanged` 를 쓰면 보정을 끈 실행에서
 *    그 필드가 없어(또는 달라져) 전/후가 다른 표본을 비교하게 된다.
 */
const lineupLabel = (professor, division) => (professor ? professor : `#${division}`);
const secByCode = new Map();
for (const s of sections) {
  const arr = secByCode.get(s.code);
  if (arr) arr.push(s);
  else secByCode.set(s.code, [s]);
}
const obsBySem = new Map();
for (const o of observations) {
  const k = `${o.code}|${o.year}|${o.semester}`;
  const arr = obsBySem.get(k);
  if (arr) arr.push(o);
  else obsBySem.set(k, [o]);
}
const changedKeys = new Set();
for (const s of sections) {
  const last = latestOf(`${s.code}|${s.division}`);
  if (!last) continue;
  const prevList = obsBySem.get(`${s.code}|${last.year}|${last.semester}`) ?? [];
  if (prevList.length === 0) continue;
  const now = (secByCode.get(s.code) ?? [])
    .filter((x) => x.division !== s.division)
    .map((x) => lineupLabel(x.professor, x.division))
    .sort()
    .join('');
  const then = prevList
    .filter((o) => o.division !== s.division)
    .map((o) => lineupLabel(o.professor, o.division))
    .sort()
    .join('');
  if (now !== then) changedKeys.add(`${s.code}|${s.division}`);
}

// ── 지표 계산 ───────────────────────────────────────────────────
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const med = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const hit = (a, t) => (a.length ? (a.filter((x) => x <= t).length / a.length) * 100 : NaN);

/** 한 튜닝으로 예측하고 전체·서브셋 지표를 낸다 */
function run(tuning) {
  let model = null;
  const preds = predictAll({
    sections,
    histories,
    observations,
    target: { year: TY, semester: TS },
    tuning,
    onRivalModel: (m) => {
      model = m;
    },
  });
  const predByKey = new Map(preds.map((p) => [`${p.code}|${p.division}`, p]));

  // 분반 하나하나의 오차·Brier 를 남긴다 — 서브셋은 나중에 아무 기준으로나 자를 수 있다.
  const perKey = new Map();
  let brier36 = 0;
  let brier36N = 0;

  for (const e of evalSet) {
    const p = predByKey.get(`${e.code}|${e.division}`);
    if (!p) continue;
    const err = Math.abs(p.mu - e.truth);

    // 확률 보정: 실제 컷보다 높게 걸었으면 합격이어야 한다.
    //
    // ⚠️ 격자는 **모델이 아니라 데이터의 만점**(max_allowed)으로 정한다. 모델의 maxMileage 를
    //    쓰면 엔진을 고칠 때 평가 격자까지 같이 바뀌어 변경 전후 Brier 를 비교할 수 없다.
    const cap = capOf(e.code, e.division);
    let brier = 0;
    let brierN = 0;
    for (let m = 1; m <= cap; m += Math.max(1, Math.round(cap / 12))) {
      brier += (admitProbability(p, m, 0) - (m >= e.truth ? 1 : 0)) ** 2;
      brierN++;
    }
    // 구(舊) 격자(1…36 step 3) — 만점 보정 이전 수치와 직접 비교하기 위한 참고값.
    // 실제로 걸 수 없는 배점까지 포함하므로 해석용이 아니라 회귀 감시용이다.
    for (let m = 1; m <= 36; m += 3) {
      brier36 += (admitProbability(p, m, 0) - (m >= e.truth ? 1 : 0)) ** 2;
      brier36N++;
    }
    perKey.set(`${e.code}|${e.division}`, { err, brier, brierN, basis: p.basis, mu: p.mu });
  }
  return { perKey, brier36: brier36N ? brier36 / brier36N : NaN, model, predByKey };
}

/** 키 집합으로 잘라 지표를 낸다 */
function stat(perKey, keys) {
  const errs = [];
  let brier = 0;
  let brierN = 0;
  for (const [k, v] of perKey) {
    if (keys && !keys.has(k)) continue;
    errs.push(v.err);
    brier += v.brier;
    brierN += v.brierN;
  }
  return {
    n: errs.length,
    mae: mean(errs),
    med: med(errs),
    h1: hit(errs, 1),
    h3: hit(errs, 3),
    h5: hit(errs, 5),
    brier: brierN ? brier / brierN : NaN,
  };
}

// 보정 전(off) / 후를 **한 번의 실행 안에서** 같은 표본으로 잰다.
//
// ⚠️ 엔진의 기본값은 `rivalMode:'off'`(백테스트가 기각했다 — predict.ts 주석 참고)다. 그래도
//    여기서는 기본적으로 'share' 를 켜서 잰다. 그러지 않으면 전/후가 같은 실행이 되어 기각
//    근거를 재현할 수 없다. `RIVAL=off` 로 배포 기본값 그대로도 확인할 수 있다.
const mode = process.env.RIVAL ?? 'share';
const before = run({ ...TUNING, rivalMode: 'off' });
const after = run({ ...TUNING, rivalMode: mode });

/**
 * **보정이 실제로 움직인 분반.** "라인업 변화" 서브셋에는 α 를 알 수 없어 보정량이 0 인
 * 분반이 잔뜩 섞여 있어(관측 없는 교수는 α=1 중립) 효과가 희석된다. 보정의 성패는 이
 * 집합에서 갈린다 — 여기서 못 이기면 기각이다.
 */
const movedKeys = new Set();
for (const [k, v] of after.perKey) {
  const b = before.perKey.get(k);
  if (b && Math.abs(v.mu - b.mu) >= 0.05) movedKeys.add(k);
}
const stableKeys = new Set([...before.perKey.keys()].filter((k) => !changedKeys.has(k)));

/**
 * `DUMP=<경로>` — 분반별 원자료(예측 μ·정답·오차·Brier)를 JSON 으로 떨군다.
 *
 * 이력 정의를 바꾸는 실험은 **두 프로세스**를 짝지어 비교해야 한다(정답을 고정한 채 이력만
 * 갈아 끼우므로 한 실행 안에서는 잴 수 없다). 덤프 둘을 밖에서 키로 조인하면 "정답이 바뀐
 * 분반에서만 이긴 것 아닌가" 같은 서브셋 질문에 답할 수 있다. 기록은 배포 기본값과 같은
 * `rivalMode:'off'` 실행(=`before`)의 것이다.
 */
if (process.env.DUMP) {
  const out = {};
  for (const [k, v] of before.perKey) {
    out[k] = { mu: v.mu, err: v.err, brier: v.brier / v.brierN, basis: v.basis };
  }
  for (const e of evalSet) {
    const o = out[`${e.code}|${e.division}`];
    if (o) o.truth = e.truth;
  }
  writeFileSync(process.env.DUMP, JSON.stringify(out));
  console.log(`\n  DUMP → ${process.env.DUMP} (${Object.keys(out).length}개 분반)`);
}

console.log(`\n대상 학기: ${TY}-${TS === '10' ? '1학기' : '2학기'}`);
console.log(`평가 분반: ${before.perKey.size}개 (학습에 쓴 이력: ${histories.length}개 분반)`);
{
  // 정답이 바뀌었는지·얼마나 바뀌었는지를 매 실행마다 남긴다(이중 측정의 전제 확인용).
  let moved = 0;
  let sum = 0;
  for (const e of evalSet) {
    const old = cutMap.get(`${e.code}|${e.division}|${TY}|${TS}`);
    if (old !== null && old !== undefined && Number(old) !== e.truth) {
      moved++;
      sum += e.truth - Number(old);
    }
  }
  console.log(
    `청중 그룹 컷: 정답=${GROUP_CUT_TRUTH ? 'ON' : 'off'} · 이력=${GROUP_CUT_HIST ? 'ON' : 'off'}` +
      ` · 폴백문턱 n≥${GROUP_MIN_N}` +
      (moved ? `  → 정답이 바뀐 분반 ${moved}개 (평균 ${(sum / moved).toFixed(2)}점 상승)` : ''),
  );
}
console.log(
  `경쟁분반 보정: mode=${mode} · alphaScope=${TUNING.rivalAlphaScope ?? 'course'}` +
    ` · β=${(after.model?.beta ?? 0).toFixed(4)} (회귀 표본 ${after.model?.betaPairs ?? 0}쌍)`,
);

const row = (label, s) =>
  `  ${label.padEnd(8)} n=${String(s.n).padStart(4)}  MAE ${s.mae.toFixed(2)}  중앙값 ${s.med.toFixed(2)}` +
  `  Hit±1 ${s.h1.toFixed(1)}%  Hit±3 ${s.h3.toFixed(1)}%  Hit±5 ${s.h5.toFixed(1)}%  Brier ${s.brier.toFixed(4)}`;

const table = (title, keys) => {
  console.log(`\n${title}`);
  console.log(row('보정 전', stat(before.perKey, keys)));
  console.log(row('보정 후', stat(after.perKey, keys)));
};
table('[전체]', null);
table('[라인업 변화 서브셋] — 직전 학기 대비 형제 교수 집합이 바뀐 분반', changedKeys);
table('[보정 적용 서브셋] — 보정량이 실제로 0이 아닌 분반', movedKeys);
table('[라인업 유지 서브셋] — 보정이 건드리지 말아야 할 표본', stableKeys);

/**
 * **방향 적중** — 보정이 옳은 쪽을 가리켰는가.
 *
 * MAE·Hit 은 보정의 *크기*(β)와 뒤섞여 있어, 신호는 있는데 β 가 틀린 경우와 신호 자체가
 * 없는 경우를 구분하지 못한다. 여기서는 크기를 무시하고 부호만 본다: 보정이 올리라고 한
 * 분반이 실제로 기준선보다 높았는가. 신호가 진짜면 50% 를 뚜렷이 넘어야 하고, 그렇지
 * 않다면 β 를 어떻게 조정해도 이길 수 없다(= 기각 근거).
 */
{
  const truthOf = new Map(evalSet.map((e) => [`${e.code}|${e.division}`, e.truth]));
  let winSign = 0;
  let n = 0;
  let sax = 0, say = 0, sxx = 0, syy = 0, sxy = 0;
  for (const k of movedKeys) {
    const b = before.perKey.get(k);
    const a = after.perKey.get(k);
    const truth = truthOf.get(k);
    if (!b || !a || truth === undefined) continue;
    const resid = truth - b.mu; // 기준선이 놓친 양 — 보정이 설명해야 할 대상
    const adj = a.mu - b.mu;
    if (Math.abs(resid) < 1) continue; // 사실상 이미 맞힌 분반은 방향을 논할 수 없다
    n++;
    if (Math.sign(adj) === Math.sign(resid)) winSign++;
    sax += adj; say += resid; sxx += adj * adj; syy += resid * resid; sxy += adj * resid;
  }
  const cov = sxy - (sax * say) / (n || 1);
  const den = Math.sqrt((sxx - (sax * sax) / (n || 1)) * (syy - (say * say) / (n || 1)));
  console.log(
    `\n  방향 적중  ${n ? ((winSign / n) * 100).toFixed(1) : '-'} %  (n=${n}, |잔차|≥1)` +
      `   보정량↔잔차 상관 ${den > 0 ? (cov / den).toFixed(3) : '-'}`,
  );
}

console.log(`\n  Brier@36  ${before.brier36.toFixed(4)} → ${after.brier36.toFixed(4)}  (구 격자 1…36 — 회귀 감시용)`);
const byBasis = {};
for (const v of after.perKey.values()) (byBasis[v.basis] ??= []).push(v.err);
console.log(`\n  추정 근거별 MAE(보정 후):`);
for (const [b, arr] of Object.entries(byBasis).sort((a, c) => c[1].length - a[1].length)) {
  console.log(`    ${b.padEnd(10)} n=${String(arr.length).padStart(4)}  MAE ${mean(arr).toFixed(2)}`);
}

// 개별 분반 추적 — 보정이 무엇을 얼마나 움직였는지 눈으로 확인한다.
if (process.env.TRACE) {
  const rows = [];
  for (const e of evalSet) {
    const a = after.predByKey.get(`${e.code}|${e.division}`);
    const b = before.predByKey.get(`${e.code}|${e.division}`);
    if (!a || !b || Math.abs(a.mu - b.mu) < 0.05) continue;
    rows.push({ ...e, before: b.mu, after: a.mu, d: a.mu - b.mu });
  }
  rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  console.log(`\n  보정이 움직인 분반 ${rows.length}개 (상위 20):`);
  for (const r of rows.slice(0, 20)) {
    console.log(
      `    ${r.code}-${r.division}  실제 ${String(r.truth).padStart(2)}  ` +
        `${r.before.toFixed(1)} → ${r.after.toFixed(1)} (${r.d > 0 ? '+' : ''}${r.d.toFixed(1)})`,
    );
  }
}
