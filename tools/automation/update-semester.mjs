/**
 * 학기 갱신 오케스트레이터 (개발 전용 · 학기마다 한 번)
 *
 *   node tools/automation/update-semester.mjs --target 2026-21
 *        [--only checker|mileage] [--skip-crawl] [--crawler-dir <경로>]
 *        [--max-retries 2] [--dry-run] [--help]
 *
 * 하는 일
 *   "쿠키 한 번 넣으면 나머지 전 단계가 스스로 돈다." 체커 카탈로그 파이프라인
 *   (tools/checker/README.md)과 마일리지 파이프라인(tools/mileage/README.md)의 갱신
 *   체크리스트를 한 명령으로 잇는다. **로직을 복제하지 않는다** — 각 단계는 기존
 *   스크립트를 그대로 spawn 하고, 게이트(학기 일치·개명 게이트·매칭 하네스·필드 매핑
 *   검증·typecheck)는 그 스크립트들의 종료 코드를 그대로 존중한다.
 *
 *   ① 사전 점검   쿠키·경로·입력 파일
 *   ② 체커 크롤   crawl-terms.mjs --through <t> --only <t>
 *   ③ 카탈로그    build-catalog.mjs --through <t>          (개명 게이트 exit 1)
 *   ④ 매칭 하네스 verify-matching.mjs                       (픽스처 FAIL 이면 exit 1)
 *   ⑤ 마일리지    raw → 크롤러 courses.json 시드 · mileage 크롤(+에러 재시도) · build-db
 *                 · 교수 보강표 자동 축적(build-professor-history.mjs — 실패해도 계속)
 *   ⑥ 백테스트    신·구 DB 를 직전 정규학기로 각각 재고 공통 분반만 비교 (멈추지 않음)
 *   ⑦ 번들       precompute.mjs --target <t>
 *   ⑧ 상수       src/lib/mileage/bundle.ts 의 MILEAGE_TERM
 *   ⑨ 검증       npm run typecheck
 *   ⑩ 마무리     스테이징 목록 + 사람이 판단할 체크리스트
 *
 *   판단이 필요한 지점(백테스트 채택·교수 보강표·RECENCY_ALIAS·교재)은 멈추지 않고
 *   ⑩의 체크리스트로 **출력만** 한다. 커밋·푸시는 하지 않는다.
 *
 * 재개
 *   완료한 단계를 `tools/automation/.state/update-<target>.json` 에 적는다(미추적).
 *   쿠키가 만료돼 끊기면 .env 를 갱신하고 **같은 명령을 다시** 돌리면 된다 — 완료 단계는
 *   건너뛰고, 크롤 자체도 각 도구가 학기 파일·분반 키 단위로 이어서 받는다.
 *   특정 단계를 일부러 다시 돌리려면 상태 파일에서 그 키만 지운다.
 *
 * ⚠️ 함정
 *   · 계절학기(11·21)는 마일리지 제도 밖이라 ⑤~⑧을 자동 생략한다.
 *   · `--base` 없이 build-db 를 돌리면 과거 이력이 통째로 사라진다 → 인자를 고정한다.
 *   · **`--base`/`--verify-against` 에는 방금 떠 둔 `mileage-history.prev.db.gz` 를 준다.**
 *     추적본 `mileage-history.db.gz` 를 그대로 주면 db-util 의 resolveDbPath 가 그것을
 *     나란한 `.db` 로 풀어 쓰는데, build-db 는 그 `.db`(기본 --out)를 **먼저 지우고 새로
 *     만든 뒤** base 를 연다. 즉 base 가 방금 만든 빈 DB 가 되어 이월 0건·검증 0건으로
 *     조용히 통과한다(build-db.mjs 96-113행). 파일 이름이 다른 prev 사본이면 이 겹침이
 *     구조적으로 생기지 않는다.
 *   · 크롤러의 `courses.json` 은 마일리지의 정본 입력이면서 crawl-terms.mjs 가 실행 중
 *     잠깐 바꿨다 되돌리는 파일이다. ②가 끝난 뒤 ⑤가 raw 를 복사해 시드하므로 순서를
 *     바꾸면 안 된다.
 *   · 마일리지 에러 레코드 판정은 `mileage_data.json`(190MB+)을 **스트림으로 훑어** 센다.
 *     크롤러 run-update.mjs 처럼 통째로 JSON.parse 하면 이 PC 에서 힙이 위태롭다.
 *   · build-db 는 `--max-old-space-size=8192` 없이는 OOM 이다.
 *
 * 정본 문서: tools/automation-spec.md 4절 · tools/checker/README.md · tools/mileage/README.md
 * 크롤러 저장소의 run-update.mjs(마일리지 한정)는 이 스크립트가 흡수했다.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERM_PATTERN } from '../checker/terms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const STATE_DIR = join(HERE, '.state');
const DB_GZ = join(REPO, 'tools/mileage/data/mileage-history.db.gz');
const PREV_GZ = join(REPO, 'tools/mileage/data/mileage-history.prev.db.gz');
const BUNDLE_TS = join(REPO, 'src/lib/mileage/bundle.ts');
const RAW_DIR = join(REPO, 'tools/checker/data/raw');
const RENAME_REPORT = join(REPO, 'tools/checker/reports/rename-report.json');
/** 크롤러 저장소 기본 경로 — crawl-terms.mjs 와 같은 값을 쓴다(CRAWLER_DIR 로 덮어쓴다) */
const DEFAULT_CRAWLER_DIR = 'C:\\Users\\aquae\\Desktop\\크롤링';
/** 계절학기 코드 — 마일리지 제도 밖이다 */
const SEASONAL = new Set(['11', '21']);
/**
 * ⑤-c 교수 보강표 자동 축적 범위 — 'curated'(표에 이미 있는 과목만) | 'all'(전 과목).
 *
 * `all` 은 정보를 더하는 데 그치지 않고 **모델 입력을 바꾼다**(보강표에 과목이 등재되면
 * precompute·backtest 의 profAt() 폴백이 꺼져, 표에 없는 학기는 현재 교수 대신 미상 '' 이
 * 된다 — raw 가 없는 2022-1 이전 학기 전부가 여기 걸린다). 그래서 백테스트로 재고 골랐다
 * (2026-09-04, 공통 분반 기준 · 기준=수기 116행 대비):
 *   2026-10 (1,203분반)  MAE 4.228→3.934 · Median 1.20→1.10 · Hit±3 65.0→64.3% · Brier .1182→.1152
 *   2025-20 (2,290분반)  MAE 3.876→3.709 · Median 1.00→0.90 · Hit±3 65.7→66.5% · Brier .1215→.1178
 * 네 지표 중 셋이 두 학기에서 일관되게 좋아져 `all` 을 채택했다. 되돌리려면 'curated'.
 */
const PROF_HISTORY_SCOPE = 'all';

const USAGE = `사용법: node tools/automation/update-semester.mjs --target <YYYY-SS> [옵션]

인자
  --target <YYYY-SS>  갱신할 학기 (필수). 학기코드 10=1학기·11=여름·20=2학기·21=겨울
  --only checker      체커 파이프라인(②③④)만
  --only mileage      마일리지 파이프라인(⑤~⑧)만
  --skip-crawl        크롤을 건너뛰고 이미 받아둔 JSON 으로 진행
  --crawler-dir <경로> 크롤러 저장소 (기본: 환경변수 CRAWLER_DIR → ${DEFAULT_CRAWLER_DIR})
  --max-retries <N>   마일리지 에러 레코드 재수집 횟수 (기본 2)
  --dry-run           실행할 명령과 게이트를 순서대로 찍기만 한다 (파일 변경 0)
  --help, -h          이 도움말

예시
  node tools/automation/update-semester.mjs --target 2026-21              # 겨울계절(체커만)
  node tools/automation/update-semester.mjs --target 2027-10              # 정규학기 전 과정
  node tools/automation/update-semester.mjs --target 2027-10 --skip-crawl # 받아둔 JSON 으로 재개`;

// ── 인자 파싱 ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = { only: null, target: null, crawlerDir: null, maxRetries: 2, skipCrawl: false, dryRun: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const eq = a.indexOf('=');
  const [flag, inline] = eq > 2 && a.startsWith('--') ? [a.slice(0, eq), a.slice(eq + 1)] : [a, null];
  const value = () => inline ?? argv[++i];
  if (flag === '--help' || flag === '-h') {
    console.log(USAGE);
    process.exit(0);
  } else if (flag === '--target') opt.target = value();
  else if (flag === '--only') opt.only = value();
  else if (flag === '--crawler-dir') opt.crawlerDir = value();
  else if (flag === '--max-retries') opt.maxRetries = Number(value());
  else if (flag === '--skip-crawl') opt.skipCrawl = true;
  else if (flag === '--dry-run') opt.dryRun = true;
  else {
    console.error(`알 수 없는 인자: ${a}\n`);
    console.error(USAGE);
    process.exit(1);
  }
}
if (!opt.target || !TERM_PATTERN.test(opt.target)) {
  console.error(`--target 이 필요하다 (예: --target 2026-20 — 학기코드는 10|11|20|21)\n`);
  console.error(USAGE);
  process.exit(1);
}
if (opt.only != null && opt.only !== 'checker' && opt.only !== 'mileage') {
  console.error(`--only 는 checker 또는 mileage 다: ${opt.only}`);
  process.exit(1);
}
if (!Number.isInteger(opt.maxRetries) || opt.maxRetries < 0) {
  console.error(`--max-retries 는 0 이상의 정수다: ${opt.maxRetries}`);
  process.exit(1);
}

const TARGET = opt.target;
const [YEAR, CODE] = [TARGET.slice(0, 4), TARGET.slice(5)];
const DRY = opt.dryRun;
const SKIP_CRAWL = opt.skipCrawl;
const CRAWLER_DIR = resolve(opt.crawlerDir ?? process.env.CRAWLER_DIR ?? DEFAULT_CRAWLER_DIR);
const CRAWLER_ENTRY = join(CRAWLER_DIR, 'src', 'index.js');
const CRAWLER_COURSES = join(CRAWLER_DIR, 'courses.json');
const CRAWLER_MILEAGE = join(CRAWLER_DIR, 'mileage_data.json');
const CRAWLER_ENV = join(CRAWLER_DIR, '.env');
const RAW_TERM_JSON = join(RAW_DIR, `courses-${YEAR}-${CODE}.json`);
const BUNDLE_JSON = join(REPO, `public/data/mileage-${TARGET}.json`);

const IS_SEASONAL = SEASONAL.has(CODE);
const RUN_CHECKER = opt.only !== 'mileage';
const RUN_MILEAGE = opt.only !== 'checker' && !IS_SEASONAL;

// ── 출력 ───────────────────────────────────────────────────────
const RULE = '─'.repeat(72);
/** 저장소 안이면 저장소 기준 상대 경로로, 밖이면(크롤러 등) 절대 경로 그대로 */
const rel = (p) => {
  const r = relative(REPO, p).replaceAll('\\', '/');
  if (r === '') return '.';
  return r.startsWith('..') ? p : r;
};
/** 인자에 공백이 있으면 따옴표 — 사람이 그대로 복사해 돌릴 수 있는 형태로 찍는다 */
const quote = (s) => (/[\s"]/.test(s) ? `"${s}"` : s);
const fmt = (cmd, args) => [cmd, ...args].map(quote).join(' ');

function banner(no, title) {
  console.log(`\n${RULE}\n${no} ${title}\n${RULE}`);
}

/** 안내를 찍고 그 종료 코드로 끝낸다 */
function stop(code, lines) {
  console.error('');
  for (const l of lines) console.error(l);
  process.exit(code || 1);
}

// ── 상태 파일 ──────────────────────────────────────────────────
const STATE_PATH = join(STATE_DIR, `update-${TARGET}.json`);

function readState() {
  if (!existsSync(STATE_PATH)) return { target: TARGET, done: {} };
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    return { target: TARGET, ...parsed, done: parsed.done ?? {} };
  } catch {
    console.warn(`  ! 상태 파일을 읽지 못해 처음부터 진행한다: ${rel(STATE_PATH)}`);
    return { target: TARGET, done: {} };
  }
}
const state = readState();

function writeState() {
  if (DRY) return; // dry-run 은 상태를 남기지 않는다
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

/** 단계 완료를 기록한다 */
function markDone(step) {
  state.done[step] = new Date().toISOString();
  writeState();
}

/** 앞 단계가 다시 돌아 무효가 된 단계의 기록을 지운다 */
function clearDone(step) {
  if (!state.done[step]) return;
  delete state.done[step];
  writeState();
}

/** 이미 끝난 단계면 그 사실을 찍고 true */
function done(step) {
  const at = state.done[step];
  if (!at) return false;
  console.log(`  건너뜀 — 이미 완료(${at}).`);
  console.log(`  다시 돌리려면 ${rel(STATE_PATH)} 에서 "${step}" 키를 지워라.`);
  return true;
}

// ── 실행 ───────────────────────────────────────────────────────
/** 자식 프로세스를 그대로 돌리고 종료 코드를 돌려준다. dry-run 은 명령만 찍고 0. */
function run(cmd, args, options = {}) {
  const cwd = options.cwd ?? REPO;
  console.log(`\n  $ ${fmt(cmd, args)}`);
  console.log(`    (cwd: ${rel(cwd)}${options.envNote ? ` · ${options.envNote}` : ''})`);
  if (DRY) return 0;
  // ⚠️ Windows 에서 `.cmd`(npm) 는 shell 없이 spawn 하면 EINVAL 이다(Node 20+ 의
  //    CVE-2024-27980 대응). shell 을 쓸 때는 인자를 배열로 넘기지 않고 **한 문자열로
  //    합쳐** 넘긴다 — 배열+shell 조합은 이스케이프 없이 이어 붙어 DEP0190 경고가 난다.
  //    그래서 shell 경로는 공백 없는 고정 인자(`npm run typecheck`)에만 쓴다.
  const spawnOpts = { stdio: 'inherit', cwd, env: options.env ?? process.env };
  const r = options.shell
    ? spawnSync([cmd, ...args].join(' '), { ...spawnOpts, shell: true })
    : spawnSync(cmd, args, spawnOpts);
  if (r.error) {
    console.error(`  실행 실패: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

/** node 실행 파일 · npm 실행 파일 (Windows 는 `.cmd` 라 위 shell 경로로 부른다) */
const NODE = process.execPath;
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// ── 게이트(사전 점검) ──────────────────────────────────────────
const checks = [];
/** ok=false 면 실패로 모은다. dry-run 에서는 경고로만 남기고 계속한다. */
function gate(ok, label, hint) {
  checks.push({ ok, label, hint });
  console.log(`  ${ok ? '✔' : '✘'} ${label}`);
  if (!ok && hint) console.log(`      → ${hint}`);
}

/**
 * `mileage_data.json` 의 에러 레코드 수 — 190MB+ 파일이라 스트림으로 훑는다.
 * (크롤러 run-update.mjs 는 통째로 JSON.parse 하지만 이 PC 에서는 힙이 위태롭다.)
 */
function countMileageErrors(path) {
  return new Promise((ok, fail) => {
    const NEEDLE = '"error"';
    let count = 0;
    let tail = '';
    const s = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 22 });
    s.on('data', (chunk) => {
      const buf = tail + chunk;
      let i = 0;
      while ((i = buf.indexOf(NEEDLE, i)) !== -1) {
        count++;
        i += NEEDLE.length;
      }
      // 경계에 걸친 매치만 살리고 **이미 센 매치를 다시 세지 않도록** len-1 자만 남긴다.
      tail = buf.slice(-(NEEDLE.length - 1));
    });
    s.on('end', () => ok(count));
    s.on('error', fail);
  });
}

// ── 진행 ───────────────────────────────────────────────────────
console.log(`${RULE}
학기 갱신 오케스트레이터 — 대상 ${TARGET}${DRY ? '  [dry-run: 아무것도 바꾸지 않는다]' : ''}
${RULE}
  체커 파이프라인 : ${RUN_CHECKER ? '실행' : '생략 (--only mileage)'}
  마일리지 파이프라인: ${
    RUN_MILEAGE
      ? '실행'
      : IS_SEASONAL
        ? `생략 — ${TARGET} 은 계절학기라 마일리지 제도 밖이다 (⑤~⑧ 자동 생략)`
        : '생략 (--only checker)'
  }
  크롤            : ${SKIP_CRAWL ? '생략 (--skip-crawl · 받아둔 JSON 사용)' : '실행'}
  크롤러 저장소     : ${CRAWLER_DIR}
  상태 파일        : ${rel(STATE_PATH)}`);

// ── ① 사전 점검 ───────────────────────────────────────────────
banner('①', '사전 점검');
gate(existsSync(join(REPO, 'package.json')), `사이트 저장소: ${REPO}`);
if (RUN_CHECKER || !SKIP_CRAWL) {
  gate(existsSync(CRAWLER_ENTRY), `크롤러 진입점: ${CRAWLER_ENTRY}`, '--crawler-dir 또는 CRAWLER_DIR 로 경로를 준다');
}
if (!SKIP_CRAWL) {
  const cookie = existsSync(CRAWLER_ENV)
    ? (readFileSync(CRAWLER_ENV, 'utf-8').match(/^YONSEI_COOKIE=(.+)$/m)?.[1] ?? '')
    : '';
  gate(
    /JSESSIONID=[^;\s]{20,}/.test(cookie),
    `크롤러 .env 의 YONSEI_COOKIE 에 JSESSIONID 존재`,
    '수강편람(underwood1.yonsei.ac.kr) 로그인 → F12 → Network → .do 요청의 Cookie 전체를 .env 에 붙여넣는다',
  );
}
if (RUN_MILEAGE) {
  gate(existsSync(DB_GZ), `마일리지 이력 DB: ${rel(DB_GZ)}`, 'tools/mileage/README.md 의 갱신 절차 참고');
  if (SKIP_CRAWL) {
    gate(existsSync(CRAWLER_COURSES), `크롤 결과: ${CRAWLER_COURSES}`, '--skip-crawl 을 빼고 크롤부터 돌린다');
    gate(existsSync(CRAWLER_MILEAGE), `크롤 결과: ${CRAWLER_MILEAGE}`, '--skip-crawl 을 빼고 크롤부터 돌린다');
  }
}
{
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    if (DRY) console.log(`\n  (dry-run: 점검 실패 ${failed.length}건은 경고로만 남기고 계획을 마저 찍는다)`);
    else stop(1, [`[중단] 사전 점검 ${failed.length}건 실패 — 위 → 안내를 따른 뒤 같은 명령을 다시 돌려라.`]);
  }
}

// ── ② 체커 수강편람 크롤 ───────────────────────────────────────
if (RUN_CHECKER) {
  banner('②', `체커 수강편람 크롤 — ${TARGET}`);
  if (SKIP_CRAWL) {
    console.log(`  --skip-crawl → 크롤 생략. 받아둔 ${rel(RAW_TERM_JSON)} 를 쓴다.`);
    if (!DRY && !existsSync(RAW_TERM_JSON)) {
      stop(1, [
        `[중단] ${rel(RAW_TERM_JSON)} 가 없다 — 이 학기는 아직 받은 적이 없다.`,
        `  → --skip-crawl 없이 다시 돌리거나, node tools/checker/crawl-terms.mjs --through ${TARGET} --only ${TARGET}`,
      ]);
    }
  } else if (!done('crawl-checker')) {
    const code = run(NODE, ['tools/checker/crawl-terms.mjs', '--through', TARGET, '--only', TARGET]);
    if (code !== 0) {
      stop(code, [
        `[중단] ${TARGET} 수강편람 크롤이 실패했다 (exit ${code}).`,
        '  쿠키 만료가 가장 흔한 원인이다. 크롤러 .env 의 YONSEI_COOKIE 를 갱신하고',
        '  **같은 명령을 그대로 다시** 돌려라 — 학기 파일 단위로 이어서 진행한다.',
        `  진행 상황: node tools/checker/crawl-terms.mjs --through ${TARGET} --list`,
      ]);
    }
    markDone('crawl-checker');
  }

  // ── ③ 카탈로그 통합 (개명 게이트) ────────────────────────────
  banner('③', '과목 카탈로그 통합 — build-catalog.mjs');
  if (!done('catalog')) {
    const code = run(NODE, ['tools/checker/build-catalog.mjs', '--through', TARGET]);
    if (code !== 0) {
      const lines = [
        `[중단] 카탈로그 게이트 실패 (exit ${code}) — 요건 과목의 이름이 바뀌었는데 별칭이 없다.`,
        `  리포트: ${rel(RENAME_REPORT)}`,
      ];
      try {
        const report = JSON.parse(readFileSync(RENAME_REPORT, 'utf-8'));
        const required = report.curatedRenameRequired ?? [];
        lines.push(`  curatedRenameRequired: ${required.length}건`);
        for (const r of required.slice(0, 10)) lines.push(`    · ${JSON.stringify(r)}`);
        if (required.length > 10) lines.push(`    … 외 ${required.length - 10}건 (리포트 참고)`);
      } catch {
        lines.push('  (리포트를 읽지 못했다 — 파일을 직접 확인하라)');
      }
      lines.push(
        '  → content/checker-requirements.json(전공) 또는 content/liberal-arts.json(교양) 의',
        '    name/aliases 를 갱신한 뒤 같은 명령을 다시 돌려라.',
      );
      stop(code, lines);
    }
    markDone('catalog');
  }

  // ── ④ 매칭 회귀 하네스 ───────────────────────────────────────
  banner('④', '매칭 회귀 하네스 — verify-matching.mjs');
  {
    const code = run(NODE, ['tools/checker/verify-matching.mjs']);
    if (code !== 0) {
      stop(code, [
        `[중단] 매칭 하네스 픽스처가 깨졌다 (exit ${code}).`,
        '  카탈로그 이름·별칭이 curated needle 과 겹치면 학점이 이중 집계된다.',
        '  → tools/checker/README.md "설계 불변식 — needle 전역 유일성" 을 보고 원인을 잡은 뒤 다시 돌려라.',
      ]);
    }
    // ④는 상태에 기록하지 않는다 — 몇 초짜리 게이트라 매 실행 도는 편이 맞다(①도 같다).
  }
}

// ── ⑤ 마일리지 크롤 · DB 빌드 ─────────────────────────────────
if (RUN_MILEAGE) {
  banner('⑤', `마일리지 이력 수집 — ${TARGET}`);
  if (SKIP_CRAWL) {
    console.log('  --skip-crawl → courses.json 시드와 마일리지 크롤을 건너뛴다. 받아둔 JSON 을 그대로 쓴다:');
    console.log(`    ${CRAWLER_COURSES}`);
    console.log(`    ${CRAWLER_MILEAGE}`);
  } else {
    if (!done('mileage-seed')) {
      console.log(`\n  시드(재크롤 없이): ${rel(RAW_TERM_JSON)} → ${CRAWLER_COURSES}`);
      if (!DRY) {
        if (!existsSync(RAW_TERM_JSON)) {
          stop(1, [
            `[중단] 시드할 ${rel(RAW_TERM_JSON)} 가 없다 — ②(체커 크롤)를 먼저 끝내야 한다.`,
            `  → node tools/checker/crawl-terms.mjs --through ${TARGET} --only ${TARGET}`,
          ]);
        }
        copyFileSync(RAW_TERM_JSON, CRAWLER_COURSES);
      }
      markDone('mileage-seed');
    }

    if (!done('mileage-crawl')) {
      console.log('\n  수 시간 걸린다. Ctrl+C 로 끊어도 10건마다 저장돼 이어서 진행된다.');
      console.log(`  에러 레코드가 남으면 최대 ${opt.maxRetries}회까지 그 분반만 재수집한다.`);
      const cookieHelp = [
        '  쿠키 만료가 가장 흔한 원인이다. 크롤러 .env 의 YONSEI_COOKIE 를 갱신하고',
        '  같은 명령을 다시 돌려라 — 이미 받은 분반은 보존된다.',
      ];
      let code = run(NODE, ['src/index.js', 'mileage'], { cwd: CRAWLER_DIR });
      if (code !== 0) stop(code, [`[중단] 마일리지 수집이 실패했다 (exit ${code}).`, ...cookieHelp]);
      for (let i = 1; !DRY; i++) {
        const errors = await countMileageErrors(CRAWLER_MILEAGE);
        if (errors === 0) {
          console.log('\n  ✔ 마일리지 수집 완료 — 에러 레코드 0건');
          break;
        }
        console.warn(`\n  에러 레코드 ${errors}건 남음`);
        if (i > opt.maxRetries) {
          stop(1, [`[중단] 재시도 ${opt.maxRetries}회 후에도 에러 레코드가 ${errors}건 남았다.`, ...cookieHelp]);
        }
        console.log(`  재시도 ${i}/${opt.maxRetries} — 에러 레코드만 다시 받는다`);
        code = run(NODE, ['src/index.js', 'mileage'], { cwd: CRAWLER_DIR });
        if (code !== 0) stop(code, [`[중단] 재시도 ${i} 이 실패했다 (exit ${code}).`, ...cookieHelp]);
      }
      markDone('mileage-crawl');
    }
  }

  banner('⑤-b', 'DB 빌드 — build-db.mjs (--base 이월 · --verify-against 필드 검증)');
  if (!done('build-db')) {
    // ⚠️ prev 사본은 ⑥ 백테스트의 비교 기준이자, base 겹침 사고를 막는 장치다(머리말 함정).
    //    build-db 가 성공한 뒤 상태 파일을 지우고 다시 돌리면 prev 가 "새 DB"로 덮인다 —
    //    신·구 비교를 다시 하려면 그 전에 prev 를 따로 치워 두어라.
    clearDone('backtest'); // DB 가 바뀌면 이전 비교 결과는 무효다 — ⑥을 다시 재게 한다
    clearDone('precompute');
    console.log(`\n  백업: ${rel(DB_GZ)} → ${rel(PREV_GZ)}  (미추적 · ⑥ 비교 기준)`);
    if (!DRY) copyFileSync(DB_GZ, PREV_GZ);
    const code = run(NODE, [
      '--max-old-space-size=8192',
      'tools/mileage/build-db.mjs',
      '--courses', CRAWLER_COURSES,
      '--mileage', CRAWLER_MILEAGE,
      '--base', PREV_GZ,
      '--verify-against', PREV_GZ,
    ]);
    if (code !== 0) {
      stop(code, [
        `[중단] DB 빌드가 실패했다 (exit ${code}).`,
        '  · 값 불일치가 보고됐다면 크롤 원본의 필드 매핑이 바뀐 것이다 — 덮어쓰지 말고 원인을 먼저 찾아라.',
        `  · 이전 DB 는 ${rel(PREV_GZ)} 에 그대로 있다.`,
        '  · OOM 이면 다른 프로그램을 닫고 다시 돌려라(--max-old-space-size=8192 는 이미 붙어 있다).',
      ]);
    }
    markDone('build-db');
  }

  // ── ⑤-c 교수 보강표 자동 축적 ────────────────────────────────
  // 수강편람 raw 의 cgprfNm 을 (년,학기,과목,분반,교수) 로 옮겨 적는다. 사람이 적은 행은
  // 덮지 않는다. 실패해도 파이프라인은 멈추지 않는다 — 표가 없어도 예측은 돌아가고, 이
  // 단계의 값은 "다음 학기부터 수기 보강이 필요 없다" 는 것뿐이다.
  banner('⑤-c', `교수 보강표 자동 축적 — build-professor-history.mjs --scope ${PROF_HISTORY_SCOPE}`);
  if (!done('professor-history')) {
    const code = run(NODE, [
      'tools/mileage/build-professor-history.mjs',
      '--scope', PROF_HISTORY_SCOPE,
      '--terms', TARGET,
      '--write',
    ]);
    if (code !== 0) {
      console.warn(`\n  ! 교수 보강표 축적이 실패했다 (exit ${code}) — 건너뛰고 계속한다.`);
      console.warn('    수기 표는 그대로 남아 있다. ⑩ 체크리스트에서 사람이 확인하면 된다.');
    } else {
      markDone('professor-history');
    }
  }
}

// ── ⑥ 백테스트 신·구 비교 (판단은 사람 — 멈추지 않는다) ───────
if (RUN_MILEAGE) {
  const BT_TERM = CODE === '10' ? `${Number(YEAR) - 1}-20` : `${YEAR}-10`;
  banner('⑥', `백테스트 — 직전 정규학기 ${BT_TERM} 로 신·구 DB 측정 (공통 분반만 비교)`);
  if (done('backtest')) {
    // 이 기록은 ⑤가 DB 를 다시 빌드하면 지워진다 — 낡은 비교표를 건너뛸 일이 없다.
  } else if (!DRY && !existsSync(PREV_GZ)) {
    console.log(`  ${rel(PREV_GZ)} 가 없어 비교를 건너뛴다 (이번 실행이 DB 를 새로 만들지 않았다).`);
  } else {
    const dumpPrev = join(STATE_DIR, `backtest-${TARGET}-prev.json`);
    const dumpNew = join(STATE_DIR, `backtest-${TARGET}-new.json`);
    if (!DRY) mkdirSync(STATE_DIR, { recursive: true });
    const bt = (db, dump) =>
      run(NODE, ['--experimental-strip-types', 'tools/mileage/backtest.mjs', db, BT_TERM], {
        env: { ...process.env, DUMP: dump },
        envNote: `DUMP=${rel(dump)}`,
      });
    const a = bt(PREV_GZ, dumpPrev);
    const b = bt(DB_GZ, dumpNew);
    if (a !== 0 || b !== 0) {
      console.warn('\n  ! 백테스트가 실패했다 — 비교표는 건너뛴다(파이프라인은 계속한다).');
    } else if (!DRY) {
      try {
        const prev = JSON.parse(readFileSync(dumpPrev, 'utf-8'));
        const next = JSON.parse(readFileSync(dumpNew, 'utf-8'));
        const keys = Object.keys(prev).filter(
          (k) => next[k] && Number.isFinite(prev[k].err) && Number.isFinite(next[k].err),
        );
        const stat = (d) => {
          let sum = 0;
          let hit = 0;
          for (const k of keys) {
            const e = Math.abs(d[k].err);
            sum += e;
            if (e <= 3) hit++;
          }
          return { mae: sum / keys.length, hit: (hit / keys.length) * 100 };
        };
        const p = stat(prev);
        const n = stat(next);
        const f = (v, d = 2) => v.toFixed(d).padStart(7);
        console.log(`\n  공통 분반 ${keys.length}개 (이전 ${Object.keys(prev).length} · 새 ${Object.keys(next).length})`);
        console.log(`    ${'구분'.padEnd(10)}${'MAE'.padStart(7)}${'Hit±3'.padStart(9)}`);
        console.log(`    ${'이전 DB'.padEnd(9)}${f(p.mae)}${f(p.hit, 1)}%`);
        console.log(`    ${'새 DB'.padEnd(10)}${f(n.mae)}${f(n.hit, 1)}%`);
        console.log(`    ${'차이'.padEnd(10)}${f(n.mae - p.mae)}${f(n.hit - p.hit, 1)}%p`);
        console.log('    (MAE 는 낮을수록, Hit±3 은 높을수록 좋다. 채택 판단은 사람이 한다.)');
      } catch (err) {
        console.warn(`\n  ! 덤프 비교에 실패했다: ${err.message}`);
      }
    }
    // 두 측정이 끝났으면 기록한다 — ⑨에서 걸려 다시 돌릴 때 몇 분짜리 재측정을 피한다.
    // (⑤가 DB 를 다시 빌드하면 이 기록을 지우므로 낡은 표를 재사용할 일은 없다.)
    if (a === 0 && b === 0) markDone('backtest');
  }
}

// ── ⑦ 예측 번들 생성 ──────────────────────────────────────────
if (RUN_MILEAGE) {
  banner('⑦', `예측 번들 생성 — precompute.mjs --target ${TARGET}`);
  if (!done('precompute')) {
    const code = run(NODE, ['tools/mileage/precompute.mjs', '--target', TARGET]);
    if (code !== 0) stop(code, [`[중단] 번들 생성이 실패했다 (exit ${code}).`]);
    markDone('precompute');
  }
}

// ── ⑧ 프런트 학기 상수 ────────────────────────────────────────
if (RUN_MILEAGE) {
  banner('⑧', `학기 상수 — ${rel(BUNDLE_TS)} 의 MILEAGE_TERM`);
  // MILEAGE_TERM 블록 안의 year·semester 두 값만 바꾼다. 사이에 주석이 끼어 있으므로
  // 블록을 통째로 다시 쓰지 않고 각 값만 치환한다(주석·서식·개행 코드 보존).
  const RE_TERM = /(export const MILEAGE_TERM = \{[\s\S]{0,400}?\byear:\s*)'\d{4}'([\s\S]{0,400}?\bsemester:\s*)'\d{2}'/;
  const before = readFileSync(BUNDLE_TS, 'utf-8');
  if (!RE_TERM.test(before)) {
    stop(1, [
      `[중단] ${rel(BUNDLE_TS)} 에서 MILEAGE_TERM 의 year/semester 를 찾지 못했다.`,
      `  → 손으로 { year: '${YEAR}', semester: '${CODE}' } 로 바꾸고 이 단계를 지나가라.`,
    ]);
  }
  const after = before.replace(RE_TERM, (_m, head, mid) => `${head}'${YEAR}'${mid}'${CODE}'`);
  if (after === before) {
    console.log(`  이미 ${TARGET} 이다 — 그대로 둔다.`);
  } else if (DRY) {
    console.log(`  (dry-run) MILEAGE_TERM → { year: '${YEAR}', semester: '${CODE}' } 로 치환할 예정`);
  } else {
    writeFileSync(BUNDLE_TS, after);
    console.log(`  ✔ MILEAGE_TERM → { year: '${YEAR}', semester: '${CODE}' }`);
  }
}

// ── ⑨ 타입 검증 ───────────────────────────────────────────────
banner('⑨', '검증 — npm run typecheck');
{
  const code = run(NPM, ['run', 'typecheck'], { shell: process.platform === 'win32' });
  if (code !== 0) {
    stop(code, [
      `[중단] typecheck 실패 (exit ${code}).`,
      '  이 저장소에는 다른 세션의 WIP 이 상시 섞여 있다 — 이번 갱신이 원인인지 먼저 가려라.',
    ]);
  }
}

// ── ⑩ 마무리 ─────────────────────────────────────────────────
banner('⑩', '마무리 — 스테이징 목록과 사람이 판단할 것');
{
  const staged = [];
  if (RUN_CHECKER) {
    staged.push(
      'public/data/course-catalog.json',
      'tools/checker/data/catalog-history.json',
      'tools/checker/reports/rename-report.json',
      '(고쳤다면) content/checker-requirements.json · content/liberal-arts.json',
    );
  }
  if (RUN_MILEAGE) {
    staged.push(
      'tools/mileage/data/mileage-history.db.gz',
      `public/data/mileage-${TARGET}.json`,
      `public/data/mileage-${TARGET}-detail.json`,
      'src/lib/mileage/bundle.ts',
      'tools/mileage/professor-history.csv  (⑤-c 가 자동 축적 — diff 를 눈으로 훑고 넣어라)',
    );
  }
  console.log('\n  스테이징 대상 — 파일을 하나씩 명시해서 넣어라 (`git add -A` 금지):');
  for (const f of staged) console.log(`    · ${f}`);
  console.log(`\n  커밋하지 않는 것: ${rel(PREV_GZ)}(백업) · ${rel(STATE_DIR)}/ · tools/checker/data/raw/ · *.db`);

  console.log('\n  사람이 판단할 것:');
  const manual = [];
  if (RUN_MILEAGE) {
    manual.push(
      'tools/mileage/professor-history.csv 는 ⑤-c 가 자동 축적됨 — 새로 교수가 바뀐 과목이 있으면 첫 행만 수기로.',
      '  (수강편람 raw 가 없는 2022-1 이전 학기가 그 대상이다. ⑤-c 가 "사람 행과 raw 가 다른 키" 를',
      '  찍었다면 수기 오류이거나 크롤 표기 차이이니 그 줄만 확인한다.)',
      'tools/mileage/precompute.mjs 의 RECENCY_ALIAS 재검토 — 라인업이 또 바뀌었으면 삭제한다.',
      '⑥ 백테스트 비교표를 보고 채택 여부를 판단한다 (측정하지 않은 개선은 주장하지 않는다).',
      '화면 확인: 학부 › 마일리지 전략 탭에서 검색·담기·상세·시간표가 새 학기 과목으로 나오는지.',
    );
  }
  if (RUN_CHECKER) {
    manual.push(
      `리포트 검토: ${rel(RENAME_REPORT)} 의 codeChangeCandidates · churn · liberalCreditsDiff.`,
      '화면 확인: 졸업요건 체커 STEP 03 검색.',
    );
  }
  manual.push('교재 정보는 자동화 대상이 아니다 — 수동 갱신 (tools/automation-plan.md 6절).');
  // 두 칸 들여쓴 항목은 앞 줄의 이어짐이다 — 글머리표를 붙이지 않는다.
  for (const m of manual) console.log(m.startsWith('  ') ? `      ${m.trim()}` : `    · ${m}`);

  console.log(`\n${RULE}`);
  console.log(DRY ? `dry-run 끝 — 아무것도 바꾸지 않았다. (${TARGET})` : `${TARGET} 갱신 완료. 커밋·푸시는 하지 않았다.`);
  console.log(RULE);
}
