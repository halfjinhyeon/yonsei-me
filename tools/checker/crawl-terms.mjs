/**
 * 학기별 수강편람 크롤 래퍼 (개발 전용 · 졸업요건 체커 과목 DB 구축용)
 *
 *   node tools/checker/crawl-terms.mjs [--list] [--only 2022-10,2023-20] [--force] [--help]
 *
 * 하는 일
 *   ① 별도 저장소의 크롤러(`<크롤러repo>/src/index.js courses <syy> <smtDivCd>`)를 학기 목록
 *      전체에 대해 순차 실행하고, 결과를 `tools/checker/data/raw/courses-<yyyy>-<code>.json`
 *      으로 모은다. 이미 받아둔 학기는 건너뛰므로 **중단 후 재실행하면 이어서 진행**된다.
 *   ② 학기마다 결과를 검증한다 — exit code, JSON 배열 여부, 그리고 **레코드의 syy/smtDivCd 가
 *      요청한 학기와 실제로 일치하는지**. 세션 쿠키가 만료되면 서버가 엉뚱한(기본) 학기를
 *      돌려주거나 비-JSON 을 뱉는데, 이걸 못 잡으면 2022 폴더에 2026 데이터가 들어간다.
 *   ③ 결과 규모를 판정해 `raw/crawl-log.json` 에 학기별 {term, status, count, at} 을 남긴다.
 *      status: ok(정상) · sparse(수집은 됐으나 건수가 비정상적으로 적음) · empty(결번, 저장 안 함)
 *
 * ⚠️ 크롤러 저장소는 **읽기 전용으로 취급**한다(수정 금지). 다만 크롤러가 출력 경로를
 *    `process.cwd()/courses.json` 로 고정(courses.js:162)해 두어, cwd 를 크롤러 repo 로 두고
 *    돌릴 수밖에 없다. 그런데 그 `courses.json` 은 **마일리지 파이프라인의 정본 입력**이다
 *    (`tools/mileage/build-db.mjs --courses`). 그래서 이 스크립트의 계약은
 *    "찾은 그대로 되돌려 놓는다"이다:
 *      · 시작 시 현재 `courses.json` 을 `courses.json.pre-checker` 로 **스냅샷**하고
 *      · 크롤 전 `courses.json` 을 지우고(이전 학기 잔재가 남아 오염되는 것 방지)
 *      · 학기별 산출물을 곧바로 이 저장소의 raw/ 로 옮기며
 *      · 성공·실패·예외 무엇이든 **종료 시 스냅샷을 `courses.json` 으로 복원**한다.
 *    백업을 매 실행 시점에 새로 뜨는 이유: 고정 백업 파일을 복원하면 다음 학기에
 *    마일리지가 방금 크롤한 최신 courses.json 을 낡은 백업으로 덮어쓰는 사고가 난다.
 *    스냅샷이 곧 어느 대상 학기의 카탈로그(예: 마일리지가 크롤해 둔 2026-20)면
 *    그 학기는 크롤하지 않고 검증 후 복사해 시드한다 — 서버 부하와 크롤 1회를 아낀다.
 *
 * ⚠️ 쿠키 만료가 이 작업의 상수다. 한 번에 19학기를 다 받기 어려우니, 끊기면
 *    `<크롤러repo>/.env` 의 YONSEI_COOKIE 를 갱신하고 같은 명령을 다시 돌리면 된다.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── 경로 ───────────────────────────────────────────────────────
/** 크롤러 저장소(의존성 0, node>=18). 환경변수 CRAWLER_DIR 로 덮어쓸 수 있다. */
const CRAWLER_DIR = resolve(process.env.CRAWLER_DIR || 'C:\\Users\\aquae\\Desktop\\크롤링');
const CRAWLER_ENTRY = join(CRAWLER_DIR, 'src', 'index.js');
const CRAWLER_OUT = join(CRAWLER_DIR, 'courses.json'); // 크롤러가 고정 출력하는 경로
const SNAPSHOT = join(CRAWLER_DIR, 'courses.json.pre-checker'); // 실행 전 courses.json 스냅샷
const RAW_DIR = join(HERE, 'data', 'raw');
const LOG_PATH = join(RAW_DIR, 'crawl-log.json');

// ── 학기 목록 ──────────────────────────────────────────────────
// 학기코드: 10=1학기 · 11=여름계절 · 20=2학기 · 21=겨울계절 (연도 내 시간순 10→11→20→21)
// 2026-21(겨울)은 아직 미래라 제외한다.
const SEMESTER_NAMES = { 10: '1학기', 11: '여름계절', 20: '2학기', 21: '겨울계절' };
const TERMS = [];
for (const syy of ['2022', '2023', '2024', '2025', '2026']) {
  for (const code of ['10', '11', '20', '21']) {
    if (syy === '2026' && code === '21') continue;
    TERMS.push({ syy, code, term: `${syy}-${code}` });
  }
}

/**
 * 카탈로그 JSON 이 어느 학기의 것인지 판별한다 — 전 레코드의 syy/smtDivCd 가
 * 단일 학기로 일치할 때만 그 학기 문자열을 돌려준다(아니면 null).
 * 스냅샷 시드 판단과 --list 표시에 쓴다.
 */
function detectCatalogTerm(path) {
  if (!existsSync(path)) return null;
  try {
    const records = JSON.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(records) || records.length === 0) return null;
    let term = null;
    for (const r of records) {
      if (r == null || r.syy == null) continue;
      const t = `${r.syy}-${r.smtDivCd}`;
      if (term == null) term = t;
      else if (term !== t) return null;
    }
    return term;
  } catch {
    return null;
  }
}

/** 결과 건수 하한 — 이보다 적으면 수집은 하되 sparse 로 경고한다. */
const MIN_COUNT = { regular: 500, seasonal: 50 };
const isSeasonal = (code) => code === '11' || code === '21';
const minCountOf = (code) => (isSeasonal(code) ? MIN_COUNT.seasonal : MIN_COUNT.regular);

const rawPathOf = (t) => join(RAW_DIR, `courses-${t.syy}-${t.code}.json`);
const labelOf = (t) => `${t.term} (${t.syy}학년도 ${SEMESTER_NAMES[t.code] ?? t.code})`;

// ── 인자 파싱 ──────────────────────────────────────────────────
const USAGE = `사용법: node tools/checker/crawl-terms.mjs [옵션]

  --list              계획된 학기와 현재 수집 상태만 출력하고 종료 (크롤하지 않음)
  --only <학기목록>   쉼표로 구분한 학기만 대상으로 한다 (예: --only 2022-10,2023-20)
  --force             이미 받아둔 학기도 다시 크롤한다
  --help, -h          이 도움말

환경변수
  CRAWLER_DIR         크롤러 저장소 경로 (기본: ${CRAWLER_DIR})

동작 요약
  · 대상 학기를 순차로 크롤해 tools/checker/data/raw/courses-<yyyy>-<code>.json 에 저장한다.
  · 이미 있는 파일은 건너뛴다 — 쿠키가 만료돼 중단돼도 갱신 후 재실행하면 이어서 진행된다.
  · 실행 전 courses.json 은 courses.json.pre-checker 로 스냅샷 후 종료 시 그대로 복원된다.
  · 스냅샷이 곧 어느 대상 학기의 카탈로그면 그 학기는 크롤 없이 검증·복사로 시드된다.`;

const argv = process.argv.slice(2);
const opt = { list: false, force: false, help: false, only: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') opt.help = true;
  else if (a === '--list') opt.list = true;
  else if (a === '--force') opt.force = true;
  else if (a === '--only') opt.only = argv[++i];
  else if (a.startsWith('--only=')) opt.only = a.slice('--only='.length);
  else {
    console.error(`알 수 없는 인자: ${a}\n`);
    console.error(USAGE);
    process.exit(1);
  }
}
if (opt.help) {
  console.log(USAGE);
  process.exit(0);
}

// --only 해석 (없으면 전체)
let targets = TERMS;
if (opt.only != null) {
  const wanted = opt.only
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (wanted.length === 0) {
    console.error('--only 에 학기를 하나 이상 지정해야 한다 (예: --only 2022-10,2023-20)');
    process.exit(1);
  }
  const unknown = wanted.filter((w) => !TERMS.some((t) => t.term === w));
  if (unknown.length > 0) {
    console.error(`계획에 없는 학기: ${unknown.join(', ')}`);
    console.error(`가능한 학기: ${TERMS.map((t) => t.term).join(', ')}`);
    process.exit(1);
  }
  targets = TERMS.filter((t) => wanted.includes(t.term));
}

// ── 로그 입출력 ────────────────────────────────────────────────
/** crawl-log.json 을 읽는다. 형식이 깨졌으면 빈 배열로 시작한다(크롤 결과가 정본이다). */
function readLog() {
  if (!existsSync(LOG_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(LOG_PATH, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`  ! 기존 로그를 읽지 못해 새로 쓴다: ${LOG_PATH}`);
    return [];
  }
}

/** 학기 1건을 기존 로그에 병합한다(같은 학기는 최신 결과로 교체, 계획 순서로 정렬). */
function writeLogEntry(entry) {
  mkdirSync(RAW_DIR, { recursive: true });
  const merged = readLog().filter((e) => e?.term !== entry.term);
  merged.push(entry);
  const order = new Map(TERMS.map((t, i) => [t.term, i]));
  merged.sort((a, b) => (order.get(a?.term) ?? 999) - (order.get(b?.term) ?? 999));
  writeFileSync(LOG_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');
}

// ── 검증 도우미 ────────────────────────────────────────────────
/** 치명 오류 — 쿠키 만료 등으로 더 진행하면 안 되는 상황. */
class FatalError extends Error {}

/**
 * 크롤 산출물이 요청한 학기의 것인지 확인한다.
 * syy 필드를 가진 **모든** 레코드가 요청 학기와 일치해야 한다.
 * (크롤러가 값이 비면 요청값으로 채우므로, 불일치가 나온다면 서버가 다른 학기를 돌려준 것이다)
 */
function assertTermMatches(records, t, source) {
  const bad = [];
  for (const r of records) {
    if (r == null || r.syy == null) continue; // syy 없는 레코드는 판정 대상 아님
    if (String(r.syy) !== t.syy || String(r.smtDivCd) !== t.code) {
      bad.push(`${r.syy}-${r.smtDivCd} (${r.subjtnb ?? '?'} ${r.subjtNm ?? ''})`.trim());
      if (bad.length >= 5) break;
    }
  }
  if (bad.length > 0) {
    throw new FatalError(
      `${source} 의 레코드 학기가 요청(${t.term})과 다르다 — 예: ${bad.join(' / ')}`,
    );
  }
}

/** 건수로 상태를 판정한다. */
function judge(count, t) {
  if (count === 0) return 'empty';
  return count < minCountOf(t.code) ? 'sparse' : 'ok';
}

/** 크롤러의 courses.json 을 실행 전 스냅샷으로 되돌린다(스냅샷 파일 자체는 유지). */
function restoreCrawlerOut() {
  if (!existsSync(SNAPSHOT)) {
    // 시작 시 courses.json 이 없었다 — 없던 상태로 되돌린다(크롤 잔재 제거)
    rmSync(CRAWLER_OUT, { force: true });
    return;
  }
  try {
    copyFileSync(SNAPSHOT, CRAWLER_OUT);
    console.log(`\n· 크롤러 courses.json 을 실행 전 스냅샷으로 복원했다.`);
  } catch (err) {
    console.error(`\n! courses.json 복원 실패: ${err.message}`);
    console.error(`  수동 복구: copy "${SNAPSHOT}" "${CRAWLER_OUT}"`);
  }
}

// ── --list ────────────────────────────────────────────────────
if (opt.list) {
  const log = new Map(readLog().map((e) => [e?.term, e]));
  // 스냅샷이 있으면 그것이, 없으면 현재 courses.json 이 시드 후보다
  const seedTerm = detectCatalogTerm(existsSync(SNAPSHOT) ? SNAPSHOT : CRAWLER_OUT);
  console.log(`계획된 학기 ${TERMS.length}개 (raw: ${RAW_DIR})\n`);
  let done = 0;
  for (const t of TERMS) {
    const file = rawPathOf(t);
    const prev = log.get(t.term);
    let state;
    if (existsSync(file)) {
      done++;
      const n = prev?.count != null ? `${prev.count}건` : '건수 미상';
      const warn = prev?.status === 'sparse' ? ' ⚠ 건수 부족(sparse)' : '';
      state = `수집됨 · ${n}${warn}`;
    } else if (t.term === seedTerm) {
      state = '미수집 · 시드 가능(크롤러 courses.json 스냅샷 복사)';
    } else if (prev?.status === 'empty') {
      state = '미수집 · 지난 실행에서 결번(0건)';
    } else {
      state = '미수집';
    }
    const selected = targets.some((x) => x.term === t.term) ? ' ' : '-'; // --only 로 제외되면 '-'
    console.log(`  ${selected} ${labelOf(t).padEnd(24)} ${state}`);
  }
  console.log(`\n수집됨 ${done} / 미수집 ${TERMS.length - done}`);
  if (opt.only != null) console.log(`(--only 지정: ${targets.map((t) => t.term).join(', ')} · '-' 는 이번 대상 아님)`);
  process.exit(0);
}

// ── 사전 점검 ─────────────────────────────────────────────────
if (!existsSync(CRAWLER_ENTRY)) {
  console.error(`크롤러를 찾지 못했다: ${CRAWLER_ENTRY}`);
  console.error(`CRAWLER_DIR 환경변수로 경로를 지정할 수 있다.`);
  process.exit(1);
}
mkdirSync(RAW_DIR, { recursive: true });

// 실행 전 상태 보존 — 현재 courses.json 은 마일리지 파이프라인의 최신 입력일 수 있다.
// 종료 시 이 스냅샷으로 복원해 "찾은 그대로 되돌려 놓는다".
if (existsSync(CRAWLER_OUT)) copyFileSync(CRAWLER_OUT, SNAPSHOT);
const seedTerm = detectCatalogTerm(SNAPSHOT);

// ── 학기 1개 처리 ──────────────────────────────────────────────
/**
 * @returns {'ok'|'sparse'|'empty'|'skip'}
 * @throws {FatalError} 쿠키 만료 등 진행 불가 상황
 */
function runTerm(t) {
  const dest = rawPathOf(t);

  // ① 이미 받아둔 학기는 건너뛴다 (--force 면 다시)
  if (existsSync(dest) && !opt.force) {
    console.log(`  · 이미 수집됨 — 건너뛴다 (${dest})`);
    return 'skip';
  }

  // ② 시드 특례: 스냅샷(실행 전 courses.json)이 곧 이 학기의 카탈로그면 크롤을 생략한다
  if (t.term === seedTerm && existsSync(SNAPSHOT)) {
    console.log(`  · 크롤 생략 — 실행 전 courses.json 스냅샷을 검증해 시드한다`);
    let records;
    try {
      records = JSON.parse(readFileSync(SNAPSHOT, 'utf-8'));
    } catch (err) {
      throw new FatalError(`스냅샷 JSON 파싱 실패 (${SNAPSHOT}): ${err.message}`);
    }
    if (!Array.isArray(records)) throw new FatalError(`스냅샷이 배열이 아니다: ${SNAPSHOT}`);
    assertTermMatches(records, t, '스냅샷(courses.json.pre-checker)');

    const status = judge(records.length, t);
    if (status === 'empty') throw new FatalError(`스냅샷이 비어 있어 시드할 수 없다: ${SNAPSHOT}`);
    copyFileSync(SNAPSHOT, dest);
    console.log(`  → ${records.length}건 시드 완료 (${dest})`);
    if (status === 'sparse') console.warn(`  ⚠ 건수가 하한(${minCountOf(t.code)})보다 적다 — sparse`);
    writeLogEntry({ term: t.term, status, count: records.length, at: new Date().toISOString(), source: 'seed' });
    return status;
  }

  // ③ 크롤 전 잔재 제거 — 이전 학기 결과가 남아 있으면 실패를 성공으로 오인한다
  rmSync(CRAWLER_OUT, { force: true });

  // ④ 크롤러 실행 (cwd 는 반드시 크롤러 repo — .env 와 출력 경로가 cwd 기준이다)
  console.log(`  · 크롤 시작 — node src/index.js courses ${t.syy} ${t.code} (cwd: ${CRAWLER_DIR})`);
  const res = spawnSync('node', ['src/index.js', 'courses', t.syy, t.code], {
    cwd: CRAWLER_DIR,
    stdio: 'inherit',
  });

  // ⑤ 검증
  if (res.error) throw new FatalError(`크롤러 실행 실패: ${res.error.message}`);
  if (res.signal) throw new FatalError(`크롤러가 시그널 ${res.signal} 로 종료됐다`);
  if (res.status !== 0) throw new FatalError(`크롤러가 비정상 종료했다 (exit ${res.status})`);
  if (!existsSync(CRAWLER_OUT)) throw new FatalError(`크롤러가 결과 파일을 만들지 않았다: ${CRAWLER_OUT}`);

  let records;
  try {
    records = JSON.parse(readFileSync(CRAWLER_OUT, 'utf-8'));
  } catch (err) {
    throw new FatalError(`결과 JSON 파싱 실패 (${CRAWLER_OUT}): ${err.message}`);
  }
  if (!Array.isArray(records)) throw new FatalError(`결과가 배열이 아니다: ${CRAWLER_OUT}`);
  assertTermMatches(records, t, '크롤 결과(courses.json)');

  // ⑥ 판정
  const status = judge(records.length, t);
  const at = new Date().toISOString();
  if (status === 'empty') {
    // 결번(미개설 학기 등) — 파일을 만들지 않고 기록만 남긴 뒤 계속 진행한다
    console.warn(`  ⚠ 0건 — 결번으로 보고 저장하지 않는다`);
    rmSync(CRAWLER_OUT, { force: true });
    writeLogEntry({ term: t.term, status, count: 0, at });
    return status;
  }
  copyFileSync(CRAWLER_OUT, dest);
  rmSync(CRAWLER_OUT, { force: true });
  console.log(`  → ${records.length}건 저장 (${dest})`);
  if (status === 'sparse') {
    console.warn(`  ⚠ 건수가 하한(${minCountOf(t.code)})보다 적다 — sparse 로 기록한다. 확인 필요`);
  }
  writeLogEntry({ term: t.term, status, count: records.length, at });
  return status;
}

// ── 본체 ──────────────────────────────────────────────────────
const summary = { ok: 0, sparse: 0, empty: 0, skip: 0 };
let exitCode = 0;

console.log(`대상 학기 ${targets.length}개 · 크롤러: ${CRAWLER_DIR}`);
console.log(`저장 위치: ${RAW_DIR}${opt.force ? ' (--force: 기존 파일도 다시 크롤)' : ''}\n`);

try {
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`[${i + 1}/${targets.length}] ${labelOf(t)}`);
    const status = runTerm(t);
    summary[status] = (summary[status] ?? 0) + 1;
  }
} catch (err) {
  if (!(err instanceof FatalError)) throw err;
  exitCode = 1;
  console.error(`\n────────────────────────────────────────────────`);
  console.error(`치명 오류: ${err.message}`);
  console.error(
    `\n세션 쿠키가 만료됐을 가능성이 크다.\n` +
      `  1) 브라우저에서 연세대 수강편람에 다시 로그인해 쿠키를 복사한다\n` +
      `  2) ${join(CRAWLER_DIR, '.env')} 의 YONSEI_COOKIE 값을 갱신한다\n` +
      `  3) 같은 명령을 다시 실행한다 — 이미 완료된 학기는 건너뛰고 이어서 진행된다\n` +
      `\n지금까지 저장된 raw 파일은 그대로 보존된다 (${RAW_DIR}).`,
  );
  console.error(`────────────────────────────────────────────────`);
} finally {
  restoreCrawlerOut();
}

console.log(
  `\n요약 — 정상 ${summary.ok} · 건수부족 ${summary.sparse} · 결번 ${summary.empty} · 건너뜀 ${summary.skip}`,
);
if (exitCode === 0) console.log(`로그: ${LOG_PATH}`);
process.exit(exitCode);
