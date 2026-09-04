/**
 * 정기 리마인더 — 사람이 해야 하는 갱신 작업을 때가 되면 GitHub 이슈로 띄운다.
 *
 *   node tools/automation/remind.mjs --kind semester --term 2026-21 [--dry-run]
 *   node tools/automation/remind.mjs --kind admission-calendar --year 2027 [--dry-run]
 *   node tools/automation/remind.mjs --schedule "0 0 1 12 *" [--dry-run]   # 워크플로가 쓰는 형태
 *
 * 하는 일
 *   ① `--schedule` 이면 발화한 cron 문자열로 종류(kind)와 대상(학기/학년도)을 고른다.
 *      cron 값은 .github/workflows/reminders.yml 과 아래 SCHEDULES 표가 짝이다.
 *   ② 종류에 맞는 `reminders/*.md` 템플릿을 읽어 `{{term}}`·`{{termLabel}}`·`{{year}}` 를 채운다.
 *   ③ `issue.mjs` 의 createOrComment 로 이슈를 만든다(같은 제목의 열린 이슈가 있으면 댓글).
 *
 * 종료 코드: 0 성공 · 1 인자 오류 / 모르는 cron / gh 실패
 *
 * ⚠️ 함정
 *   - **계절학기(11·21)는 마일리지 제도 밖**이다(크롤러 backfill.mjs 실측). 그래서 계절
 *     학기 템플릿은 체커 카탈로그 갱신만 담는다. 정규/계절을 같은 템플릿으로 합치지 말 것.
 *   - 학기 코드는 학사 표기 그대로다: 10 1학기 · 20 2학기 · 11 여름 · 21 겨울.
 *     `{{termLabel}}` 은 "2026학년도 겨울계절학기" 처럼 **학년도 + 학기명** 이다.
 *   - 연도는 KST 기준으로 뽑는다. 러너는 UTC 라 cron(00:00 UTC = 09:00 KST)이 연말·연초에
 *     걸릴 때 UTC 연도를 쓰면 한 해가 어긋날 수 있다.
 *
 * 의존성: 없음(Node 24 내장 + issue.mjs).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createOrComment } from './issue.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(HERE, 'reminders');
const LABEL = 'automation';

/** cron(UTC) → 무엇을 상기시킬지. 전부 09:00 KST 다. reminders.yml 의 schedule 과 짝. */
const SCHEDULES = {
  '0 0 1 12 *': { kind: 'semester', code: '21' }, // 12/1 → 겨울계절
  '0 0 15 1 *': { kind: 'semester', code: '10' }, // 1/15 → 1학기
  '0 0 1 6 *': { kind: 'semester', code: '11' }, //  6/1 → 여름계절
  '0 0 15 7 *': { kind: 'semester', code: '20' }, // 7/15 → 2학기
  '0 0 25 4 *': { kind: 'admission-calendar', yearOffset: 1 }, // 4/25 → 다음 학년도
};

const TERM_NAMES = { 10: '1학기', 20: '2학기', 11: '여름계절학기', 21: '겨울계절학기' };

const TEMPLATES = {
  regular: 'semester-regular.md',
  seasonal: 'semester-seasonal.md',
  'admission-calendar': 'admission-calendar.md',
};

/** 오늘(KST)의 연도. 러너가 UTC 라 +9h 로 옮겨서 읽는다. */
function kstYear(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key) => (key in vars ? vars[key] : whole));
}

/** 종류·대상 → { title, body } */
export function buildReminder({ kind, term, year }) {
  if (kind === 'semester') {
    const m = /^(\d{4})-(10|20|11|21)$/.exec(term ?? '');
    if (!m) throw new Error(`--term 은 YYYY-<10|20|11|21> 형식이어야 한다: ${term}`);
    const [, y, code] = m;
    const termLabel = `${y}학년도 ${TERM_NAMES[code]}`;
    const file = code === '10' || code === '20' ? TEMPLATES.regular : TEMPLATES.seasonal;
    const body = fill(readFileSync(join(TEMPLATE_DIR, file), 'utf8'), {
      term,
      termLabel,
      year: y,
    });
    return { title: `[자동] ${termLabel}(${term}) 데이터 갱신 체크리스트`, body };
  }
  if (kind === 'admission-calendar') {
    if (!/^\d{4}$/.test(String(year ?? ''))) throw new Error(`--year 는 4자리 연도여야 한다: ${year}`);
    const body = fill(readFileSync(join(TEMPLATE_DIR, TEMPLATES['admission-calendar']), 'utf8'), {
      year: String(year),
    });
    return { title: `[자동] ${year}학년도 입학 캘린더 재작성`, body };
  }
  throw new Error(`알 수 없는 --kind: ${kind} (semester | admission-calendar)`);
}

/** cron 문자열 → { kind, term?, year? } */
export function fromSchedule(cron, now = new Date()) {
  const hit = SCHEDULES[cron.trim()];
  if (!hit) {
    throw new Error(
      `모르는 cron 이다: "${cron}" — reminders.yml 의 schedule 과 remind.mjs 의 SCHEDULES 표를 맞출 것.`,
    );
  }
  const y = kstYear(now);
  if (hit.kind === 'semester') return { kind: 'semester', term: `${y}-${hit.code}` };
  return { kind: 'admission-calendar', year: String(y + hit.yearOffset) };
}

// ── CLI ────────────────────────────────────────────────────────
const USAGE = [
  '사용법:',
  '  node tools/automation/remind.mjs --kind semester --term <YYYY-10|20|11|21> [--dry-run]',
  '  node tools/automation/remind.mjs --kind admission-calendar --year <YYYY> [--dry-run]',
  '  node tools/automation/remind.mjs --schedule "<cron>" [--dry-run]',
].join('\n');

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--kind') out.kind = argv[++i];
    else if (a === '--term') out.term = argv[++i];
    else if (a === '--year') out.year = argv[++i];
    else if (a === '--schedule') out.schedule = argv[++i];
    else if (a.startsWith('--kind=')) out.kind = a.slice('--kind='.length);
    else if (a.startsWith('--term=')) out.term = a.slice('--term='.length);
    else if (a.startsWith('--year=')) out.year = a.slice('--year='.length);
    else if (a.startsWith('--schedule=')) out.schedule = a.slice('--schedule='.length);
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return out;
}

async function main() {
  let target;
  let dryRun = false;
  try {
    const opts = parseArgs(process.argv.slice(2));
    dryRun = opts.dryRun;
    if (opts.schedule) {
      // 워크플로 경로. dispatch 로 넘어온 --kind/--term 이 있으면 그쪽이 우선한다.
      target = opts.kind ? { kind: opts.kind, term: opts.term, year: opts.year } : fromSchedule(opts.schedule);
    } else if (opts.kind) {
      target = { kind: opts.kind, term: opts.term, year: opts.year };
    } else {
      throw new Error('--kind 또는 --schedule 중 하나가 필요하다.');
    }
  } catch (e) {
    console.error(`${String(e.message || e)}\n${USAGE}`);
    process.exit(1);
  }

  let issue;
  try {
    issue = buildReminder(target);
  } catch (e) {
    console.error(`${String(e.message || e)}\n${USAGE}`);
    process.exit(1);
  }

  try {
    await createOrComment({ title: issue.title, body: issue.body, label: LABEL, dryRun });
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}

// 직접 실행됐을 때만 CLI 로 동작한다.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
