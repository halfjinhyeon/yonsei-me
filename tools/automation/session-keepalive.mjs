/**
 * 수강편람 **응답 감시** 데몬 — 상시 서비스 (automation-phase3.md 1절 P3-0 · 2절 P3-3)
 *
 *   node tools/automation/session-keepalive.mjs [--interval-min 10] [--once] [--no-issue]
 *                                               [--crawler-dir <경로>] [--state-dir <경로>]
 *                                               [--exit-on-death]
 *
 * 이 데몬은 "세션 감시" 가 아니다 (2026-09-06 실측으로 전제가 뒤집혔다)
 *   수강편람 **읽기 API 는 Cookie 헤더를 아예 보내지 않아도 같은 JSON 을 돌려준다** —
 *   요약(findMlgAppcsResltList)·순위(findMlgRankResltList)·코드(findSchSlesHandbList)·
 *   과목 목록(findAtnlcHandbList) 전부 확인했고, 무효한 JSESSIONID 로도 결과가 같았다.
 *   그러므로 "JSON 대신 HTML" 은 로그인 문제가 아니라 **게이트**(수강신청 기간 NetFunnel
 *   대기열·시스템 점검·WAF 차단)로 봐야 한다. 쿠키는 그 게이트를 통과할 때만 쓰는 선택 사항이다.
 *
 * 하는 일
 *   실제 크롤이 쓰는 요약 엔드포인트를 interval 마다 **1회** 호출해(고정 키, 항상 1행)
 *   포털이 우리가 아는 모양의 JSON 을 돌려주는지 기록한다. 쿠키가 없어도 그냥 찌른다.
 *     ① 정상          `ok` — dsSles251 이 배열이면 통과 (`요약 N행`)
 *     ② 비정상 연속 2회 `dead=true, deadReason='gated'` + 이슈
 *                      `[자동] 수강편람 응답 비정상 (날짜)` (--no-issue 로 끔)
 *     ③ 게이트 감시    죽어도 **계속 같은 간격으로 찌른다**(로컬 파일만 보고 있지 않는다)
 *     ④ 정상 복귀      JSON 이 다시 오면 `resumed` — dead 를 스스로 해제한다
 *   죽어도 종료하지 않는다(작업 스케줄러가 로그온마다 띄우는 상시 서비스).
 *   옛 동작(이슈 후 exit 1)이 필요하면 `--exit-on-death`.
 *   `--once` 는 단발 점검 — 상태 파일은 읽기만 하고, ok 면 exit 0 아니면 exit 1.
 *
 * 쿠키 지문은 여전히 본다 (있을 때만)
 *   `.env` 에 쿠키가 있고 JSESSIONID 지문(앞 8자)이 바뀌면 사람이 새로 로그인해 붙여넣은
 *   것이므로 측정을 처음부터 다시 시작하고(`resumed`) 곧바로 다시 찌른다. 쿠키가 아예
 *   없어도 정상 동작이며, 그때는 지문 검사가 no-op 이다.
 *
 * 해결 이력
 *   2026-09-06: "핑 엔드포인트가 세션을 요구하지 않는다"(미해결로 적혀 있던 항목) → 읽기 API
 *   전체가 익명 접근 가능이라는 실측으로 종결. 핑을 실제 크롤 엔드포인트(요약)로 옮기고,
 *   판정의 의미를 "세션 생사" 에서 "포털 응답 정상 여부(게이트)" 로 바꿨다.
 *
 * 왜 상태 파일에 dead 를 쓰나
 *   `scheduled-update.mjs` 가 매일 03:00 에 이걸 읽어, 포털이 비정상이면 학기 갱신
 *   오케스트레이터를 헛돌리지 않고 그날은 건너뛴다(알림 이슈는 이 데몬이 이미 냈다).
 *
 * 매너
 *   시간당 6요청(10분 간격), 크롤러와 같은 UA. 학교 측 요청이 있으면 즉시 중단한다.
 *   네트워크 오류(연결 실패·HTTP 5xx)는 게이트로 세지 않고 다음 틱에 다시 본다.
 *   게이트 감시 중에도 간격은 그대로다 — 막혔다고 더 자주 찌르지 않는다.
 *
 * 출력 (기본 tools/automation/.state · `--state-dir` 로 옮긴다 — 시험은 반드시 별도 디렉터리로)
 *   keepalive.log   한 줄씩 append: <ISO시각> ok|gated|network|waiting|resumed <ms> <메시지>
 *   keepalive.json  {startedAt, lastOk, lastCheck, pings, expired, network, fingerprint,
 *                    dead, deadAt, deadReason}
 *                   ※ `expired` 는 옛 이름 그대로 둔 누적 카운터다(비정상 응답 횟수).
 *
 * 의존성: 없음. 크롤러의 src/api.js 를 그대로 import 한다(폼 인코딩·비-JSON 판정 재사용).
 * ⚠️ api.js 의 loadEnv() 는 process.cwd()/.env 를 읽으므로 크롤러 디렉터리로 chdir 한다.
 *    loadEnv() 는 **매 callApi 마다** 다시 돈다 — 그래서 .env 를 고치면 다음 핑부터 새 쿠키가
 *    저절로 쓰인다(재시작 불필요).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createOrComment } from './issue.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_DIR = join(HERE, '.state');
const DEFAULT_CRAWLER_DIR = 'C:\\Users\\aquae\\Desktop\\크롤링';

// 실제 크롤이 쓰는 요약 엔드포인트. 고정 키(고체역학 MEU2600-01 · 2026-1학기)라 정상이면
// 항상 **1행**이다 — "포털이 우리가 아는 모양의 JSON 을 주는가" 를 그대로 재는 핑.
// (api.js 가 비-JSON 을 게이트로 보고 throw 한다.)
const PING_ENDPOINT = '/sch/sles/SlessyCtr/findMlgAppcsResltList.do';
const PING_PARAMS = {
  sysinstDivCd: 'H1',
  subjtnb: 'MEU2600',
  corseDvclsNo: '01',
  prctsCorseDvclsNo: '00',
  syy: '2026',
  smtDivCd: '10',
  syySmtDivCd: '202610',
};

// ── 인자 ──
const argv = process.argv.slice(2);
const opt = { intervalMin: 10, once: false, noIssue: false, crawlerDir: null, stateDir: null, exitOnDeath: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--once') opt.once = true;
  else if (a === '--no-issue') opt.noIssue = true;
  else if (a === '--exit-on-death') opt.exitOnDeath = true;
  else if (a === '--interval-min') opt.intervalMin = Number(argv[++i]);
  else if (a === '--crawler-dir') opt.crawlerDir = argv[++i];
  else if (a === '--state-dir') opt.stateDir = argv[++i];
  else if (a === '--help' || a === '-h') {
    console.log(
      [
        '사용법: node tools/automation/session-keepalive.mjs [옵션]',
        '  --interval-min <분>   핑 간격 (기본 10, 최소 1 — 게이트 감시 중에도 같은 간격)',
        '  --once                한 번만 찔러 보고 끝낸다(상태 파일은 읽기만)',
        '  --no-issue            응답이 비정상이어도 GitHub 이슈를 만들지 않는다',
        '  --exit-on-death       옛 동작 — 비정상 판정에서 이슈를 내고 exit 1 (기본은 감시 계속)',
        '  --crawler-dir <경로>  크롤러 저장소 (기본 CRAWLER_DIR 또는 Desktop\\크롤링)',
        '  --state-dir <경로>    로그·상태 파일 위치 (기본 tools/automation/.state)',
      ].join('\n'),
    );
    process.exit(0);
  } else {
    console.error(`알 수 없는 인자: ${a}`);
    process.exit(1);
  }
}
if (!Number.isFinite(opt.intervalMin) || opt.intervalMin < 1) {
  console.error('--interval-min 은 1 이상이어야 한다 (매너: 기본 10)');
  process.exit(1);
}
// chdir 전에 절대경로로 굳힌다 — 상대 경로 --state-dir 은 저장소 기준이어야 한다.
const STATE_DIR = resolve(opt.stateDir ?? DEFAULT_STATE_DIR);
const LOG = join(STATE_DIR, 'keepalive.log');
const STATE = join(STATE_DIR, 'keepalive.json');
const CRAWLER_DIR = resolve(opt.crawlerDir ?? process.env.CRAWLER_DIR ?? DEFAULT_CRAWLER_DIR);
const API = join(CRAWLER_DIR, 'src', 'api.js');
const ENV = join(CRAWLER_DIR, '.env');
if (!existsSync(API)) {
  console.error(`크롤러 api.js 가 없다: ${API} (--crawler-dir 또는 CRAWLER_DIR)`);
  process.exit(1);
}

/** `.env` 의 YONSEI_COOKIE 원문. 파일이 없거나 항목이 없으면 ''. */
const readCookie = () =>
  existsSync(ENV) ? (readFileSync(ENV, 'utf-8').match(/^YONSEI_COOKIE=(.+)$/m)?.[1] ?? '') : '';
/** 쿠키 지문 = JSESSIONID 앞 8자. 로그·상태에 남겨도 안전한 만큼만 본다. */
const fingerprintOf = (c) => c.match(/JSESSIONID=([^;\s]{8})/)?.[1] ?? '';
/** 실제로 쓸 수 있는 쿠키인가(JSESSIONID 20자 이상). 쿠키는 선택이라 없어도 정상이다. */
const usable = (c) => /JSESSIONID=[^;\s]{20,}/.test(c);

// 쿠키가 없어도 계속 간다 — 읽기 API 는 익명으로 응답한다(2026-09-06 실측).
let cookie = readCookie();
process.chdir(CRAWLER_DIR); // api.js 의 loadEnv() 가 cwd/.env 를 읽는다
const { callApi } = await import(pathToFileURL(API).href);

// ── 상태 ──
mkdirSync(STATE_DIR, { recursive: true });
// --once 도 누적 상태를 **읽는다**(감시 기간 표시용) — 다만 아래 save() 는 --once 에서 건너뛰어
// 한 번 찔러 본 것이 데몬의 측정 시작 시각을 덮어쓰지 않게 한다(2026-09-06 실사고).
const FRESH = () => ({
  startedAt: new Date().toISOString(),
  lastOk: null,
  lastCheck: null,
  pings: 0,
  expired: 0,
  network: 0,
  dead: false,
  deadAt: null,
  deadReason: null,
});
// 옛 상태 파일에 없던 키(lastCheck·dead…)는 기본값으로 채우고, 있는 값은 그대로 이어 쓴다.
const state = existsSync(STATE) ? { ...FRESH(), ...JSON.parse(readFileSync(STATE, 'utf-8')) } : FRESH();
state.fingerprint ??= '';
/** 새 쿠키를 받았다 — 측정을 처음부터 다시 한다(사람이 새로 로그인해 붙여넣었다). */
const resetForCookie = (fp) => Object.assign(state, FRESH(), { fingerprint: fp });
// 새 쿠키로 다시 시작한 경우 측정을 처음부터 — 쿠키 지문으로 구분한다.
// 쿠키가 아예 없을 때는 지문을 지우지 않는다("무엇에서 바뀌었는지" 를 다음 비교가 봐야 한다).
if (usable(cookie)) {
  const fp = fingerprintOf(cookie);
  if (state.fingerprint && state.fingerprint !== fp) resetForCookie(fp);
  state.fingerprint = fp;
}
const save = () => {
  if (opt.once) return; // 단발 점검은 상태를 남기지 않는다(로그에는 남는다)
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
};
const log = (kind, ms, msg = '') => appendFileSync(LOG, `${new Date().toISOString()} ${kind} ${ms} ${msg}\n`);
const lifetime = () => {
  const ms = Date.now() - Date.parse(state.startedAt);
  return `${Math.floor(ms / 3600000)}시간 ${Math.floor((ms % 3600000) / 60000)}분`;
};

let consecutiveGated = 0;
/** 비정상 응답을 한 번 기록한다 — 게이트(비-JSON) 든 모양이 다른 JSON 이든 같은 취급. */
function countGated(t0, why) {
  state.expired++; // 상태 파일의 옛 키 이름을 유지한다(누적 비정상 횟수)
  consecutiveGated++;
  log('gated', Date.now() - t0, why.replace(/\s+/g, ' ').slice(0, 160));
  console.error(`${new Date().toISOString()} gated (${consecutiveGated}회 연속): ${why.split('\n')[0]}`);
  return 'gated';
}

async function ping() {
  const t0 = Date.now();
  try {
    const res = await callApi(PING_ENDPOINT, PING_PARAMS);
    const rows = res?.dsSles251;
    // JSON 이긴 한데 우리가 아는 모양이 아니면 정상으로 치지 않는다(점검 안내의 JSON 래핑 등).
    if (!Array.isArray(rows)) {
      return countGated(t0, `응답에 dsSles251 배열이 없다: ${JSON.stringify(res).slice(0, 120)}`);
    }
    state.pings++;
    state.lastOk = new Date().toISOString();
    // 정상 응답이라는 확증 — dead 는 "마지막으로 확인한 상태" 라 여기서 지운다.
    state.dead = false;
    state.deadAt = null;
    state.deadReason = null;
    consecutiveGated = 0;
    log('ok', Date.now() - t0, `요약 ${rows.length}행`);
    console.log(`${state.lastOk} ok (${Date.now() - t0}ms) · 요약 ${rows.length}행 · 감시 ${lifetime()} · 핑 ${state.pings}회`);
    return 'ok';
  } catch (err) {
    const msg = String(err?.message ?? err);
    // api.js 의 비-JSON 오류 문구와 맞물린다("… JSON 대신 HTML …", "게이트", "JSON 응답 파싱 실패").
    // 옛 문구(세션 만료·로그인)도 그대로 잡아 둔다 — 크롤러가 구버전이어도 판정이 갈리지 않게.
    if (/게이트|HTML|JSON|세션|만료|로그인/.test(msg)) return countGated(t0, msg);
    state.network++;
    log('network', Date.now() - t0, msg.replace(/\s+/g, ' ').slice(0, 160));
    console.warn(`${new Date().toISOString()} network: ${msg.split('\n')[0]} — 다음 틱에 다시 본다`);
    return 'network';
  } finally {
    state.lastCheck = new Date().toISOString();
    save();
  }
}

/** 상태 파일에 비정상을 남긴다 — scheduled-update.mjs 가 이 값을 보고 그날 실행을 건너뛴다. */
function markDead(reason) {
  state.dead = true;
  state.deadAt = new Date().toISOString();
  state.deadReason = reason; // 'gated' (옛 값 'expired'·'no-cookie' 는 더 이상 쓰지 않는다)
  state.lastCheck = state.deadAt;
  save();
}

/**
 * `.env` 의 JSESSIONID 지문이 바뀌었나 — 요청은 보내지 않고 파일만 읽는다.
 * 쿠키는 선택이지만, 사람이 게이트를 뚫으려고 새로 붙여넣었으면 그때부터 다른 세션이므로
 * 측정을 다시 시작하고(api.js 의 loadEnv 가 알아서 새 쿠키를 쓴다) 상태 파일의 지문도
 * 실제와 맞춰야 한다. 쿠키가 없으면 이 검사는 no-op 이다.
 */
function cookieChanged() {
  const now = readCookie();
  const fp = fingerprintOf(now);
  if (!usable(now) || fp === state.fingerprint) return null;
  return { cookie: now, fp, before: state.fingerprint || '없음' };
}

/** 새 쿠키를 받아들인다 — 측정 재시작 · dead 해제. */
function adoptCookie(change) {
  cookie = change.cookie;
  resetForCookie(change.fp);
  state.lastCheck = new Date().toISOString();
  save();
  log('resumed', 0, `새 쿠키 감지 ${change.before} → ${change.fp} · 측정 재시작`);
  console.log(`${state.lastCheck} resumed 새 쿠키 감지 (${change.before} → ${change.fp})`);
}

async function onDead() {
  markDead('gated');
  const summary = [
    `수강편람이 정상 JSON 을 돌려주지 않습니다 — 감시 데몬이 비정상 응답을 연속 ${consecutiveGated}회 받았습니다.`,
    '',
    `- 핑: \`${PING_ENDPOINT}\` (고정 키 MEU2600-01 · 2026-10 — 정상이면 1행)`,
    `- 데몬 시작: ${state.startedAt}`,
    `- 마지막 정상 응답: ${state.lastOk ?? '(없음 — 시작 직후부터 비정상)'}`,
    `- 감시 기간: **${lifetime()}** · 정상 핑 ${state.pings}회 · 네트워크 오류 ${state.network}회`,
    '',
    '### 이게 무슨 뜻인가',
    '읽기 API 는 쿠키 없이도 응답합니다(2026-09-06 실측). 그러니 이 알림은 "로그인이 풀렸다" 가',
    '아니라 **게이트**를 뜻할 가능성이 큽니다 — 수강신청 기간 NetFunnel 대기열, 시스템 점검,',
    'WAF 차단, 또는 예외적으로 로그인 요구.',
    '',
    '### 조치',
    '1. 브라우저로 <https://underwood1.yonsei.ac.kr> 에 접속해 **무슨 화면이 뜨는지** 확인',
    '2. 대기열·점검이면 기다린다 (아무것도 하지 않아도 됨)',
    '3. 로그인/대기열 통과가 필요하면 F12 → Network → `.do` 요청의 Cookie 전체를',
    '   크롤러 저장소 `.env` 의 `YONSEI_COOKIE=` 에 붙여넣는다 (선택 — 게이트 대비용)',
    opt.exitOnDeath
      ? '4. `node tools/automation/session-keepalive.mjs` 재시작'
      : `4. 끝. 데몬은 그대로 두면 됩니다 — ${opt.intervalMin}분마다 계속 찔러 보고, 정상 JSON 이 오면 스스로 재개합니다.`,
  ].join('\n');
  console.error(`\n[응답 비정상] 감시 ${lifetime()} — 로그: ${LOG}`);
  if (!opt.noIssue) {
    const date = new Date().toISOString().slice(0, 10);
    await createOrComment({ title: `[자동] 수강편람 응답 비정상 (${date})`, body: summary, label: 'automation', dryRun: false })
      .catch((e) => console.error(`이슈 생성 실패: ${e.message}`));
  }
}

console.log(`응답 감시 시작 — ${opt.intervalMin}분 간격 · 크롤러 ${CRAWLER_DIR} · 로그 ${LOG}`);
console.log(`쿠키 ${usable(cookie) ? `지문 ${state.fingerprint}` : '없음(선택 — 게이트 때만 필요)'} · 측정 시작 ${state.startedAt}`);
if (opt.once) {
  const r = await ping();
  process.exit(r === 'ok' ? 0 : 1);
}
process.on('SIGINT', () => {
  save();
  console.log(`\n중단 — 지금까지 감시 ${lifetime()} (정상 핑 ${state.pings}회). 상태는 ${STATE} 에 남았다.`);
  process.exit(0);
});

// 게이트로 판정된 뒤에도 **계속 찌른다** — 이 깃발은 "이슈를 이미 냈다 · 복귀를 기다린다" 표시일 뿐,
// 요청을 멈추는 스위치가 아니다(옛 버전은 .env 만 들여다보며 쉬었다).
let gated = state.dead === true;

const sleep = () => new Promise((ok) => setTimeout(ok, opt.intervalMin * 60_000));
for (;;) {
  const change = cookieChanged();
  if (change) adoptCookie(change); // 측정 재시작 · dead 해제 — 아래 핑이 곧바로 이어진다
  const r = await ping();
  if (r === 'ok' && gated) {
    gated = false;
    log('resumed', 0, '정상 JSON 복귀 — 게이트 해제');
    console.log(`${new Date().toISOString()} resumed 포털 응답이 정상으로 돌아왔다 — 감시를 이어간다.`);
  } else if (r === 'gated' && consecutiveGated >= 2 && !gated) {
    gated = true;
    await onDead();
    if (opt.exitOnDeath) process.exit(1);
    log('waiting', 0, '게이트 감시 — 정상 JSON 이 올 때까지 같은 간격으로 계속 찌른다');
    console.error(`게이트 감시로 전환 — ${opt.intervalMin}분마다 계속 찔러 보고, JSON 이 오면 스스로 재개한다.`);
  }
  await sleep();
}
