/**
 * 수강편람 세션 유지 데몬 — P3-0 "세션 수명 실험" 겸 keep-alive (automation-phase3.md 1절)
 *
 *   node tools/automation/session-keepalive.mjs [--interval-min 10] [--once] [--no-issue]
 *                                               [--crawler-dir <경로>]
 *
 * 하는 일
 *   크롤러 저장소 `.env` 의 YONSEI_COOKIE 로 10분마다 가벼운 API(마일리지 학기 목록 조회) 를
 *   1회 호출해 세션이 살아 있는지 기록한다. 이것이 두 가지를 준다:
 *   ① 실험 — 사람이 아무것도 안 해도 세션이 얼마나 사는지(무활동 만료인지 절대 만료인지)를
 *      `.state/keepalive.log` 의 시각으로 잰다. 24·72시간 생존이면 "무활동 만료" 로 판정.
 *   ② 운영 — 판정이 무활동 만료면, 학기 초 로그인 1회로 학기 내내 세션을 유지할 수 있다.
 *      죽으면(세션 만료 응답 연속 2회) 수명을 찍고 이슈 `[자동] 수강편람 로그인 필요` 를 만든 뒤
 *      exit 1 — 사람이 다시 로그인해 .env 를 갱신하고 데몬을 재시작한다.
 *
 * 매너
 *   시간당 6요청(10분 간격), 크롤러와 같은 UA. 학교 측 요청이 있으면 즉시 중단한다.
 *   네트워크 오류(연결 실패·HTTP 5xx)는 세션 죽음으로 세지 않고 다음 틱에 다시 본다.
 *
 * 출력
 *   .state/keepalive.log   한 줄씩 append: <ISO시각> ok|expired|network <ms> <메시지>
 *   .state/keepalive.json  {startedAt, lastOk, pings, expired, network}
 *
 * 의존성: 없음. 크롤러의 src/api.js 를 그대로 import 한다(폼 인코딩·세션 판정 로직 재사용).
 * ⚠️ api.js 의 loadEnv() 는 process.cwd()/.env 를 읽으므로 크롤러 디렉터리로 chdir 한다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createOrComment } from './issue.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');
const LOG = join(STATE_DIR, 'keepalive.log');
const STATE = join(STATE_DIR, 'keepalive.json');
const DEFAULT_CRAWLER_DIR = 'C:\\Users\\aquae\\Desktop\\크롤링';

// 가벼운 조회 — 응답이 JSON 이면 세션이 살아 있는 것이다(api.js 가 비-JSON 을 만료로 throw).
const PING_ENDPOINT = '/sch/sles/SlessyCtr/findMlgSyySmtDivCdList.do';
const PING_PARAMS = { sysinstDivCd: 'H1', subjtnb: 'MEU2600', corseDvclsNo: '01', prctsCorseDvclsNo: '00' };

// ── 인자 ──
const argv = process.argv.slice(2);
const opt = { intervalMin: 10, once: false, noIssue: false, crawlerDir: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--once') opt.once = true;
  else if (a === '--no-issue') opt.noIssue = true;
  else if (a === '--interval-min') opt.intervalMin = Number(argv[++i]);
  else if (a === '--crawler-dir') opt.crawlerDir = argv[++i];
  else if (a === '--help' || a === '-h') {
    console.log('사용법: node tools/automation/session-keepalive.mjs [--interval-min 10] [--once] [--no-issue] [--crawler-dir <경로>]');
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
const CRAWLER_DIR = resolve(opt.crawlerDir ?? process.env.CRAWLER_DIR ?? DEFAULT_CRAWLER_DIR);
const API = join(CRAWLER_DIR, 'src', 'api.js');
const ENV = join(CRAWLER_DIR, '.env');
if (!existsSync(API)) {
  console.error(`크롤러 api.js 가 없다: ${API} (--crawler-dir 또는 CRAWLER_DIR)`);
  process.exit(1);
}
const cookie = existsSync(ENV) ? (readFileSync(ENV, 'utf-8').match(/^YONSEI_COOKIE=(.+)$/m)?.[1] ?? '') : '';
if (!/JSESSIONID=[^;\s]{20,}/.test(cookie)) {
  console.error(`${ENV} 의 YONSEI_COOKIE 에 JSESSIONID 가 없다 — 수강편람 로그인 후 쿠키를 붙여넣어라.`);
  process.exit(1);
}
process.chdir(CRAWLER_DIR); // api.js 의 loadEnv() 가 cwd/.env 를 읽는다
const { callApi } = await import(pathToFileURL(API).href);

// ── 상태 ──
mkdirSync(STATE_DIR, { recursive: true });
// --once 도 누적 상태를 **읽는다**(수명 표시용) — 다만 아래 save() 는 --once 에서 건너뛰어
// 한 번 찔러 본 것이 데몬의 측정 시작 시각을 덮어쓰지 않게 한다(2026-09-06 실사고).
const state = existsSync(STATE)
  ? JSON.parse(readFileSync(STATE, 'utf-8'))
  : { startedAt: new Date().toISOString(), lastOk: null, pings: 0, expired: 0, network: 0 };
// 새 쿠키로 다시 시작한 경우(로그인 갱신) 수명 측정을 처음부터 — 쿠키 지문으로 구분한다.
const fingerprint = cookie.match(/JSESSIONID=([^;\s]{8})/)?.[1] ?? '';
if (state.fingerprint && state.fingerprint !== fingerprint) {
  Object.assign(state, { startedAt: new Date().toISOString(), lastOk: null, pings: 0, expired: 0, network: 0 });
}
state.fingerprint = fingerprint;
const save = () => {
  if (opt.once) return; // 단발 점검은 상태를 남기지 않는다(로그에는 남는다)
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
};
const log = (kind, ms, msg = '') => appendFileSync(LOG, `${new Date().toISOString()} ${kind} ${ms} ${msg}\n`);
const lifetime = () => {
  const ms = Date.now() - Date.parse(state.startedAt);
  return `${Math.floor(ms / 3600000)}시간 ${Math.floor((ms % 3600000) / 60000)}분`;
};

let consecutiveExpired = 0;
async function ping() {
  const t0 = Date.now();
  try {
    const res = await callApi(PING_ENDPOINT, PING_PARAMS);
    const n = res?.dsSyySmtDivCd?.length ?? 0;
    state.pings++;
    state.lastOk = new Date().toISOString();
    consecutiveExpired = 0;
    log('ok', Date.now() - t0, `학기 ${n}개`);
    console.log(`${state.lastOk} ok (${Date.now() - t0}ms) · 생존 ${lifetime()} · 핑 ${state.pings}회`);
    return 'ok';
  } catch (err) {
    const msg = String(err?.message ?? err);
    const expired = /세션|만료|로그인|JSON/.test(msg);
    if (expired) {
      state.expired++;
      consecutiveExpired++;
      log('expired', Date.now() - t0, msg.replace(/\s+/g, ' ').slice(0, 120));
      console.error(`${new Date().toISOString()} expired (${consecutiveExpired}회 연속): ${msg.split('\n')[0]}`);
      return 'expired';
    }
    state.network++;
    log('network', Date.now() - t0, msg.replace(/\s+/g, ' ').slice(0, 120));
    console.warn(`${new Date().toISOString()} network: ${msg.split('\n')[0]} — 다음 틱에 다시 본다`);
    return 'network';
  } finally {
    save();
  }
}

async function onDead() {
  const summary = [
    `수강편람 세션이 끊겼습니다 — keep-alive 데몬이 세션 만료 응답을 연속 ${consecutiveExpired}회 받았습니다.`,
    '',
    `- 데몬 시작: ${state.startedAt}`,
    `- 마지막 정상 응답: ${state.lastOk ?? '(없음 — 시작 직후 만료)'}`,
    `- 세션 수명(시작 기준): **${lifetime()}** · 핑 ${state.pings}회 · 네트워크 오류 ${state.network}회`,
    '',
    '### 조치',
    '1. 수강편람(underwood1.yonsei.ac.kr)에 로그인 → F12 → Network → .do 요청의 Cookie 전체 복사',
    '2. 크롤러 저장소 `.env` 의 `YONSEI_COOKIE=` 갱신',
    '3. `node tools/automation/session-keepalive.mjs` 재시작 (새 쿠키면 수명 측정이 처음부터 시작됩니다)',
  ].join('\n');
  console.error(`\n[세션 종료] 수명 ${lifetime()} — 로그: ${LOG}`);
  if (!opt.noIssue) {
    const date = new Date().toISOString().slice(0, 10);
    await createOrComment({ title: `[자동] 수강편람 로그인 필요 (${date})`, body: summary, label: 'automation', dryRun: false })
      .catch((e) => console.error(`이슈 생성 실패: ${e.message}`));
  }
}

console.log(`keep-alive 시작 — ${opt.intervalMin}분 간격 · 크롤러 ${CRAWLER_DIR} · 로그 ${LOG}`);
console.log(`쿠키 지문 ${fingerprint}… · 측정 시작 ${state.startedAt}`);
if (opt.once) {
  const r = await ping();
  process.exit(r === 'ok' ? 0 : 1);
}
process.on('SIGINT', () => {
  save();
  console.log(`\n중단 — 지금까지 생존 ${lifetime()} (핑 ${state.pings}회). 상태는 ${STATE} 에 남았다.`);
  process.exit(0);
});
for (;;) {
  const r = await ping();
  if (r === 'expired' && consecutiveExpired >= 2) {
    await onDead();
    process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, opt.intervalMin * 60_000));
}
