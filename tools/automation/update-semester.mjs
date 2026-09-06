/**
 * 학기 갱신 오케스트레이터 (개발 전용 · 학기마다 한 번)
 *
 *   node tools/automation/update-semester.mjs --target 2026-21
 *        [--only checker|mileage] [--skip-crawl] [--crawler-dir <경로>]
 *        [--max-retries 2] [--dry-run] [--pr] [--pr-dry-run]
 *        [--force-adopt] [--unattended] [--help]
 *
 * 하는 일
 *   "명령 한 번이면 나머지 전 단계가 스스로 돈다." 체커 카탈로그 파이프라인
 *   (tools/checker/README.md)과 마일리지 파이프라인(tools/mileage/README.md)의 갱신
 *   체크리스트를 한 명령으로 잇는다. **로직을 복제하지 않는다** — 각 단계는 기존
 *   스크립트를 그대로 spawn 하고, 게이트(학기 일치·개명 게이트·매칭 하네스·필드 매핑
 *   검증·typecheck)는 그 스크립트들의 종료 코드를 그대로 존중한다.
 *
 *   ① 사전 점검   경로·입력 파일 (쿠키는 게이트가 아니라 정보 줄 — 아래 참고)
 *   ② 체커 크롤   crawl-terms.mjs --through <t> --only <t>
 *   ③ 카탈로그    build-catalog.mjs --through <t>          (개명 게이트 exit 1)
 *   ④ 매칭 하네스 verify-matching.mjs                       (픽스처 FAIL 이면 exit 1)
 *   ⑤ 마일리지    raw → 크롤러 courses.json 시드 · mileage 크롤(+에러 재시도) · build-db
 *                 · 교수 보강표 자동 축적(build-professor-history.mjs — 실패해도 계속)
 *   ⑥ 백테스트    신·구 DB 를 직전 정규학기로 각각 재고 공통 분반만 비교 + **채택 규칙**
 *   ⑦ 번들       precompute.mjs --target <t>
 *   ⑧ 상수       src/lib/mileage/bundle.ts 의 MILEAGE_TERM
 *   ⑨ 검증       npm run typecheck
 *   ⑩ 마무리     스테이징 목록 + 사람이 판단할 체크리스트 (+ --pr 이면 봇 PR)
 *
 *   판단이 필요한 지점(교수 보강표·RECENCY_ALIAS·교재)은 멈추지 않고 ⑩의 체크리스트로
 *   **출력만** 한다. 백테스트만은 규칙으로 걸러 낸다(아래).
 *
 * 백테스트 채택 규칙 (⑥ · automation-phase3.md P3-2)
 *   공통 분반 기준 **MAE 악화 ≤ 0.10점 이고 Hit±3 하락 ≤ 0.5%p** 이면 통과, 아니면 exit 3.
 *   임계와 근거는 tools/automation/backtest-rule.mjs 의 ADOPTION_RULE 주석에 있다. 표를
 *   사람이 보고 넘어가기로 했으면 `--force-adopt` 로 경고만 남기고 계속한다.
 *
 * 봇 PR (⑩ · --pr)
 *   ⑩ 스테이징 목록 중 **실제로 존재하고 HEAD 와 다른 파일만** 골라 bot-pr.mjs 로
 *   `bot/semester-<target>` 브랜치에 커밋·푸시하고 PR 을 만든다(본문 = 게이트 결과 + ⑥ 표 +
 *   rename-report 요약 + 남은 체크리스트). 작업 트리·HEAD·인덱스는 건드리지 않는다.
 *   `--pr` 없이 돌리면 지금까지처럼 **커밋·푸시를 하지 않는다**(사람이 로컬에서 돌리는 기본).
 *   `--pr-dry-run` 은 이 단계를 켜되 bot-pr.mjs 를 `--dry-run` 으로 부른다 — 커밋 객체와
 *   `git show --stat` 까지만 보고 ref·푸시·PR 은 하지 않는다(`--pr` 을 따로 줄 필요 없다).
 *
 * 쿠키는 선택이다 (2026-09-06 실측)
 *   수강편람 읽기 API 는 Cookie 헤더 없이도 같은 JSON 을 돌려준다(요약·순위·코드·과목 목록
 *   전부 확인). 그래서 ①은 쿠키가 없다고 멈추지 않고 정보 한 줄만 찍는다. 크롤 도중
 *   "JSON 대신 HTML" 을 받으면 그건 로그인 문제가 아니라 **게이트**(수강신청 기간 NetFunnel
 *   대기열·점검·WAF)로 보고, 브라우저로 상태를 확인한 뒤 필요하면 쿠키를 넣는다.
 *
 * 무인 실행 (--unattended)
 *   `--pr` 을 켜고, 중단(stop)마다 GitHub 이슈를 남긴다 — 백테스트 규칙 실패면
 *   `[자동] <target> 마일리지 갱신 보류 — 백테스트 규칙 실패 (<날짜>)`, 그 밖은 전부
 *   `[자동] <target> 학기 갱신 중단 (<날짜>)`. 이슈는 issue.mjs 가 접두로 중복을 막는다.
 *   (옛 전용 제목 `[자동] 수강편람 로그인 필요` 는 없앴다 — 쿠키가 게이트가 아니게 되면서
 *    "로그인이 필요하다" 를 단정할 근거가 사라졌다.)
 *
 * 종료 코드
 *   0 성공 · 1 사전 점검·게이트·인자 오류 · **3 백테스트 채택 규칙 실패** ·
 *   그 밖 = 실패한 하위 명령(크롤·build-db·precompute·typecheck)의 종료 코드 그대로.
 *
 * 재개
 *   완료한 단계를 `tools/automation/.state/update-<target>.json` 에 적는다(미추적).
 *   게이트에 막혀 끊기면 상태를 확인한 뒤 **같은 명령을 다시** 돌리면 된다 — 완료 단계는
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
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERM_PATTERN } from '../checker/terms.mjs';
import { compareDumps, formatComparison, judgeAdoption, ruleLine } from './backtest-rule.mjs';

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
  --pr                ⑩에서 산출물을 bot/semester-<target> 브랜치에 커밋·푸시하고 PR
  --pr-dry-run        ⑩ 을 켜되 bot-pr.mjs 를 --dry-run 으로 부른다 (커밋 객체까지 · --pr 불필요)
  --force-adopt       ⑥ 백테스트 채택 규칙이 실패해도 경고만 남기고 계속한다
  --unattended        무인 실행 — --pr 을 켜고 중단마다 GitHub 이슈를 남긴다
  --help, -h          이 도움말

종료 코드
  0 성공 · 1 사전 점검·게이트·인자 오류 · 3 백테스트 채택 규칙 실패 ·
  그 밖 = 실패한 하위 명령의 종료 코드

예시
  node tools/automation/update-semester.mjs --target 2026-21              # 겨울계절(체커만)
  node tools/automation/update-semester.mjs --target 2027-10              # 정규학기 전 과정
  node tools/automation/update-semester.mjs --target 2027-10 --skip-crawl # 받아둔 JSON 으로 재개
  node tools/automation/update-semester.mjs --target 2027-10 --unattended # 러너용(이슈·PR 자동)`;

// ── 인자 파싱 ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = {
  only: null,
  target: null,
  crawlerDir: null,
  maxRetries: 2,
  skipCrawl: false,
  dryRun: false,
  pr: false,
  prDryRun: false,
  forceAdopt: false,
  unattended: false,
};
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
  else if (flag === '--pr') opt.pr = true;
  else if (flag === '--pr-dry-run') opt.prDryRun = true;
  else if (flag === '--force-adopt') opt.forceAdopt = true;
  else if (flag === '--unattended') opt.unattended = true;
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
/** 무인 실행이면 PR 은 자동이다 — 사람이 없으니 산출물이 갈 곳은 PR 뿐이다. */
const UNATTENDED = opt.unattended;
/** `--pr-dry-run` 만 준 경우도 ⑩ 을 켠다 — 그러지 않으면 그 플래그가 아무 일도 하지 않는다. */
const MAKE_PR = opt.pr || opt.prDryRun || UNATTENDED;
const FORCE_ADOPT = opt.forceAdopt;
const BOT_BRANCH = `bot/semester-${TARGET}`;
/** 이슈 제목의 날짜 — issue.mjs 가 이 접미를 떼고 접두로 중복을 판정한다. */
const TODAY = new Date().toISOString().slice(0, 10);
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

/**
 * --unattended 일 때만: 중단 사유를 GitHub 이슈로 남긴다(issue.mjs 가 제목 접두로 중복을 막는다).
 *
 * ⚠️ **동기**로 부른다. stop() 이 곧바로 process.exit 하므로 await 할 틈이 없어, 모듈이 아니라
 *    issue.mjs 의 CLI 를 자식 프로세스로 돌린다. 이슈를 못 남겨도 종료는 그대로 진행한다 —
 *    알림 실패가 파이프라인의 결론을 바꾸면 안 된다.
 *    본문은 저장소 밖 임시 파일로 넘긴다(--dry-run 이 저장소에 아무것도 남기지 않게).
 */
function reportIssue(title, lines) {
  if (!UNATTENDED) return;
  let dir = null;
  try {
    dir = mkdtempSync(join(tmpdir(), 'yme-update-'));
    const file = join(dir, 'body.md');
    writeFileSync(file, `${lines.join('\n')}\n`);
    const args = ['tools/automation/issue.mjs', '--title', title, '--body-file', file, '--label', 'automation'];
    if (DRY) args.push('--dry-run');
    const r = spawnSync(NODE, args, { stdio: 'inherit', cwd: REPO });
    if ((r.status ?? 1) !== 0) console.error(`  ! 이슈를 남기지 못했다 (issue.mjs exit ${r.status ?? '실행 실패'}).`);
  } catch (e) {
    console.error(`  ! 이슈를 남기지 못했다: ${e.message}`);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 안내를 찍고 그 종료 코드로 끝낸다. --unattended 면 같은 안내를 이슈로도 남긴다.
 * @param {string} [issueTitle] 사건이 뚜렷할 때(백테스트 채택 규칙 등) 쓸 이슈 제목
 */
function stop(code, lines, issueTitle) {
  console.error('');
  for (const l of lines) console.error(l);
  reportIssue(issueTitle ?? `[자동] ${TARGET} 학기 갱신 중단 (${TODAY})`, [
    `\`update-semester.mjs --target ${TARGET}\` 가 exit ${code || 1} 로 멈췄다.`,
    '',
    '```',
    ...lines,
    '```',
  ]);
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
/**
 * ok=false 면 실패로 모은다. dry-run 에서는 경고로만 남기고 계속한다.
 * (옛 `key` 인자는 없앴다 — 유일한 사용처였던 쿠키 게이트가 정보 줄이 되면서 쓸모가 사라졌다.)
 */
function gate(ok, label, hint) {
  checks.push({ ok, label, hint });
  console.log(`  ${ok ? '✔' : '✘'} ${label}`);
  if (!ok && hint) console.log(`      → ${hint}`);
}

/**
 * 통과한 게이트를 지나가며 적는다 — ⑩ 봇 PR 본문의 "게이트" 절이 이 목록이다.
 * 게이트가 실패하면 stop() 으로 끝나므로, 여기 남은 항목은 곧 "통과했다" 는 뜻이다.
 */
const gateResults = [];

/**
 * 이 파일이 HEAD 와 다른가 — ⑩ 이 PR 에 올릴 파일을 고를 때만 쓴다. **읽기 전용**이다
 * (작업 트리·인덱스를 건드리지 않는다).
 *
 * ⚠️ `git diff --quiet HEAD -- <파일>` 은 **추적되지 않는 파일에 조용하다**(status 0).
 *    새 학기 번들처럼 이번에 처음 생긴 산출물이 여기 걸려 통째로 빠지므로, 조용할 때는
 *    인덱스에 있는 파일인지 한 번 더 묻는다 — HEAD 가 모르는 파일은 정의상 HEAD 와 다르다.
 */
function differsFromHead(file) {
  const r = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', file], { cwd: REPO, encoding: 'utf8' });
  if (r.error) return false;
  if (r.status === 1) return true; // 추적 파일인데 내용이 다르다
  if (r.status !== 0) return false; // git 오류 — 조용히 잘못 올리느니 후보에서 뺀다
  const known = spawnSync('git', ['ls-files', '--error-unmatch', '--', file], { cwd: REPO, encoding: 'utf8' });
  return (known.status ?? 1) !== 0; // 인덱스에도 없다 = 미추적 신규 파일
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
  // 쿠키는 **게이트가 아니라 정보**다 — 2026-09-06 실측으로 읽기 API 가 익명 접근 가능임이
  // 확인됐다(요약·순위·코드·과목 목록 전부). 없다고 여기서 멈추면 멀쩡한 크롤을 막게 된다.
  const cookie = existsSync(CRAWLER_ENV)
    ? (readFileSync(CRAWLER_ENV, 'utf-8').match(/^YONSEI_COOKIE=(.+)$/m)?.[1] ?? '')
    : '';
  console.log(
    /JSESSIONID=[^;\s]{20,}/.test(cookie)
      ? '  ✔ 쿠키 있음(게이트 대비)'
      : '  ℹ 크롤러 .env 에 YONSEI_COOKIE 없음 — 읽기 API 는 익명 접근 가능(2026-09-06 실측).\n' +
          '      게이트가 켜진 기간이면 크롤이 HTML 을 받고 멈춘다.',
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
    if (DRY) {
      console.log(`\n  (dry-run: 점검 실패 ${failed.length}건은 경고로만 남기고 계획을 마저 찍는다)`);
    } else {
      const lines = [`[중단] 사전 점검 ${failed.length}건 실패 — 위 → 안내를 따른 뒤 같은 명령을 다시 돌려라.`];
      // 이슈 본문에는 화면의 ✔/✘ 목록이 안 실린다 — 실패한 항목을 여기 옮겨 적는다.
      for (const c of failed) {
        lines.push(`  ✘ ${c.label}`);
        if (c.hint) lines.push(`      → ${c.hint}`);
      }
      // 옛 전용 제목(`[자동] 수강편람 로그인 필요`)은 없앴다 — 쿠키가 더 이상 게이트가 아니라
      // 이 자리에서 "로그인 필요" 를 단정할 근거가 없다. 기본 제목(학기 갱신 중단)을 쓴다.
      stop(1, lines);
    }
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
        '  "JSON 대신 HTML" 이면 게이트 가능성 — 수강신청 기간 NetFunnel 대기열·점검·WAF 다.',
        '  브라우저로 https://underwood1.yonsei.ac.kr 에 접속해 무슨 화면이 뜨는지 먼저 확인하고,',
        '  필요하면 그 세션의 Cookie 를 크롤러 .env 의 YONSEI_COOKIE 에 넣어라(선택 — 게이트 대비).',
        '  그 뒤 **같은 명령을 그대로 다시** 돌려라 — 학기 파일 단위로 이어서 진행한다.',
        `  진행 상황: node tools/checker/crawl-terms.mjs --through ${TARGET} --list`,
      ]);
    }
    markDone('crawl-checker');
  }

  // ── ③ 카탈로그 통합 (개명 게이트) ────────────────────────────
  banner('③', '과목 카탈로그 통합 — build-catalog.mjs');
  const catalogReused = done('catalog');
  if (!catalogReused) {
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
  gateResults.push(`✔ ③ 개명 게이트 — build-catalog.mjs${catalogReused ? ' (이전 실행 통과분 재사용)' : ''}`);

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
    gateResults.push('✔ ④ 매칭 회귀 하네스 — verify-matching.mjs');
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
        '  "JSON 대신 HTML" 이면 게이트 가능성(대기열·점검·WAF) — 브라우저로',
        '  https://underwood1.yonsei.ac.kr 상태를 확인하고, 필요하면 크롤러 .env 의',
        '  YONSEI_COOKIE 를 넣거나 갱신한 뒤(선택) 같은 명령을 다시 돌려라 — 이미 받은 분반은 보존된다.',
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
  const buildDbReused = done('build-db');
  if (!buildDbReused) {
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
  gateResults.push(
    `✔ ⑤-b 필드 매핑 검증 — build-db.mjs --verify-against${buildDbReused ? ' (이전 실행 통과분 재사용)' : ''}`,
  );

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

// ── ⑥ 백테스트 신·구 비교 + 채택 규칙 ─────────────────────────
/** ⑩ 봇 PR 본문에 그대로 넣을 ⑥ 비교표(들여쓴 줄). 비교를 못 했으면 그 사유 한 줄. */
let backtestLines = [];
if (RUN_MILEAGE) {
  const BT_TERM = CODE === '10' ? `${Number(YEAR) - 1}-20` : `${YEAR}-10`;
  banner('⑥', `백테스트 — 직전 정규학기 ${BT_TERM} 로 신·구 DB 측정 · ${ruleLine()}`);
  if (done('backtest')) {
    // 이 기록은 ⑤가 DB 를 다시 빌드하면 지워진다 — 낡은 비교표를 건너뛸 일이 없다.
    // 기록이 남아 있다는 것은 앞선 실행이 채택 규칙을 통과했다는 뜻이다(실패는 exit 3).
    backtestLines = ['  (앞선 실행에서 채택 규칙을 통과해 다시 재지 않았다.)'];
  } else if (!DRY && !existsSync(PREV_GZ)) {
    const why = `${rel(PREV_GZ)} 가 없어 비교를 건너뛴다 (이번 실행이 DB 를 새로 만들지 않았다).`;
    console.log(`  ${why}`);
    console.log('  → 채택 규칙을 적용하지 않는다. 비교 기준이 없으면 판정 자체가 성립하지 않는다.');
    backtestLines = [`  (${why} 채택 규칙 미적용)`];
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
    /** 규칙을 통과했는가 — 이 단계를 "완료" 로 기록해도 되는지의 유일한 근거다. */
    let adopted = false;
    if (a !== 0 || b !== 0) {
      console.warn('\n  ! 백테스트가 실패했다 — 채택 규칙을 적용하지 못했다(파이프라인은 계속한다).');
      backtestLines = ['  (백테스트 실행이 실패해 채택 규칙을 적용하지 못했다.)'];
    } else if (DRY) {
      console.log(`\n  (dry-run) 두 덤프를 공통 분반으로 비교하고 채택 규칙을 적용할 예정 — ${ruleLine()}`);
      console.log('  (dry-run) 실패하면 exit 3, --force-adopt 면 경고만 남기고 계속한다.');
      adopted = true;
    } else {
      try {
        const cmp = compareDumps(dumpPrev, dumpNew);
        const table = formatComparison(cmp);
        backtestLines = table;
        console.log('');
        for (const l of table) console.log(l);
        const verdict = judgeAdoption(cmp);
        if (!verdict.applicable) {
          // 공통 분반이 0 이면 비교 자체가 성립하지 않는다 — 판정 불가를 실패로 다루면
          // 비교 기준이 없는 첫 학기에 파이프라인이 통째로 멈춘다.
          console.warn('\n  ! 공통 분반이 없어 채택 규칙을 적용하지 못했다 — 사람이 직접 판단하라.');
          adopted = true;
        } else if (verdict.pass) {
          console.log(`\n  ✔ 채택 규칙 통과 (${ruleLine()})`);
          adopted = true;
        } else if (FORCE_ADOPT) {
          console.warn(`\n  ! 채택 규칙 실패 — --force-adopt 라 경고만 남기고 계속한다. (${ruleLine()})`);
          for (const r of verdict.reasons) console.warn(`    · ${r}`);
          adopted = true;
        } else {
          stop(
            3,
            [
              `[중단] 백테스트 채택 규칙 실패 — ${ruleLine()}`,
              ...table,
              ...verdict.reasons.map((r) => `  · ${r}`),
              '  새 DB 가 눈에 띄게 나빠졌다 — 크롤 원본이나 필드 매핑이 어긋났을 수 있다.',
              `  · 이전 DB 는 ${rel(PREV_GZ)} 에 그대로 있다(추적본은 아직 새 DB 다).`,
              '  · 표를 보고 넘어가기로 했으면 --force-adopt 를 붙여 같은 명령을 다시 돌려라.',
            ],
            `[자동] ${TARGET} 마일리지 갱신 보류 — 백테스트 규칙 실패 (${TODAY})`,
          );
        }
      } catch (err) {
        console.warn(`\n  ! 덤프 비교에 실패했다: ${err.message}`);
        backtestLines = [`  (덤프 비교 실패: ${err.message})`];
      }
    }
    // 규칙을 통과했을 때만 기록한다 — ⑨에서 걸려 다시 돌릴 때 몇 분짜리 재측정을 피한다.
    // (⑤가 DB 를 다시 빌드하면 이 기록을 지우므로 낡은 표를 재사용할 일은 없다.)
    if (adopted) markDone('backtest');
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
  gateResults.push('✔ ⑨ 타입 검증 — npm run typecheck');
}

/**
 * ⑩-b 봇 PR 본문 — 사람이 PR 화면만 보고 머지를 판단할 수 있어야 한다.
 * 게이트 결과 · ⑥ 비교표 · 개명 리포트 요약 · 담은 파일 · 남은 수동 체크리스트.
 */
function prBodyLines(files, manual) {
  const L = [
    `\`node tools/automation/update-semester.mjs --target ${TARGET}\` 가 자동으로 만든 PR 이다.`,
    '산출물 파일만 담았고 사람의 작업 트리·HEAD·인덱스는 건드리지 않았다(임시 인덱스 plumbing).',
    '',
    '## 게이트',
    `- 체커 파이프라인 ${RUN_CHECKER ? '실행' : '생략'} · 마일리지 파이프라인 ${RUN_MILEAGE ? '실행' : '생략'}`,
    ...gateResults.map((g) => `- ${g}`),
    '',
    `## ⑥ 백테스트 — ${ruleLine()}`,
    '',
    '```',
    ...(backtestLines.length > 0 ? backtestLines : ['  (비교표 없음 — 마일리지 파이프라인을 돌리지 않았다.)']),
    '```',
  ];
  if (RUN_CHECKER) {
    L.push('', `## 개명 리포트 (\`${rel(RENAME_REPORT)}\`)`);
    try {
      const report = JSON.parse(readFileSync(RENAME_REPORT, 'utf-8'));
      for (const [key, label] of [
        ['curatedRenameRequired', '요건 과목 이름이 바뀌었는데 별칭이 없다 — 0건이어야 정상'],
        ['codeChangeCandidates', '학정번호가 바뀐 것으로 보이는 과목 — 사람이 훑어본다'],
      ]) {
        const rows = report[key] ?? [];
        L.push(`- \`${key}\` ${rows.length}건 (${label})`);
        for (const r of rows.slice(0, 5)) L.push(`  - \`${JSON.stringify(r)}\``);
        if (rows.length > 5) L.push(`  - … 외 ${rows.length - 5}건 (리포트 참고)`);
      }
    } catch (e) {
      L.push(`- (리포트를 읽지 못했다: ${e.message})`);
    }
  }
  L.push('', '## 담은 파일', ...files.map((f) => `- \`${f}\``));
  // 두 칸 들여쓴 항목은 앞 줄의 이어짐이다(화면 출력과 같은 규약) — 글머리표를 붙이지 않는다.
  L.push('', '## 사람이 확인할 것', ...manual.map((m) => (m.startsWith('  ') ? `  ${m.trim()}` : `- ${m}`)));
  return L;
}

/**
 * ⑩ 스테이징 목록 중 **존재하고 HEAD 와 다른 파일만** 골라 bot-pr.mjs 에 넘긴다.
 * 고를 것이 없으면 아무것도 하지 않는다 — 매 실행 빈 PR 을 만드는 것보다 조용한 편이 낫다.
 */
function makeBotPr(staged, manual) {
  console.log(`\n${RULE}\n⑩-b 봇 PR — ${BOT_BRANCH}${opt.prDryRun ? '  [bot-pr.mjs --dry-run]' : ''}\n${RULE}`);
  const candidates = staged.filter((s) => s.path).map((s) => s.path);
  const files = [];
  for (const p of candidates) {
    const why = !existsSync(join(REPO, p)) ? '없음' : differsFromHead(p) ? null : 'HEAD 와 같음';
    if (why === null) files.push(p);
    console.log(`  ${why === null ? '✔' : '·'} ${p}${why === null ? '' : ` — ${why} (제외)`}`);
  }
  if (files.length === 0) {
    console.log('\n  PR 만들 것 없음 — 산출물 중 HEAD 와 다른 파일이 없다.');
    return;
  }
  const bodyPath = join(STATE_DIR, `pr-body-${TARGET}.md`);
  console.log(`\n  본문: ${rel(bodyPath)}`);
  if (!DRY) {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(bodyPath, `${prBodyLines(files, manual).join('\n')}\n`);
  }
  const args = [
    'tools/automation/bot-pr.mjs',
    '--branch', BOT_BRANCH,
    '--title', `[자동] ${TARGET} 학기 데이터 갱신`,
    '--body-file', bodyPath,
    '--label', 'automation',
  ];
  if (opt.prDryRun) args.push('--dry-run');
  const code = run(NODE, [...args, ...files]);
  if (code !== 0) {
    stop(code, [
      `[중단] 봇 PR 이 실패했다 (exit ${code}).`,
      '  산출물은 작업 트리에 그대로 있다 — 원인을 고치고 같은 명령을 다시 돌려라(앞 단계는 건너뛴다).',
    ]);
  }
}

// ── ⑩ 마무리 ─────────────────────────────────────────────────
banner('⑩', '마무리 — 스테이징 목록과 사람이 판단할 것');
{
  // path 가 있는 항목만 봇 PR 의 파일 후보가 된다. text 항목은 "고쳤다면 같이 넣어라" 처럼
  // 조건이 붙은 안내라 자동으로 고를 수 없다 — 화면에만 찍는다.
  const staged = [];
  if (RUN_CHECKER) {
    staged.push(
      { path: 'public/data/course-catalog.json' },
      { path: 'tools/checker/data/catalog-history.json' },
      { path: 'tools/checker/reports/rename-report.json' },
      { text: '(고쳤다면) content/checker-requirements.json · content/liberal-arts.json' },
    );
  }
  if (RUN_MILEAGE) {
    staged.push(
      { path: 'tools/mileage/data/mileage-history.db.gz' },
      { path: `public/data/mileage-${TARGET}.json` },
      { path: `public/data/mileage-${TARGET}-detail.json` },
      { path: 'src/lib/mileage/bundle.ts' },
      { path: 'tools/mileage/professor-history.csv', note: '(⑤-c 가 자동 축적 — diff 를 눈으로 훑고 넣어라)' },
    );
  }
  console.log('\n  스테이징 대상 — 파일을 하나씩 명시해서 넣어라 (`git add -A` 금지):');
  for (const s of staged) console.log(`    · ${s.text ?? `${s.path}${s.note ? `  ${s.note}` : ''}`}`);
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

  // ── ⑩-b 봇 PR (--pr / --unattended) ─────────────────────────
  if (MAKE_PR) makeBotPr(staged, manual);

  console.log(`\n${RULE}`);
  console.log(
    DRY
      ? `dry-run 끝 — 아무것도 바꾸지 않았다. (${TARGET})`
      : MAKE_PR && !opt.prDryRun
        ? `${TARGET} 갱신 완료. 산출물은 ${BOT_BRANCH} 봇 PR 로 올렸다 — 작업 트리·main 은 그대로다.`
        : `${TARGET} 갱신 완료. 커밋·푸시는 하지 않았다.`,
  );
  console.log(RULE);
}
