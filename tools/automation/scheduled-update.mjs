/**
 * 학기 갱신 스케줄 래퍼 — 작업 스케줄러가 **매일** 부르는 얇은 껍데기 (automation-phase3.md P3-3)
 *
 *   node tools/automation/scheduled-update.mjs [--date YYYY-MM-DD] [--dry-run]
 *                                              [--state-dir <경로>] [--force-target YYYY-SS]
 *
 * 왜 이게 있나
 *   오케스트레이터(`update-semester.mjs`)는 "학기마다 한 번" 도구다. 작업 스케줄러에는
 *   "1년에 네 번, 특정 날짜에" 를 그대로 걸 수 없고(PC 가 꺼져 있으면 그날을 놓친다),
 *   놓친 실행을 되살리는 가장 튼튼한 방법은 **매일 깨워서 오늘이 그날인지 스스로 판단**하게
 *   하는 것이다. 그래서 이 래퍼는 매일 03:00 에 돌고, 대부분의 날은 아무것도 하지 않는다.
 *
 * 창(window) — 리마인더 날짜부터 14일
 *   12/01 ~ 12/14 → <그 해>-21 (겨울계절)   01/15 ~ 01/28 → <그 해>-10 (1학기)
 *   06/01 ~ 06/14 → <그 해>-11 (여름계절)   07/15 ~ 07/28 → <그 해>-20 (2학기)
 *   창 시작일과 학기 코드는 **`remind.mjs` 의 SCHEDULES 표가 단일 출처**다 — 여기서는 cron
 *   문자열 4개만 들고 `fromSchedule()` 에 물어본다(표를 복제하면 리마인더 이슈와 실제 실행
 *   날짜가 갈린다). 14일은 "PC 를 2주 안에 한 번은 켠다" 는 가정이고, 놓치면 리마인더 이슈가
 *   남아 있으니 사람이 손으로 돌리면 된다.
 *
 * 하는 일 (순서대로, 하나라도 걸리면 exit 0 — 스케줄러에 실패를 남기지 않는다)
 *   ① 창 밖이면            `창 밖 — 오늘은 할 일 없음`
 *   ② 이미 완료했으면      `<state-dir>/scheduled-<target>.done` 이 있으면 건너뜀
 *   ③ 이미 돌고 있으면     `<state-dir>/scheduled-<target>.lock` (12시간 지난 것은 유물로 보고 치운다)
 *   ④ 포털이 비정상이면   `<state-dir>/keepalive.json` 의 `dead === true` — 오늘은 건너뛴다
 *                          (수강편람이 JSON 대신 HTML 을 주는 게이트 상태. 알림 이슈는 응답 감시
 *                           데몬이 이미 냈고, 응답이 정상으로 돌아오면 그 데몬이 dead 를 스스로
 *                           내리므로 다음 날 자동으로 돈다)
 *   ⑤ 아니면 실행          `update-semester.mjs --target <t> --unattended`
 *                          출력은 콘솔과 `<state-dir>/scheduled-<target>-<날짜>.log` 로 동시에 흘린다
 *                          (스케줄러에는 콘솔이 없다 — 로그 파일이 유일한 증거다).
 *   종료 코드 0 이면 `.done` 을 남긴다. 실패면 남기지 않아 **다음 날 자동으로 재시도**한다.
 *
 * ⚠️ 함정
 *   - 종료 코드는 오케스트레이터의 것을 **그대로** 넘긴다(0 성공 · 1 사전점검/게이트 · 3 백테스트 규칙).
 *     ①~④ 로 걸러진 "오늘은 안 함" 은 실패가 아니므로 0 이다.
 *   - PC 절전: 작업은 `WakeToRun` + `StartWhenAvailable` 로 등록한다(register-tasks.ps1).
 *     그래도 꺼져 있으면 못 돈다 — 창이 14일인 이유.
 *   - 중복 실행: 작업 스케줄러의 `MultipleInstances IgnoreNew` 위에 `.lock` 을 한 겹 더 둔다
 *     (사람이 손으로 돌리는 것과 겹칠 수 있다).
 *   - 날짜는 전부 **KST** 기준이다(러너가 UTC 든 아니든 학사 일정은 KST).
 *
 * 의존성: 없음(Node 24 내장 + remind.mjs 의 fromSchedule).
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fromSchedule } from './remind.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
// REPO 기준 상대 경로. 환경변수는 **시험 전용** 우회다 — 진짜 크롤을 돌리지 않고 잠금·tee·
// .done·종료 코드 전달 경로만 확인할 때 스텁 스크립트를 물린다. 운영에서는 쓰지 않는다.
const ORCHESTRATOR = process.env.SCHEDULED_UPDATE_ORCHESTRATOR ?? join('tools', 'automation', 'update-semester.mjs');
const DEFAULT_STATE_DIR = join(HERE, '.state');

/** 창을 여는 cron 4개. 값의 의미(학기 코드)는 remind.mjs 가 안다 — 여기서는 날짜만 읽는다. */
const WINDOW_CRONS = ['0 0 1 12 *', '0 0 15 1 *', '0 0 1 6 *', '0 0 15 7 *'];
const WINDOW_DAYS = 14;
const LOCK_STALE_HOURS = 12; // 이보다 오래된 .lock 은 죽은 프로세스의 유물로 본다
const KEEPALIVE_STALE_MIN = 30; // 이보다 오래된 keepalive.json 은 "응답 감시 데몬이 안 돈다" 로 본다

// ── 인자 ──────────────────────────────────────────────────────
const USAGE = [
  '사용법: node tools/automation/scheduled-update.mjs [옵션]',
  '  --date YYYY-MM-DD      오늘 대신 이 날짜로 판정한다(시험용, KST)',
  '  --dry-run              판정과 실행할 명령만 찍고 오케스트레이터는 부르지 않는다',
  '  --state-dir <경로>     상태·잠금·로그 위치 (기본 tools/automation/.state)',
  '  --force-target YYYY-SS 창 판정을 건너뛰고 이 학기로 실행한다(.done·잠금·응답 검사는 그대로)',
].join('\n');

function parseArgs(argv) {
  const out = { dryRun: false, date: null, stateDir: null, forceTarget: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--date') out.date = argv[++i];
    else if (a === '--state-dir') out.stateDir = argv[++i];
    else if (a === '--force-target') out.forceTarget = argv[++i];
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length);
    else if (a.startsWith('--state-dir=')) out.stateDir = a.slice('--state-dir='.length);
    else if (a.startsWith('--force-target=')) out.forceTarget = a.slice('--force-target='.length);
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`알 수 없는 인자: ${a}\n${USAGE}`);
      process.exit(1);
    }
  }
  return out;
}

// ── 날짜 (전부 KST) ───────────────────────────────────────────
/** 오늘(KST) → {y, m, d}. 러너가 UTC 일 수 있으므로 +9h 로 옮겨 읽는다. */
function kstToday(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}
/** 'YYYY-MM-DD' → {y, m, d} (형식·실재 여부 검증). */
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) throw new Error(`--date 는 YYYY-MM-DD 형식이어야 한다: ${s}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() + 1 !== mo || probe.getUTCDate() !== d) {
    throw new Error(`없는 날짜다: ${s}`);
  }
  return { y, m: mo, d };
}
const ymd = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** 날짜 → 1970 기준 일수(시각 무시). 창 판정을 정수 뺄셈으로 만든다. */
const dayNumber = ({ y, m, d }) => Date.UTC(y, m - 1, d) / 86_400_000;
/** 그날 12:00 KST 의 Date — remind.mjs 의 kstYear() 가 연도를 헷갈리지 않게. */
const kstNoon = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d, 3, 0, 0));

/**
 * 오늘이 어느 창 안인가. 창 밖이면 null.
 * @returns {{target: string, start: {y:number,m:number,d:number}, dayIndex: number} | null}
 */
export function windowFor(today) {
  for (const cron of WINDOW_CRONS) {
    const [, , dom, month] = cron.split(/\s+/);
    const start = { y: today.y, m: Number(month), d: Number(dom) };
    const diff = dayNumber(today) - dayNumber(start);
    if (diff < 0 || diff >= WINDOW_DAYS) continue;
    // 학기 코드는 remind.mjs 가 쥐고 있다(표 복제 금지). 연도는 창 시작일 기준.
    const hit = fromSchedule(cron, kstNoon(start));
    if (hit.kind !== 'semester' || !hit.term) continue;
    return { target: hit.term, start, dayIndex: diff + 1 };
  }
  return null;
}

// ── 상태 파일 ─────────────────────────────────────────────────
/** 응답 감시 데몬(session-keepalive.mjs)의 상태. 없거나 깨졌으면 null. */
function readKeepalive(stateDir) {
  const p = join(stateDir, 'keepalive.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (e) {
    console.warn(`경고: ${p} 를 읽지 못했다(${String(e.message || e)}) — 없는 셈 친다.`);
    return null;
  }
}
/** ISO 시각 이후 흐른 분. 값이 없거나 이상하면 Infinity. */
function minutesSince(ts) {
  const t = Date.parse(ts ?? '');
  return Number.isFinite(t) ? (Date.now() - t) / 60_000 : Infinity;
}

/** 오케스트레이터를 돌리며 출력을 콘솔과 로그 파일로 동시에 흘린다(tee). 종료 코드를 돌려준다. */
function runOrchestrator(target, logFile) {
  return new Promise((done) => {
    const args = [ORCHESTRATOR, '--target', target, '--unattended'];
    const out = createWriteStream(logFile, { flags: 'a' });
    out.write(`\n===== ${new Date().toISOString()} node ${args.join(' ')} (cwd ${REPO}) =====\n`);
    const child = spawn(process.execPath, args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    const finish = (code, tail) => {
      if (settled) return;
      settled = true;
      process.stdout.write(tail);
      out.end(tail);
      done(code);
    };
    // Buffer 를 그대로 흘린다 — 청크 경계에서 한글이 깨지지 않게 디코딩하지 않는다.
    child.stdout.on('data', (b) => {
      process.stdout.write(b);
      out.write(b);
    });
    child.stderr.on('data', (b) => {
      process.stderr.write(b);
      out.write(b);
    });
    child.on('error', (e) => finish(1, `오케스트레이터를 띄우지 못했다: ${String(e.message || e)}\n`));
    child.on('close', (code, signal) => {
      finish(code ?? 1, `===== exit ${code ?? `signal ${signal}`} @ ${new Date().toISOString()} =====\n`);
    });
  });
}

// ── CLI ───────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stateDir = resolve(opts.stateDir ?? DEFAULT_STATE_DIR);
  let today;
  try {
    today = opts.date ? parseDate(opts.date) : kstToday();
  } catch (e) {
    console.error(`${String(e.message || e)}\n${USAGE}`);
    process.exit(1);
  }
  console.log(`[scheduled-update] 판정 기준일 ${ymd(today)} (KST) · 상태 ${stateDir}`);

  // ① 대상 학기
  let target;
  if (opts.forceTarget) {
    if (!/^\d{4}-(10|20|11|21)$/.test(opts.forceTarget)) {
      console.error(`--force-target 은 YYYY-<10|20|11|21> 형식이어야 한다: ${opts.forceTarget}\n${USAGE}`);
      process.exit(1);
    }
    target = opts.forceTarget;
    console.log(`--force-target ${target} — 창 판정을 건너뛴다.`);
  } else {
    const win = windowFor(today);
    if (!win) {
      console.log('창 밖 — 오늘은 할 일 없음');
      process.exit(0);
    }
    target = win.target;
    console.log(`창 안 — ${ymd(win.start)} 시작 ${WINDOW_DAYS}일 창의 ${win.dayIndex}일째 · 대상 학기 ${target}`);
  }

  mkdirSync(stateDir, { recursive: true });
  const doneFile = join(stateDir, `scheduled-${target}.done`);
  const lockFile = join(stateDir, `scheduled-${target}.lock`);
  const logFile = join(stateDir, `scheduled-${target}-${ymd(today)}.log`);

  // ② 이미 했나
  if (existsSync(doneFile)) {
    let when = '';
    try {
      const d = JSON.parse(readFileSync(doneFile, 'utf-8'));
      when = ` (${d.finishedAt ?? '?'} · exit ${d.exitCode ?? '?'})`;
    } catch {
      /* 표식만 있으면 충분하다 */
    }
    console.log(`이미 완료 — 건너뜀${when}`);
    console.log(`  다시 돌리려면 ${doneFile} 를 지워라.`);
    process.exit(0);
  }

  // ③ 이미 돌고 있나
  if (existsSync(lockFile)) {
    const ageH = (Date.now() - statSync(lockFile).mtimeMs) / 3_600_000;
    if (ageH < LOCK_STALE_HOURS) {
      console.log(`이미 실행 중 — 건너뜀 (${lockFile} · ${ageH.toFixed(1)}시간 전 시작)`);
      process.exit(0);
    }
    console.warn(`경고: ${LOCK_STALE_HOURS}시간 넘은 잠금을 유물로 보고 치운다 (${ageH.toFixed(1)}시간 전).`);
    rmSync(lockFile, { force: true });
  }

  // ④ 포털이 정상 응답을 주나 (감시 데몬의 판단을 그대로 믿는다)
  const ka = readKeepalive(stateDir);
  if (ka?.dead === true) {
    // 'gated' 가 현행 사유다. 'no-cookie'·'expired' 는 옛 데몬이 남긴 값 — 뜻만 옮겨 적는다.
    const why =
      ka.deadReason === 'gated' || !ka.deadReason
        ? '게이트(대기열·점검·로그인 요구) 가능성'
        : `옛 사유 ${ka.deadReason}`;
    console.log(
      `포털 응답 비정상(게이트) — 오늘은 건너뛴다 (deadAt ${ka.deadAt ?? '?'} · ${why}). 알림 이슈는 감시 데몬이 이미 냈고, 응답이 정상으로 돌아오면 내일 다시 돈다.`,
    );
    process.exit(0);
  }
  if (!ka) {
    console.warn(
      `경고: ${join(stateDir, 'keepalive.json')} 가 없다 — 응답 감시 데몬이 안 도는 듯하다. 그대로 진행한다(게이트면 오케스트레이터가 이슈를 낸다).`,
    );
  } else {
    const idle = minutesSince(ka.lastCheck ?? ka.lastOk);
    if (idle > KEEPALIVE_STALE_MIN) {
      console.warn(
        `경고: 응답 감시 마지막 확인이 ${Math.round(idle)}분 전이다(> ${KEEPALIVE_STALE_MIN}분) — 데몬이 멈춘 듯하다. 그대로 진행한다.`,
      );
    }
  }

  // ⑤ 실행
  const cmdLine = `node ${ORCHESTRATOR} --target ${target} --unattended`;
  if (opts.dryRun) {
    console.log('--dry-run — 여기서 멈춘다. 실제로는 아래를 실행한다:');
    console.log(`  cwd  : ${REPO}`);
    console.log(`  실행 : ${process.execPath} ${ORCHESTRATOR} --target ${target} --unattended`);
    console.log(`  로그 : ${logFile}`);
    console.log(`  잠금 : ${lockFile}`);
    console.log(`  성공(exit 0) 하면 ${doneFile} 를 남긴다.`);
    process.exit(0);
  }

  writeFileSync(lockFile, `${JSON.stringify({ target, pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`);
  const release = () => {
    try {
      rmSync(lockFile, { force: true });
    } catch {
      /* 지우지 못해도 12시간 뒤 유물로 치워진다 */
    }
  };
  process.on('SIGINT', () => {
    release();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(143);
  });

  console.log(`실행: ${cmdLine}\n로그: ${logFile}`);
  const code = await runOrchestrator(target, logFile);
  release();
  if (code === 0) {
    writeFileSync(
      doneFile,
      `${JSON.stringify({ target, date: ymd(today), finishedAt: new Date().toISOString(), exitCode: code, log: logFile }, null, 2)}\n`,
    );
    console.log(`완료 — ${doneFile} 를 남겼다(창이 끝날 때까지 매일 no-op).`);
  } else {
    console.error(`오케스트레이터가 exit ${code} 로 끝났다 — .done 을 남기지 않는다(내일 자동으로 다시 시도한다).`);
  }
  process.exit(code);
}

// 직접 실행됐을 때만 CLI 로 동작한다(windowFor 만 import 할 수 있게).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
