/**
 * 크롤 JSON → 마일리지 이력 SQLite 변환기 (개발 전용 · 학기마다 1회 실행)
 *
 *   node --max-old-space-size=8192 tools/mileage/build-db.mjs \
 *        --courses <courses.json> --mileage <mileage_data.json> \
 *        [--base <기존.db|.db.gz>] [--out tools/mileage/data/mileage-history.db] \
 *        [--verify-against <비교용.db>] [--no-gzip] [--limit N]
 *
 * 하는 일
 *   ① 크롤러(https://github.com/halfjinhyeon/yosnei-mileage-crawler)가 만든 두 JSON을
 *      `precompute.mjs` 가 읽는 스키마의 SQLite 로 옮긴다.
 *   ② `--base` 가 주어지면 **이월 병합**한다 — base 에만 있는 (과목·분반·학년도·학기)
 *      그룹의 요약/원장을 그대로 실어 온다. 폐강·미개설로 이번 카탈로그에서 빠진 분반의
 *      과거 이력이 사라지지 않게 하려는 것이다(계층 통계의 표본이기도 하다).
 *   ③ `--verify-against` 로 같은 그룹을 두 DB 사이에서 전량 대조해 필드 매핑을 검증한다.
 *   ④ `.db` 와 나란히 `.db.gz` 를 쓴다 — 28MB 원본은 저장소에 담기 부담스러워 gzip 본만
 *      추적하고(`data/.gitignore`), 실행 시 자동 해제해 쓴다(`db-util.mjs`).
 *
 * ⚠️ 왜 스크립트로 남기는가: 이 변환은 과거 세션에서 임시 스크립트로 한 번 돌린 뒤 소실돼,
 *    "DB 는 있는데 다시 만들 방법이 없는" 상태가 됐다. 학기마다 반복되는 절차이므로
 *    저장소 안에 둔다. 갱신 절차 전체는 `tools/mileage/README.md` 참고.
 *
 * ── 필드 매핑 근거 (기존 DB 3,133개 겹침 분반 실측 대조) ─────────────────────────
 *   courses.title       ← `subjtNm`   (부제 포함형. `subjtNm2` 는 부제가 잘려 206건 불일치)
 *   courses.dept        ← `estblDeprtCd` (개설학과). college 는 `estblDeprtNm`("<대학> <학과>")
 *                          의 대학명 접두사를 colleges 표와 맞춰 코드로 되돌린다 — 3,151건
 *                          전부 성공. 크롤러가 순회 트리의 univCd 를 기록하지 않아 이 방법뿐이다.
 *   courses.credits     ← `cdt` (0.5 학점 존재. INTEGER 열이지만 SQLite 는 값 그대로 보존)
 *   mileage_summary     ← `mileageHistory[].summary`
 *   mileage_bids        ← `mileageHistory[].ranks[]`
 *
 * ⚠️ **이수구분(classification)·개설학과(dept)는 크롤 시점의 조회 맥락에 따라 흔들린다.**
 *    수강편람 API 는 "어느 학과 커리큘럼으로 조회했는지"에 따라 같은 과목에 다른 이수구분을
 *    돌려준다(학필/선교/계기 ↔ 대교 등). 크롤러는 학과를 순회하며 처음 만난 레코드를 채택하므로
 *    교양 과목은 크롤마다 값이 달라질 수 있다. 전공(MEU 등)은 개설학과가 곧 조회 학과라 안정적이다
 *    — 실측에서도 MEU 전 분반이 완전 일치했다. 예측 모델은 이 두 필드를 계층 폴백(학과·학년대)과
 *    화면 표기에만 쓰므로 교양의 흔들림은 무해하나, 사실은 알고 있어야 한다.
 */
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH, resolveDbPath } from './db-util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

// ── 인자 파싱 ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') opt.help = true;
  else if (a === '--no-gzip') opt.noGzip = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  else {
    console.error(`알 수 없는 인자: ${a}`);
    process.exit(1);
  }
}
if (opt.help || !opt.courses || !opt.mileage) {
  console.error(
    `사용법: node --max-old-space-size=8192 tools/mileage/build-db.mjs \\\n` +
      `         --courses <courses.json> --mileage <mileage_data.json> \\\n` +
      `         [--base <기존.db|.db.gz>] [--out ${DEFAULT_DB_PATH}] \\\n` +
      `         [--verify-against <비교용.db>] [--no-gzip] [--limit N]`,
  );
  process.exit(opt.help ? 0 : 1);
}
const coursesPath = resolve(opt.courses);
const mileagePath = resolve(opt.mileage);
const outPath = resolve(opt.out ?? join(REPO, DEFAULT_DB_PATH));
const limit = opt.limit ? Number(opt.limit) : Infinity;
for (const p of [coursesPath, mileagePath]) {
  if (!existsSync(p)) {
    console.error(`입력 파일이 없다: ${p}`);
    process.exit(1);
  }
}

/** 분반 번호는 2자리 문자열이 정본이다 — 크롤 원본이 '1'/'01' 로 섞여 나오는 일이 있다 */
const pad2 = (v) => String(v ?? '').trim().padStart(2, '0');
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v) => (v === null || v === undefined ? null : String(v));

// ── 스키마 ────────────────────────────────────────────────────
// 기존 DB(2026-07-24 빌드)의 스키마를 그대로 재현한다. precompute.mjs·backtest.mjs 가
// 이 열 이름들에 직접 의존하므로 열을 바꾸려면 두 스크립트를 함께 고쳐야 한다.
const SCHEMA = `
CREATE TABLE colleges (code TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE departments (code TEXT NOT NULL, college TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (code, college));
CREATE TABLE courses (course_code TEXT NOT NULL, division TEXT NOT NULL, college TEXT, dept TEXT, title TEXT, credits INTEGER, grade TEXT, classification TEXT, professor TEXT, time_slot TEXT, campus TEXT, room TEXT, evaluation TEXT, PRIMARY KEY (course_code, division));
CREATE TABLE mileage_summary (course_code TEXT NOT NULL, division TEXT NOT NULL, year TEXT NOT NULL, semester TEXT NOT NULL, capacity INTEGER, applicants INTEGER, min_mileage REAL, avg_mileage REAL, max_mileage REAL, max_allowed REAL, major_ratio TEXT, year_quotas TEXT, PRIMARY KEY (course_code, division, year, semester));
CREATE TABLE mileage_bids (id INTEGER PRIMARY KEY AUTOINCREMENT, course_code TEXT NOT NULL, division TEXT NOT NULL, year TEXT NOT NULL, semester TEXT NOT NULL, rank INTEGER, mileage REAL, major TEXT, grade TEXT, first_time TEXT, grad TEXT, applied_courses INTEGER, earned_ratio TEXT, last_sem_ratio TEXT, success TEXT, remark TEXT);
CREATE TABLE crawl_status (course_code TEXT NOT NULL, division TEXT NOT NULL, status TEXT NOT NULL, crawled_at REAL, PRIMARY KEY (course_code, division));
`;

// ── base / verify 경로가 --out 과 겹치면 사본으로 연다 ──────────
// resolveDbPath 는 `.gz` 를 나란한 `.db` 로 풀어 쓰는데, 그 `.db` 가 곧 기본 --out 이다.
// 아래에서 out 을 비우고 새로 만든 뒤에 base 를 열면 "방금 만든 빈 DB" 가 base 가 되어
// 이월 0건으로, 다 만든 뒤 verify 를 열면 새 DB 를 자기 자신과 대조해 불일치 0건으로
// **조용히 통과**한다(README 의 `--base tools/mileage/data/mileage-history.db.gz` 그대로가
// 이 경우다 — 2026-09 실측). 그래서 out 을 건드리기 **전에** 두 경로를 풀어 두고, out 과
// 같은 파일이면 임시 사본을 대신 연다. 사본은 종료 시 닫고 지운다.
const isolated = []; // { path, db } — 종료 시 정리
function isolateFromOut(label, explicit) {
  if (!explicit) return null;
  const resolved = resolveDbPath(explicit); // 필요하면 여기서 gz 가 풀린다
  if (resolve(resolved) !== outPath) return resolved;
  const copy = `${outPath}.${label}-${process.pid}.db`;
  copyFileSync(resolved, copy);
  isolated.push({ path: copy, db: null });
  console.log(`  (${label} 가 --out 과 같은 파일이라 사본으로 연다: ${copy})`);
  return copy;
}
const basePath = isolateFromOut('base', opt.base);
const verifyPath = isolateFromOut('verify', opt['verify-against']);
/** 사본 경로면 핸들을 등록해 두었다가 종료 시 닫고 지운다 */
function openReadOnly(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  const entry = isolated.find((e) => e.path === path);
  if (entry) entry.db = db;
  return db;
}
process.on('exit', () => {
  for (const e of isolated) {
    try { e.db?.close(); } catch { /* 이미 닫힘 */ }
    try { rmSync(e.path); } catch { /* 지우지 못해도 무해 — *.db 는 미추적 */ }
  }
});

mkdirSync(dirname(outPath), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  const p = outPath + suffix;
  if (existsSync(p)) rmSync(p);
}
const db = new DatabaseSync(outPath);
db.exec('PRAGMA journal_mode = MEMORY');
db.exec('PRAGMA synchronous = OFF');
db.exec(SCHEMA);

// ── base(기존 DB) 열기 ────────────────────────────────────────
let base = null;
if (basePath) {
  base = openReadOnly(basePath);
  console.log(`base: ${opt.base}`);
}

// base 의 대학·학과를 먼저 깔아 둔다(합집합. 이름이 바뀐 학과는 아래에서 신규가 덮어쓴다).
const insCollege = db.prepare('INSERT OR REPLACE INTO colleges (code, name) VALUES (?, ?)');
const insDept = db.prepare('INSERT OR REPLACE INTO departments (code, college, name) VALUES (?, ?, ?)');
/** 대학명 → 코드. `estblDeprtNm` 접두사에서 대학 코드를 되찾는 유일한 경로다. */
const collegeByName = new Map();
/** 학과코드 → 대학코드 (base 승계용 폴백) */
const collegeByDept = new Map();
let baseColleges = 0;
let baseDepts = 0;
if (base) {
  db.exec('BEGIN');
  for (const r of base.prepare('SELECT code, name FROM colleges').all()) {
    insCollege.run(r.code, r.name);
    collegeByName.set(r.name, r.code);
    baseColleges++;
  }
  for (const r of base.prepare('SELECT code, college, name FROM departments').all()) {
    insDept.run(r.code, r.college, r.name);
    if (!collegeByDept.has(r.code)) collegeByDept.set(r.code, r.college);
    baseDepts++;
  }
  db.exec('COMMIT');
}

/**
 * `estblDeprtNm`("공과대학 기계공학전공") → { college: 's1104', dept: '기계공학전공' }.
 *
 * 크롤러는 대학(univCd)/학과(faclyCd) 트리를 순회하면서도 그 코드를 레코드에 남기지 않는다.
 * 다행히 개설학과 표기가 "<대학명> <학과명>" 이라 대학명을 알려진 표와 맞추면 코드를 되찾을 수
 * 있다(실측 3,151건 전부 성공, base 의 dept→college 와도 100% 일치). 가장 긴 이름부터 맞춰
 * "공통"과 "공통기초(10~18학번)" 처럼 접두 관계인 대학명을 혼동하지 않게 한다.
 */
const collegeNames = [...collegeByName.keys()].sort((a, b) => b.length - a.length);
function splitDeptName(estblDeprtNm, deptCode) {
  const full = (estblDeprtNm ?? '').trim();
  for (const name of collegeNames) {
    if (full.startsWith(name + ' ')) {
      return { college: collegeByName.get(name), dept: full.slice(name.length + 1).trim() };
    }
  }
  // 대학명을 못 갈랐다 — base 의 학과→대학 승계로 폴백하고 학과명은 표기 전체를 쓴다.
  return { college: collegeByDept.get(deptCode) ?? null, dept: full || deptCode };
}

// ── ① 과목 카탈로그(이번 학기 개설 분반) ──────────────────────
const catalog = JSON.parse(readFileSync(coursesPath, 'utf8'));
const insCourse = db.prepare(
  `INSERT OR REPLACE INTO courses
     (course_code, division, college, dept, title, credits, grade, classification,
      professor, time_slot, campus, room, evaluation)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);
const catalogKeys = new Set();
let courseDup = 0;
let noCollege = 0;
const newDepts = new Set();
db.exec('BEGIN');
for (const c of catalog) {
  const code = String(c.subjtnb ?? '').trim();
  const division = pad2(c.corseDvclsNo);
  if (!code || division === '00') continue; // 실습 분반 표기 등 비정상 레코드 방어
  const key = `${code}|${division}`;
  if (catalogKeys.has(key)) courseDup++;
  catalogKeys.add(key);

  const deptCode = str(c.estblDeprtCd);
  const { college, dept } = splitDeptName(c.estblDeprtNm, deptCode);
  if (!college) noCollege++;
  if (deptCode && college) {
    const dk = `${deptCode}|${college}`;
    if (!newDepts.has(dk)) {
      insDept.run(deptCode, college, dept);
      newDepts.add(dk);
    }
  }

  insCourse.run(
    code,
    division,
    college,
    deptCode,
    str(c.subjtNm),
    num(c.cdt),
    str(c.hy),
    str(c.subsrtDivNm),
    str(c.cgprfNm),
    str(c.lctreTimeNm),
    // 캠퍼스 표기(신촌/국제/원주…). 기존 DB 는 전부 NULL 이었다 — 쓰는 쪽이 없어 비어 있었을
    // 뿐이라 이번엔 실제 값을 싣는다(읽는 코드가 없으므로 호환에 영향 없음).
    str(c.campsDivNm),
    str(c.lecrmNm),
    str(c.gradeEvlMthdDivNm),
  );
}
db.exec('COMMIT');

// ── ② 마일리지 이력 ───────────────────────────────────────────
//
// mileage_data.json 은 185MB(들여쓰기 포함)다. 통째로 JSON.parse 하면 힙이 위험하고
// 학기마다 커지므로, 최상위 배열의 원소 경계를 직접 훑어 **한 레코드씩** 파싱한다.
/** 최상위 JSON 배열을 원소 단위 문자열로 흘려보낸다(문자열 리터럴·이스케이프 인식) */
async function* iterateJsonArray(path) {
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 21 });
  let buf = '';
  let p = 0;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  let sawArray = false;
  for await (const chunk of stream) {
    buf += chunk;
    while (p < buf.length) {
      const ch = buf[p];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        p++;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        p++;
        continue;
      }
      if (!sawArray) {
        if (ch === '[') sawArray = true;
        p++;
        continue;
      }
      if (depth === 0) {
        if (ch === '{' || ch === '[') {
          start = p;
          depth = 1;
        }
        p++;
        continue;
      }
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          const text = buf.slice(start, p + 1);
          buf = buf.slice(p + 1);
          p = 0;
          start = -1;
          yield text;
          continue;
        }
      }
      p++;
    }
    // 원소 밖이면 소비한 앞부분을 버려 메모리를 평평하게 유지한다
    if (depth === 0 && start === -1 && p > 0) {
      buf = buf.slice(p);
      p = 0;
    }
  }
}

const insSummary = db.prepare(
  `INSERT OR REPLACE INTO mileage_summary
     (course_code, division, year, semester, capacity, applicants,
      min_mileage, avg_mileage, max_mileage, max_allowed, major_ratio, year_quotas)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
);
const insBid = db.prepare(
  `INSERT INTO mileage_bids
     (course_code, division, year, semester, rank, mileage, major, grade,
      first_time, grad, applied_courses, earned_ratio, last_sem_ratio, success, remark)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);
const insStatus = db.prepare(
  'INSERT OR REPLACE INTO crawl_status (course_code, division, status, crawled_at) VALUES (?,?,?,?)',
);

/**
 * 학년별 정원 — `sy1PercpCnt`~`sy6PercpCnt`.
 *
 * 기존 DB 는 키를 1~4 만 담았고, 실측에서도 5·6학년 정원은 전 학기 전 분반 0 이었다.
 * 그래서 기본은 1~4 로 맞추고, 0 이 아닌 5·6학년 정원이 나타나면 그 행만 키를 늘리고
 * 마지막에 건수를 보고한다(초과학기생 정원 제도가 생기면 여기서 드러난다).
 */
let quota56 = 0;
function yearQuotas(s) {
  const q = {};
  for (let g = 1; g <= 4; g++) q[String(g)] = Number(s[`sy${g}PercpCnt`] ?? 0) || 0;
  const y5 = Number(s.sy5PercpCnt ?? 0) || 0;
  const y6 = Number(s.sy6PercpCnt ?? 0) || 0;
  if (y5 || y6) {
    q['5'] = y5;
    q['6'] = y6;
    quota56++;
  }
  return JSON.stringify(q);
}

const crawledAt = statSync(mileagePath).mtimeMs / 1000;
/** 신규 크롤이 실제로 채운 그룹 — base 이월 시 "신규 승리" 판정에 쓴다 */
const newGroups = new Set();
let recs = 0;
let recErr = 0;
let recNoData = 0;
let sumRows = 0;
let bidRows = 0;
let dupGroups = 0;
let divMismatch = 0;
let notInCatalog = 0;

db.exec('BEGIN');
for await (const text of iterateJsonArray(mileagePath)) {
  if (recs >= limit) break;
  const r = JSON.parse(text);
  recs++;
  const code = String(r.subjtnb ?? '').trim();
  const division = pad2(r.corseDvclsNo);
  if (!code) continue;
  if (r.error) {
    recErr++;
    insStatus.run(code, division, 'error', crawledAt);
    continue;
  }
  if (!catalogKeys.has(`${code}|${division}`)) notInCatalog++;
  const history = Array.isArray(r.mileageHistory) ? r.mileageHistory : [];
  insStatus.run(code, division, history.length ? 'done' : 'no_data', crawledAt);
  if (!history.length) recNoData++;

  for (const h of history) {
    const year = str(h.syy ?? h.summary?.syy);
    const semester = str(h.smtDivCd ?? h.summary?.smtDivCd);
    if (!year || !semester) continue;
    const gk = `${code}|${division}|${year}|${semester}`;
    if (newGroups.has(gk)) {
      dupGroups++;
      continue;
    }
    newGroups.add(gk);

    const s = h.summary;
    if (s) {
      if (s.corseDvclsNo && pad2(s.corseDvclsNo) !== division) divMismatch++;
      insSummary.run(
        code,
        division,
        year,
        semester,
        num(s.atnlcPercpCnt),
        num(s.cnt),
        num(s.minMlg),
        num(s.avgMlg),
        num(s.maxMlg),
        num(s.usePosblMaxMlgVal),
        str(s.mjrprPercpCnt),
        yearQuotas(s),
      );
      sumRows++;
    }
    for (const b of h.ranks ?? []) {
      insBid.run(
        code,
        division,
        year,
        semester,
        num(b.mlgRank),
        num(b.mlgVal),
        str(b.mjsbjYn),
        str(b.hy),
        str(b.fratlcYn),
        str(b.grdtnAplyYn),
        num(b.aplySubjcCnt),
        str(b.ttCmpsjGrdtnCmpsjCdt),
        str(b.jstbfSmtCmpsjAtnlcPosblCdt),
        str(b.mlgAppcsPrcesDivNm),
        str(b.remrk),
      );
      bidRows++;
    }
  }
  if (recs % 500 === 0) {
    db.exec('COMMIT');
    db.exec('BEGIN');
    process.stdout.write(`\r  이력 적재 ${recs}개 과목 · 요약 ${sumRows} · 원장 ${bidRows}`);
  }
}
db.exec('COMMIT');
process.stdout.write(`\r  이력 적재 ${recs}개 과목 · 요약 ${sumRows} · 원장 ${bidRows}\n`);

// ── ③ 매핑 검증 (--verify-against) ────────────────────────────
//
// 신규 크롤과 비교 DB 양쪽에 있는 그룹을 **전량** 대조한다(샘플링하지 않는다 — 어차피 몇 초다).
// 과거 학기 결과는 확정값이라 원칙적으로 완전 일치해야 하고, 불일치는 매핑 오류이거나
// 크롤 시점 차이(중단-재개 중 누락 등)를 뜻한다.
let verifyReport = null;
if (opt['verify-against']) {
  const vdb = openReadOnly(verifyPath);
  const rep = {
    groupsCompared: 0,
    onlyNew: 0,
    onlyVerify: 0,
    summaryFields: new Map(),
    bidCount: 0,
    bidFields: new Map(),
    examples: [],
  };
  const bump = (m, field, ex) => {
    const cur = m.get(field) ?? { n: 0, ex: [] };
    cur.n++;
    if (cur.ex.length < 4) cur.ex.push(ex);
    m.set(field, cur);
  };
  const near = (a, b) => {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    return Math.abs(Number(a) - Number(b)) < 1e-9;
  };
  const gkey = (r) => `${r.course_code}|${r.division}|${r.year}|${r.semester}`;

  const vSum = new Map(vdb.prepare('SELECT * FROM mileage_summary').all().map((r) => [gkey(r), r]));
  const nSum = new Map(db.prepare('SELECT * FROM mileage_summary').all().map((r) => [gkey(r), r]));
  for (const k of nSum.keys()) if (!vSum.has(k)) rep.onlyNew++;
  for (const k of vSum.keys()) if (!nSum.has(k)) rep.onlyVerify++;

  const SUM_NUM = ['capacity', 'applicants', 'min_mileage', 'avg_mileage', 'max_mileage', 'max_allowed'];
  for (const [k, n] of nSum) {
    const v = vSum.get(k);
    if (!v) continue;
    rep.groupsCompared++;
    for (const f of SUM_NUM) if (!near(n[f], v[f])) bump(rep.summaryFields, f, [k, v[f], n[f]]);
    if ((n.major_ratio ?? null) !== (v.major_ratio ?? null))
      bump(rep.summaryFields, 'major_ratio', [k, v.major_ratio, n.major_ratio]);
    const qn = JSON.parse(n.year_quotas ?? '{}');
    const qv = JSON.parse(v.year_quotas ?? '{}');
    for (const g of ['1', '2', '3', '4']) {
      if ((qn[g] ?? 0) !== (qv[g] ?? 0)) {
        bump(rep.summaryFields, `year_quotas.${g}`, [k, qv[g], qn[g]]);
        break;
      }
    }
  }

  /**
   * 원장은 **행 순서**로 맞춰 비교한다(`id` 오름차순 = 크롤 `ranks[]` 배열 순서).
   *
   * ⚠️ `rank` 로 조인하면 안 된다. ①기존 DB 의 rank 는 `mlgRank` 보다 **정확히 1 크다**
   *    (소실된 옛 변환기의 off-by-one. 9,694개 겹침 그룹 전부 +1 이었다). ②동점자에게 같은
   *    `mlgRank` 가 매겨지는 그룹이 495개라 rank 는 그룹 안에서 유일하지도 않다.
   *    rank 는 precompute·backtest 어느 쪽도 읽지 않으므로 이 DB 는 원본 `mlgRank` 를 싣고,
   *    옛 DB 와의 차이는 아래 `rankShift` 로 따로 보고한다.
   */
  const BID_NUM = ['mileage', 'applied_courses'];
  const BID_STR = ['major', 'grade', 'first_time', 'grad', 'earned_ratio', 'last_sem_ratio', 'success', 'remark'];
  const loadBids = (h) => {
    const m = new Map();
    for (const r of h.prepare('SELECT * FROM mileage_bids ORDER BY id').all()) {
      const k = gkey(r);
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const vBids = loadBids(vdb);
  const nBids = loadBids(db);
  rep.rankShift = new Map();
  for (const [k, nArr] of nBids) {
    const vArr = vBids.get(k);
    if (!vArr) continue;
    if (nArr.length !== vArr.length) {
      rep.bidCount++;
      if (rep.examples.length < 6) rep.examples.push(`행수 ${k}: 기존 ${vArr.length} vs 신규 ${nArr.length}`);
    }
    for (let i = 0; i < Math.min(nArr.length, vArr.length); i++) {
      const n = nArr[i];
      const v = vArr[i];
      const d = Number(v.rank) - Number(n.rank);
      rep.rankShift.set(d, (rep.rankShift.get(d) ?? 0) + 1);
      for (const f of BID_NUM) if (!near(n[f], v[f])) bump(rep.bidFields, f, [k, i, v[f], n[f]]);
      for (const f of BID_STR)
        if ((n[f] ?? null) !== (v[f] ?? null)) bump(rep.bidFields, f, [k, i, v[f], n[f]]);
    }
  }
  verifyReport = rep;
  vdb.close();
}

// ── ④ base 이월 병합 ─────────────────────────────────────────
let carriedGroups = 0;
let carriedSum = 0;
let carriedBids = 0;
if (base) {
  const gkey = (r) => `${r.course_code}|${r.division}|${r.year}|${r.semester}`;
  const carry = new Set();
  db.exec('BEGIN');
  for (const r of base.prepare('SELECT * FROM mileage_summary').all()) {
    const k = gkey(r);
    if (newGroups.has(k)) continue; // 신규 크롤이 정본
    carry.add(k);
    insSummary.run(
      r.course_code, r.division, r.year, r.semester, r.capacity, r.applicants,
      r.min_mileage, r.avg_mileage, r.max_mileage, r.max_allowed, r.major_ratio, r.year_quotas,
    );
    carriedSum++;
  }
  for (const r of base.prepare('SELECT * FROM mileage_bids ORDER BY id').all()) {
    const k = gkey(r);
    if (newGroups.has(k)) continue;
    carry.add(k);
    insBid.run(
      r.course_code, r.division, r.year, r.semester, r.rank, r.mileage, r.major, r.grade,
      r.first_time, r.grad, r.applied_courses, r.earned_ratio, r.last_sem_ratio, r.success, r.remark,
    );
    carriedBids++;
  }
  db.exec('COMMIT');
  carriedGroups = carry.size;
  base.close();
}

// ── ⑤ 마무리 ────────────────────────────────────────────────
db.exec('VACUUM');
const counts = {};
for (const t of ['colleges', 'departments', 'courses', 'mileage_summary', 'mileage_bids', 'crawl_status']) {
  counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
}
const terms = db
  .prepare('SELECT year, semester, COUNT(*) AS c FROM mileage_summary GROUP BY year, semester ORDER BY year, semester')
  .all();
db.close();

const kb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
console.log(`\n✔ ${outPath}  (${kb(statSync(outPath).size)})`);
console.log(`  테이블 행 수:`, counts);
console.log(`  학기별 요약:`, terms.map((t) => `${t.year}-${t.semester}:${t.c}`).join(' · '));
console.log(
  `  카탈로그 ${catalog.length}건 → 분반 ${catalogKeys.size}개` +
    (courseDup ? ` (중복 키 ${courseDup}건)` : '') +
    (noCollege ? ` · 대학 코드 미해결 ${noCollege}건` : ' · 대학 코드 전건 해결'),
);
console.log(
  `  이력 레코드 ${recs}개 (이력 없음 ${recNoData} · 크롤 실패 ${recErr}` +
    (notInCatalog ? ` · 카탈로그에 없는 분반 ${notInCatalog}` : '') +
    (dupGroups ? ` · 중복 학기 ${dupGroups}` : '') +
    (divMismatch ? ` · 분반 표기 불일치 ${divMismatch}` : '') +
    `)`,
);
if (quota56) console.log(`  ⚠️ 5·6학년 정원이 0이 아닌 요약 ${quota56}건 — year_quotas 키를 6까지 실었다`);
if (base) {
  console.log(
    `  base 이월: 그룹 ${carriedGroups}개 (요약 ${carriedSum}행 · 원장 ${carriedBids}행)` +
      ` · 대학 ${baseColleges}건/학과 ${baseDepts}건 합집합`,
  );
}
if (verifyReport) {
  const r = verifyReport;
  const total =
    [...r.summaryFields.values()].reduce((a, b) => a + b.n, 0) +
    [...r.bidFields.values()].reduce((a, b) => a + b.n, 0) +
    r.bidCount;
  console.log(`\n  ── 검증 (${opt['verify-against']}) ─────────────────────`);
  console.log(
    `  겹치는 그룹 ${r.groupsCompared}개 · 신규에만 ${r.onlyNew}개 · 비교본에만 ${r.onlyVerify}개` +
      ` → 불일치 총 ${total}건`,
  );
  const dump = (label, m) => {
    if (!m.size) return;
    console.log(`  ${label}:`);
    for (const [f, v] of [...m].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`    ${f.padEnd(18)} ${String(v.n).padStart(6)}건  예: ${JSON.stringify(v.ex.slice(0, 2))}`);
    }
  };
  dump('요약 불일치', r.summaryFields);
  dump('원장 불일치 (그룹|행번호, 기존, 신규)', r.bidFields);
  if (r.bidCount) console.log(`    원장 행수 다른 그룹 ${r.bidCount}개  예: ${r.examples.slice(0, 3).join(' / ')}`);
  if (r.rankShift?.size) {
    // rank 차이(기존-신규) 분포. 옛 DB 의 off-by-one 이 그대로 보이면 정상이다(위 주석 참고).
    console.log(
      `  rank 차이(기존-신규) 분포: ` +
        [...r.rankShift].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d >= 0 ? '+' : ''}${d}:${n}행`).join(' · '),
    );
  }
  if (!total) console.log('  ✔ 겹치는 구간 전량 일치 — 필드 매핑 확정');
}

// gzip 본 — 저장소에는 이쪽만 추적한다(data/.gitignore 가 *.db 를 막는다)
if (!opt.noGzip) {
  const gz = outPath + '.gz';
  writeFileSync(gz, gzipSync(readFileSync(outPath), { level: 9 }));
  console.log(`\n✔ ${gz}  (${kb(statSync(gz).size)})`);
}
