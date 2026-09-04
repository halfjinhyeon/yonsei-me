/**
 * 입학처(admission.yonsei.ac.kr) 변경 감지 — 사람이 옮겨 적어야 하는 변화를 주 1회 찾아낸다.
 *
 *   node tools/automation/admission-watch.mjs --snapshots <dir> [--years 2026,2027] \
 *        [--report <md>] [--compare-content] [--dry-run] \
 *        [--content <json>] [--patch <json>] [--translate|--translate-dry] \
 *        [--rollover] [--apply-deletions]
 *
 * 하는 일
 *   ① 신호 3종을 GET 으로 받아(EUC-KR) 정규화한 뒤 스냅샷 JSON 으로 만든다.
 *      S1 입학 캘린더  counsel/calendar.asp?s_year=<YYYY>&s_cate=  → snapshots/calendar-<YYYY>.json
 *      S2 모집요강 PDF {rolling,regular,transfer}/guide.asp       → snapshots/guide-pdf.json
 *      S3 공지 목록    {rolling,regular,transfer}/notice.asp      → snapshots/notices.json
 *   ② 직전 스냅샷과 대조해 신규·삭제·변경을 마크다운 리포트로 낸다. 이것이 "변경 감지"의 본체다.
 *   ③ `--compare-content` 면 S1 을 대응표로 우리 스키마에 사상해 `content/admission-guide.json`
 *      의 `calendar.events` 와도 비교한다(ko 만). 리포트의 "우리 캘린더와의 차이" 절.
 *   ④ `--patch <경로>` 면 그 사상 결과로 **갱신된 사본**을 그 경로에 쓴다(원본은 건드리지 않는다).
 *      워크플로가 이 사본을 `content/admission-guide.json` 에 얹어 봇 브랜치에 커밋하고 PR 을 연다.
 *      `--translate` 면 빈 `en` 을 DeepL 로 채운다(키가 없으면 `''` 로 두고 리포트에 적는다).
 *      자동 **반영**은 여전히 없다 — 머지는 사람이 한다(automation-plan.md 2절 2).
 *
 * 종료 코드: 0 변경 없음 · 10 변경 있음(**스냅샷 대조** 기준) · 1 수집 실패
 *   `--dry-run` 은 스냅샷·상태 파일을 쓰지 않는다(리포트·패치 사본은 쓴다).
 *
 * ⚠️ 함정 (전부 2026-09-04 실측)
 *   - 페이지 상단 "핫이슈" 배너에도 `span.cate`·`p.subject` 가 있다. 문서 전체를 훑으면
 *     캘린더와 무관한 16건이 섞인다 → **`table.calendarTable` 안만** 본다.
 *   - 그 표 안에는 낡은 행이 `<!-- ... -->` 로 주석 처리돼 남아 있다(2026: 6건, `[2022 재외(12년)]`
 *     따위). 브라우저에 보이지 않는 행이므로 **주석을 먼저 지운다**. 안 지우면 우리 캘린더와의
 *     차이가 영원히 6건 뜬다.
 *   - `des` 는 편집기가 뱉은 HTML 원문이라 `<p>` 중첩이 깨져 있고 인라인 style·`&nbsp;` 가 많다.
 *     정규식 태그 제거 + 엔티티 해제 + 대시 통일(`– —` → `-`)이 없으면 전 항목이 가짜 변경이 된다.
 *   - 공지 목록의 `조회수`·`iconNew.gif` 는 매번 변한다 → 버린다(태그 제거로 자연히 사라진다).
 *   - HEAD 는 WAF 가 403 으로 막는다. GET 만, 순차, 300ms 간격, 타임아웃 15s(spec 0-1 매너 규칙).
 *   - 미공표 연도는 일정 0건이 **정상**이다(2027 실측 1건). 그래서 "파싱 0건 = 실패"가 아니라
 *     "표·월 행이 없으면 실패"로 판정한다.
 *   - `--compare-content` 의 차이는 종료 코드에 넣지 않는다. 사람이 고치기 전까지 매주 같은
 *     이슈가 뜨게 되기 때문. 변경 감지는 어디까지나 스냅샷 대조다.
 *   - **패치는 JSON 을 다시 직렬화하지 않는다.** `content/admission-guide.json` 은 짧은
 *     `{ "ko": …, "en": … }` 를 한 줄로 적는 손 서식이라 `JSON.stringify(…, null, 2)` 로
 *     다시 쓰면 392줄이 554줄로 바뀌어 diff 가 파일 전체가 된다. 그래서 **원문 텍스트의
 *     해당 조각만 잘라 끼운다**(아래 `spliceJson` 계열). 바뀐 것이 없으면 결과는 바이트 동일.
 *   - 패치의 동등 판정(`patchNorm`)은 리포트의 정규화보다 **한 단계 더 관대하다**: 공백을
 *     통째로 지우고 `※`·`*` 를 같게 본다. 사이트는 `2026.2.3.`·`* 주의`, 우리는 `2026. 2. 3.`·
 *     `※ 주의` 로 적는데, 이 차이로 매주 PR 이 열리면 **우리 표기가 사이트 표기로 퇴화한다.**
 *     리포트의 "우리 캘린더와의 차이" 절은 그대로 두어(사람이 보라고) 표기 차이도 보여 준다.
 *   - 사라진 이벤트는 **지우지 않는다**(`--apply-deletions` 없이는 삭제 후보로 나열만).
 *     입학처는 지난 일정을 표에서 내리는데, 우리 캘린더는 학년도 전체를 보여 준다.
 *
 * 의존성: 없음(Node 24 내장 fetch · TextDecoder('euc-kr') · 같은 폴더의 deepl.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildGlossary,
  buildTranslationCache,
  findApiKey,
  prepareRequests,
  translateKoToEn,
} from './deepl.mjs';

// ── 상수 ────────────────────────────────────────────────────────
/** spec 0-1: `src/lib/faculty-crawl/core.ts` 의 UA 를 그대로 쓴다. */
const USER_AGENT =
  'Mozilla/5.0 (compatible; yonsei-me-site-builder/1.0; +https://me.yonsei.ac.kr/faculty/)';
const BASE = 'https://admission.yonsei.ac.kr/seoul/admission/html';
/** 디렉터리 루트(`…/html/rolling/`)는 403 이다 — 반드시 개별 .asp 를 친다. */
const calendarUrl = (year) => `${BASE}/counsel/calendar.asp?s_year=${year}&s_cate=`;
const guideUrl = (track) => `${BASE}/${track}/guide.asp`;
const noticeUrl = (track) => `${BASE}/${track}/notice.asp`;
/** S2·S3 의 트랙(입학처 메뉴 구분). 우리 스키마의 track 과는 다른 축이다. */
const PAGE_TRACKS = [
  { key: 'rolling', label: '수시' },
  { key: 'regular', label: '정시' },
  { key: 'transfer', label: '편입학' },
];
const TIMEOUT_MS = 15_000;
const DELAY_MS = 300;
const RETRY_DELAY_MS = 1_000;

/** 사이트 cate → 우리 track. 없는 것은 우리 캘린더 범위 밖(리포트에 나열만). */
const CATE_TO_TRACK = new Map([
  ['수시모집', 'susi'],
  ['재외국민', 'overseas'],
]);
/** 사이트 tag → 우리 type. 없는 것은 null 로 두고 리포트에서 사람이 고르게 한다. */
const TAG_TO_TYPE = new Map([
  ['공통', 'common'],
  ['학생부교과(추천형)', 'subject'],
  ['학생부종합전형', 'comprehensive'],
  ['논술전형', 'essay'],
  ['특기자전형', 'talent'],
]);

const EXIT_NO_CHANGE = 0;
const EXIT_CHANGED = 10;
const EXIT_FAIL = 1;

const HERE = dirname(fileURLToPath(import.meta.url));
/** tools/automation → 저장소 루트. cwd 와 무관하게 콘텐츠를 찾는다. */
const REPO_ROOT = join(HERE, '..', '..');
const CONTENT_FILE = join(REPO_ROOT, 'content', 'admission-guide.json');
/** 로컬 실행용 DeepL 키 위치. 러너에서는 Secrets → env 로 들어온다. */
const ENV_FILE = join(REPO_ROOT, '.env.local');
/** 새로 찍는 `{ "ko": …, "en": … }` 를 한 줄로 둘 최대 폭. 원본 손 서식의 중간값. */
const PRINT_WIDTH = 120;
/** 연도 전환 문턱 — 다음 학년도 일정이 이만큼 게시되면 "공표됐다"로 본다(미공표는 1건뿐). */
const ROLLOVER_MIN_EVENTS = 10;

const USAGE = `사용법: node tools/automation/admission-watch.mjs --snapshots <dir> [--years 2026,2027] [--report <md>] [--compare-content] [--dry-run] [--content <json>] [--patch <json>] [--translate|--translate-dry] [--rollover] [--apply-deletions]`;

// ── 인자 ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    years: null,
    report: null,
    compareContent: false,
    dryRun: false,
    snapshots: null,
    content: null,
    patch: null,
    translate: false,
    translateDry: false,
    rollover: false,
    applyDeletions: false,
  };
  const take = (a, i) => {
    const v = argv[i];
    if (v === undefined) throw new Error(`${a} 뒤에 값이 없다.`);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--compare-content') out.compareContent = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--translate') out.translate = true;
    else if (a === '--translate-dry') out.translateDry = true;
    else if (a === '--rollover') out.rollover = true;
    else if (a === '--apply-deletions') out.applyDeletions = true;
    else if (a === '--snapshots') out.snapshots = take(a, ++i);
    else if (a === '--report') out.report = take(a, ++i);
    else if (a === '--years') out.years = take(a, ++i);
    else if (a === '--content') out.content = take(a, ++i);
    else if (a === '--patch') out.patch = take(a, ++i);
    else if (a.startsWith('--snapshots=')) out.snapshots = a.slice('--snapshots='.length);
    else if (a.startsWith('--report=')) out.report = a.slice('--report='.length);
    else if (a.startsWith('--years=')) out.years = a.slice('--years='.length);
    else if (a.startsWith('--content=')) out.content = a.slice('--content='.length);
    else if (a.startsWith('--patch=')) out.patch = a.slice('--patch='.length);
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (!out.snapshots) throw new Error('--snapshots <dir> 이 없다.');
  // 패치는 사상 결과(우리 콘텐츠와의 대조)를 재료로 쓴다 — 따로 켤 것을 요구하지 않는다.
  if (out.patch) out.compareContent = true;
  if ((out.translate || out.translateDry) && !out.patch) {
    throw new Error('--translate / --translate-dry 는 --patch <경로> 와 함께 쓴다.');
  }
  if (out.translate && out.translateDry) throw new Error('--translate 와 --translate-dry 는 함께 쓸 수 없다.');
  // 기본 연도: 올해와 내년(입학처는 다음 학년도 일정을 미리 게시한다).
  const thisYear = new Date().getFullYear();
  const years = out.years
    ? out.years
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 2000 && n <= 2100)
    : [thisYear, thisYear + 1];
  if (years.length === 0) throw new Error(`--years 를 읽지 못했다: ${out.years}`);
  return { ...out, years };
}

// ── 수집 ────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * EUC-KR 페이지 하나를 GET 으로 받아 문자열로 돌려준다. 실패하면 1초 뒤 한 번만 재시도.
 * HTTP 200 이 아니면 throw — 호출부가 수집 실패(exit 1)로 올린다.
 */
async function fetchEucKr(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      });
      if (res.status !== 200) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      return new TextDecoder('euc-kr').decode(buf);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`요청 실패 ${url} — ${String(lastError?.message || lastError)}`);
}

// ── 정규화 ──────────────────────────────────────────────────────
const NAMED_ENTITIES = new Map([
  ['nbsp', ' '],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['ndash', '–'],
  ['mdash', '—'],
  ['middot', '·'],
  ['hellip', '…'],
  ['times', '×'],
  ['deg', '°'],
]);

/** `&nbsp;`·`&#8211;` 같은 엔티티를 실제 문자로. 모르는 것은 그대로 둔다. */
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES.get(body) ?? whole;
  });
}

/** `<!-- ... -->` 제거. 캘린더 표에 주석 처리된 낡은 행이 남아 있다(머리말 함정 참고). */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

/** 태그 통째로 제거. `des` 는 편집기 HTML 이라 파서를 쓸 값어치가 없다(spec 3절 함정). */
const stripTags = (html) => html.replace(/<[^>]*>/g, '');

/**
 * 텍스트 정규화 — 대조의 기준선. 여기서 통일하지 않으면 전 항목이 가짜 변경이 된다.
 * 엔티티 해제 → NFC → 대시 통일 → 공백류(비분리 공백 포함) 접기 → trim.
 */
export function normalizeText(raw) {
  return decodeEntities(String(raw ?? ''))
    .normalize('NFC')
    .replace(/[‐‑‒–—―−﹘﹣－]/g, '-')
    .replace(/[\s​‌‍﻿]+/g, ' ')
    .trim();
}

/** 태그를 지운 뒤 정규화. 제목처럼 한 줄인 값에 쓴다(`<br>` 은 공백이 된다). */
const textOf = (html) => normalizeText(stripTags(String(html ?? '')));

/**
 * 블록 경계(`</p>`·`<p …>`·`<br>`·`</div>`·`<li>`)를 줄바꿈으로 바꾼 뒤 줄 배열로.
 * 빈 줄은 버린다 — `<p>&nbsp;</p>` 같은 편집기 부산물이 잡음이 되지 않게.
 */
function htmlToLines(html) {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*(p|div|li|tr|table)\b[^>]*>/gi, '\n')
    .split('\n')
    .map((line) => textOf(line))
    .filter((line) => line !== '');
}

const unique = (arr) => [...new Set(arr)];
const pad2 = (n) => String(n).padStart(2, '0');
/** 여는 태그의 class 에 해당 낱말이 있는 첫 요소의 안쪽 HTML. 없으면 ''. */
function inner(html, tag, className) {
  const re = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  return re.exec(html)?.[1] ?? '';
}

// ── S1 입학 캘린더 ──────────────────────────────────────────────
/**
 * `table.calendarTable` 만 잘라 낸다. 페이지 상단 "핫이슈" 배너에도 `span.cate`·`p.subject`
 * 가 있어서 문서 전체를 훑으면 캘린더와 무관한 항목이 섞인다.
 */
function sliceCalendarTable(html) {
  const m = /<table\b[^>]*class="[^"]*\bcalendarTable\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  return m ? m[1] : null;
}

/**
 * 캘린더 표 → `{date, cate, tag, title, lines[]}[]`.
 * 월은 `th`(rowspan) 에서 상태로 이어지고, 일은 `td.day` 에서 온다.
 * @returns {{events: object[], months: number, commented: number}}
 */
export function parseCalendar(html, year) {
  const table = sliceCalendarTable(html);
  if (!table) throw new Error('table.calendarTable 을 찾지 못했다 — 마크업이 바뀌었을 수 있다.');
  const commented = [...table.matchAll(/<!--[\s\S]*?-->/g)].reduce(
    (n, m) => n + [...m[0].matchAll(/<td\b[^>]*class="[^"]*\bday\b/gi)].length,
    0,
  );
  const live = stripComments(table);
  const rows = [...live.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const events = [];
  let month = null;
  let months = 0;
  for (const row of rows) {
    const th = /<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(row);
    if (th) {
      const mm = /(\d{1,2})\s*월/.exec(textOf(th[1]));
      if (mm) {
        month = Number(mm[1]);
        months += 1;
      }
    }
    const day = /<td\b[^>]*class="[^"]*\bday\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    if (!day || month === null) continue; // 일정 없는 달은 td.none 뿐이라 여기서 걸러진다
    const dd = /(\d{1,2})/.exec(textOf(day[1]));
    if (!dd) continue;
    // 내용 칸은 날짜 칸 바로 다음 td.
    const rest = row.slice(day.index + day[0].length);
    const cell = /<td\b[^>]*>([\s\S]*?)<\/td>/i.exec(rest)?.[1];
    if (cell === undefined) continue;
    const des = /<p\b[^>]*class="[^"]*\bdes\b[^"]*"[^>]*>([\s\S]*)$/i.exec(cell)?.[1] ?? '';
    events.push({
      date: `${year}-${pad2(month)}-${pad2(Number(dd[1]))}`,
      cate: textOf(inner(cell, 'span', 'cate')),
      tag: textOf(inner(cell, 'span', 'tag')),
      title: textOf(inner(cell, 'p', 'subject')),
      lines: htmlToLines(des),
    });
  }
  if (months === 0) throw new Error('캘린더 표에 월 행이 하나도 없다 — 마크업이 바뀌었을 수 있다.');
  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));
  return { events, months, commented };
}

// ── S2 모집요강 PDF ─────────────────────────────────────────────
const DOC_EXT = /\.(pdf|hwp|hwpx|zip|doc|docx|xls|xlsx|ppt|pptx)$/i;

/**
 * 뷰어 본문은 JS 로 넘어가지만 정적 링크가 남아 있다.
 * `<a href="/seoul/upload/guide/<타임스탬프+ID>.PDF">` 와 `download.asp?furl=guide/…`.
 * 파일명(타임스탬프)이 바뀌면 새 모집요강이 올라온 것이다.
 */
export function parseGuide(html) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => decodeEntities(m[1]));
  const pdf = unique(hrefs.filter((h) => h.includes('/upload/') && DOC_EXT.test(h.split('?')[0])));
  const downloads = unique(
    hrefs
      .filter((h) => h.includes('download.asp'))
      .map((h) => /[?&]furl=([^&"']+)/i.exec(h)?.[1] ?? '')
      .filter(Boolean),
  );
  return { pdf: pdf.sort(), downloads: downloads.sort() };
}

// ── S3 공지 목록 ────────────────────────────────────────────────
/**
 * 목록 표(`table.bList`) → `{no, title, date}[]`.
 * `조회수` 는 매번 변하므로 버리고, 게시물 번호(BBS_NO)를 키로 남겨 제목 수정이
 * "신규+삭제"가 아니라 "변경"으로 보이게 한다.
 */
export function parseNotices(html) {
  const table = /<table\b[^>]*class="[^"]*\bbList\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!table) throw new Error('table.bList 를 찾지 못했다 — 마크업이 바뀌었을 수 있다.');
  const cells = [...stripComments(table[1]).matchAll(
    /<td\b[^>]*class="[^"]*\bsubject\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi,
  )].map((m) => m[1]);
  const rows = [];
  for (const cell of cells) {
    const dateSpan = cell.search(/<span\b[^>]*class="[^"]*\bdate\b/i);
    const head = dateSpan >= 0 ? cell.slice(0, dateSpan) : cell;
    const title = textOf(inner(head, 'span', 'tit')) || textOf(head);
    const d = /작성일\s*[:：]\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(textOf(cell));
    if (title === '') continue;
    rows.push({
      no: /BBS_NO=(\d+)/i.exec(cell)?.[1] ?? null,
      title,
      date: d ? `${d[1]}-${pad2(Number(d[2]))}-${pad2(Number(d[3]))}` : null,
    });
  }
  return rows;
}

// ── 스냅샷 입출력 ───────────────────────────────────────────────
const snapPath = (dir, name) => join(dir, 'snapshots', name);

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.warn(`::warning::스냅샷을 읽지 못했다(전부 신규로 본다) ${path}: ${String(e.message || e)}`);
    return null;
  }
}

/** 스냅샷은 시각을 담지 않는다 — 내용이 같으면 파일도 같아야 봇 브랜치에 잡음 커밋이 안 생긴다. */
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// ── 대조 ────────────────────────────────────────────────────────
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 키가 있는 레코드 배열 대조 → `{added, removed, changed}`. */
function diffByKey(before, after, keyOf, fields) {
  const b = new Map((before ?? []).map((x) => [keyOf(x), x]));
  const a = new Map((after ?? []).map((x) => [keyOf(x), x]));
  const added = [...a].filter(([k]) => !b.has(k)).map(([, v]) => v);
  const removed = [...b].filter(([k]) => !a.has(k)).map(([, v]) => v);
  const changed = [];
  for (const [k, av] of a) {
    const bv = b.get(k);
    if (!bv) continue;
    const diffFields = fields.filter((f) => !sameValue(bv[f], av[f]));
    if (diffFields.length > 0) changed.push({ key: k, before: bv, after: av, fields: diffFields });
  }
  return { added, removed, changed };
}

/** 문자열 배열(PDF 경로 등) 대조. */
function diffList(before, after) {
  const b = new Set(before ?? []);
  const a = new Set(after ?? []);
  return {
    added: [...a].filter((x) => !b.has(x)),
    removed: [...b].filter((x) => !a.has(x)),
    changed: [],
  };
}

const diffCount = (d) => d.added.length + d.removed.length + d.changed.length;
const calendarKey = (e) => `${e.date} ${e.title}`;
const noticeKey = (n) => (n.no ? `no:${n.no}` : `t:${n.title}`);

// ── 우리 콘텐츠와의 대조 (--compare-content) ────────────────────
/** 사이트 이벤트 → 우리 스키마(ko 만). 대응표에 없으면 track/type 이 null. */
function toOurShape(ev) {
  return {
    date: ev.date,
    track: CATE_TO_TRACK.get(ev.cate) ?? null,
    type: TAG_TO_TYPE.get(ev.tag) ?? null,
    title: ev.title,
    lines: ev.lines,
    cate: ev.cate,
    tag: ev.tag,
  };
}

/**
 * `content/admission-guide.json` 의 `calendar.events` 와 사이트 캘린더를 비교한다(ko 만).
 * 키는 날짜 + 정규화 제목. 우리 파일의 값도 같은 정규화를 거쳐야 대시·공백 차이가 가짜로 잡히지 않는다.
 */
function compareWithContent(siteEvents, contentFile = CONTENT_FILE) {
  const doc = JSON.parse(readFileSync(contentFile, 'utf8'));
  const cal = doc?.calendar;
  if (!cal || !Array.isArray(cal.events)) throw new Error('content/admission-guide.json 에 calendar.events 가 없다.');
  const ours = cal.events.map((e) => ({
    date: e.date,
    track: e.track ?? null,
    type: e.type ?? null,
    title: normalizeText(e.title?.ko ?? ''),
    lines: (e.lines ?? []).map((l) => normalizeText(l?.ko ?? '')).filter(Boolean),
  }));
  const mapped = siteEvents.map(toOurShape);
  const inScope = mapped.filter((e) => e.track !== null);
  const unmapped = mapped.filter((e) => e.track === null);

  const oursByKey = new Map(ours.map((e) => [calendarKey(e), e]));
  const siteByKey = new Map(inScope.map((e) => [calendarKey(e), e]));
  const onlyOurs = ours.filter((e) => !siteByKey.has(calendarKey(e)));
  const onlySite = inScope.filter((e) => !oursByKey.has(calendarKey(e)));
  const differing = [];
  for (const [key, site] of siteByKey) {
    const mine = oursByKey.get(key);
    if (!mine) continue;
    const fields = [];
    if (!sameValue(mine.lines, site.lines)) fields.push('lines');
    if (mine.track !== site.track) fields.push('track');
    if (site.type !== null && mine.type !== site.type) fields.push('type');
    if (fields.length > 0) differing.push({ key, mine, site, fields });
  }
  return { year: cal.year ?? null, ourCount: ours.length, siteCount: inScope.length, onlyOurs, onlySite, differing, unmapped };
}

// ── 원문 표기를 보존하는 JSON 조각 편집 (--patch) ───────────────
// `content/admission-guide.json` 은 짧은 객체를 한 줄로 적는 손 서식이다. 다시 직렬화하면
// 파일 전체가 diff 가 되므로, **원문 문자열에서 바꿀 조각의 위치만 찾아** 잘라 끼운다.
// 아래 셋(skipWs/scanString/scanValue)이 위치 계산의 전부다 — JSON 문법만 알면 되고,
// 값 자체는 `JSON.parse(원문조각)` 으로 읽는다.

const isWs = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
function skipWs(t, i) {
  while (i < t.length && isWs(t[i])) i += 1;
  return i;
}
/** `"` 로 시작하는 문자열의 끝(배타). 이스케이프를 건너뛴다. */
function scanString(t, i) {
  let j = i + 1;
  while (j < t.length) {
    if (t[j] === '\\') j += 2;
    else if (t[j] === '"') return j + 1;
    else j += 1;
  }
  throw new Error(`JSON 문자열이 닫히지 않았다(${i}).`);
}
/** t[i] 에서 시작하는 값의 끝(배타). 문자열 안의 괄호에 속지 않는다. */
function scanValue(t, i) {
  const c = t[i];
  if (c === '"') return scanString(t, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    let j = i;
    while (j < t.length) {
      const ch = t[j];
      if (ch === '"') {
        j = scanString(t, j);
        continue;
      }
      if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) return j + 1;
      }
      j += 1;
    }
    throw new Error(`JSON 괄호가 닫히지 않았다(${i}).`);
  }
  const m = /^(-?\d[\d.eE+-]*|true|false|null)/.exec(t.slice(i, i + 32));
  if (!m) throw new Error(`JSON 값을 읽지 못했다: ${JSON.stringify(t.slice(i, i + 24))}`);
  return i + m[0].length;
}

/** 객체 span 안에서 key 의 **값** span. 없으면 null. 중첩 객체는 건너뛴다. */
function memberSpan(t, span, key) {
  let i = skipWs(t, span.start + 1);
  while (i < span.end && t[i] !== '}') {
    const keyEnd = scanString(t, i);
    const name = JSON.parse(t.slice(i, keyEnd));
    const colon = skipWs(t, keyEnd);
    const vStart = skipWs(t, colon + 1);
    const vEnd = scanValue(t, vStart);
    if (name === key) return { start: vStart, end: vEnd };
    i = skipWs(t, vEnd);
    if (t[i] === ',') i = skipWs(t, i + 1);
  }
  return null;
}
/** 배열 span 안의 원소 span 목록(원문 그대로 잘라 쓰려고). */
function elementSpans(t, span) {
  const out = [];
  let i = skipWs(t, span.start + 1);
  while (i < span.end && t[i] !== ']') {
    const end = scanValue(t, i);
    out.push({ start: i, end });
    i = skipWs(t, end);
    if (t[i] === ',') i = skipWs(t, i + 1);
  }
  return out;
}
/** 루트에서 경로를 따라 값 span. 없으면 throw. */
function pathSpan(t, path) {
  const start = skipWs(t, 0);
  let span = { start, end: scanValue(t, start) };
  for (const key of path) {
    const next = memberSpan(t, span, key);
    if (!next) throw new Error(`JSON 경로를 찾지 못했다: ${path.join('.')} (${key})`);
    span = next;
  }
  return span;
}
/** 편집 목록을 **뒤에서부터** 적용한다. 앞에서부터 하면 뒤 span 의 인덱스가 밀린다. */
function applyEdits(text, edits) {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

/**
 * 배열의 구분자(여는 괄호 뒤·원소 사이·닫는 괄호 앞의 공백)를 원문에서 그대로 떠 온다.
 * 새 원소를 끼워도 들여쓰기가 원본과 같아지도록.
 */
function arrayLayout(t, span, fallbackIndent) {
  const spans = elementSpans(t, span);
  if (spans.length === 0) {
    const pad = ' '.repeat(fallbackIndent);
    return { lead: `\n${pad}`, sep: `,\n${pad}`, tail: `\n${pad.slice(0, -2)}`, spans };
  }
  const lead = t.slice(span.start + 1, spans[0].start);
  const sep = spans.length > 1 ? t.slice(spans[0].end, spans[1].start) : `,${lead}`;
  const tail = t.slice(spans[spans.length - 1].end, span.end - 1);
  return { lead, sep, tail, spans };
}
/** 원소 텍스트들을 원본 구분자로 다시 엮는다. */
const joinArray = (layout, parts) =>
  parts.length === 0 ? '[]' : `[${layout.lead}${parts.join(layout.sep)}${layout.tail}]`;

// ── 새 조각 찍기 ────────────────────────────────────────────────
const jstr = (s) => JSON.stringify(String(s ?? ''));
/** `{ "ko": …, "en": … }` — 한 줄에 들어가면 한 줄로(원본 손 서식과 같은 결). */
function printPair(pair, indent) {
  const one = `{ "ko": ${jstr(pair.ko)}, "en": ${jstr(pair.en)} }`;
  if (indent + one.length <= PRINT_WIDTH) return one;
  const pad = ' '.repeat(indent);
  return `{\n${pad}  "ko": ${jstr(pair.ko)},\n${pad}  "en": ${jstr(pair.en)}\n${pad}}`;
}
/**
 * 이벤트 하나. 첫 줄에는 들여쓰기를 붙이지 않는다 — 배열 구분자가 이미 갖고 있다.
 * 필드 순서(date/track/type/title/lines)는 원본과 같게 고정한다.
 */
function printEvent(ev, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const lines = (ev.lines ?? []).map((l) => `${inner}  ${printPair(l, indent + 4)}`);
  return [
    '{',
    `${inner}"date": ${jstr(ev.date)},`,
    `${inner}"track": ${jstr(ev.track)},`,
    `${inner}"type": ${jstr(ev.type)},`,
    `${inner}"title": ${printPair(ev.title, indent + 2)},`,
    `${inner}"lines": [`,
    ...lines.map((l, i) => (i === lines.length - 1 ? l : `${l},`)),
    `${inner}]`,
    `${pad}}`,
  ].join('\n');
}

// ── 패치 (--patch) ──────────────────────────────────────────────
/**
 * 패치 동등 판정. 리포트의 `normalizeText` 보다 한 단계 관대하다 — 공백을 통째로 지우고
 * 주석 표식(`※`·`*`)을 같게 본다. 사이트 `2026.2.3.` / 우리 `2026. 2. 3.` 같은 **표기 차이로
 * PR 이 열리면 우리 표기가 사이트 표기로 퇴화**하기 때문이다. 실제 낱말이 다를 때만 바꾼다.
 */
export function patchNorm(s) {
  return normalizeText(s).replace(/[※*]/g, '※').replace(/\s+/g, '');
}
const patchKeyOf = (date, titleKo) => `${date} ${patchNorm(titleKo)}`;
/** 파일의 이벤트 정렬 규칙(원본과 같다): 날짜 → 제목(ko). 새 이벤트를 끼울 자리를 찾는 데 쓴다. */
const eventOrder = (a, b) => a.date.localeCompare(b.date) || a.titleKo.localeCompare(b.titleKo, 'ko');

/** 이벤트 하나의 `lines` 배열만 원문 표기를 지키며 갈아 끼운다. */
function patchEventLines(raw, ourLines, siteLines, enFor) {
  const span = memberSpan(raw, { start: 0, end: raw.length }, 'lines');
  if (!span) throw new Error('이벤트에 lines 가 없다.');
  const layout = arrayLayout(raw, span, 10);
  const indent = layout.lead.slice(layout.lead.lastIndexOf('\n') + 1).length;
  const pool = layout.spans.map((s, i) => ({
    raw: raw.slice(s.start, s.end),
    ko: String(ourLines[i]?.ko ?? ''),
    used: false,
  }));
  const parts = [];
  const added = [];
  const cosmetic = [];
  for (const line of siteLines) {
    // 같은 줄을 다시 찾을 때는 관대한 판정으로 — 표기만 다르면 **우리 표기를 지킨다**.
    const hit = pool.find((p) => !p.used && patchNorm(p.ko) === patchNorm(line));
    if (hit) {
      hit.used = true;
      parts.push(hit.raw);
      if (normalizeText(hit.ko) !== normalizeText(line)) cosmetic.push({ ours: hit.ko, site: line });
      continue;
    }
    parts.push(printPair({ ko: line, en: enFor(line) }, indent));
    added.push(line);
  }
  const dropped = pool.filter((p) => !p.used).map((p) => p.ko);
  const text = joinArray(layout, parts);
  return { text, span, added, dropped, cosmetic, changed: text !== raw.slice(span.start, span.end) };
}

/**
 * 패치 본체 — 원문 텍스트에 편집 목록을 적용해 새 파일 내용을 만든다.
 * 번역 때문에 두 번 돌 수 있으므로(1회차: 번역할 문장 수집) **부작용이 없어야 한다**.
 */
function renderPatchText({ source, cal, siteEvents, targetYear, ourYear, rollover, opts, noTarget, enFor }) {
  const calSpan = pathSpan(source, ['calendar']);
  const eventsSpan = memberSpan(source, calSpan, 'events');
  if (!eventsSpan) throw new Error('calendar.events 를 찾지 못했다.');
  const layout = arrayLayout(source, eventsSpan, 6);
  const indent = layout.lead.slice(layout.lead.lastIndexOf('\n') + 1).length;
  const empty = { updated: [], added: [], deletions: [], cosmetic: [], pending: [], replaced: 0 };

  // 대상 학년도를 아예 수집하지 않았으면 아무것도 하지 않는다 — 안 그러면 전 항목이 삭제 후보가 된다.
  if (noTarget) return { text: source, ...empty, skipped: `${targetYear}학년도를 이번 수집에 넣지 않았다` };

  const asOurs = (e) => ({
    date: e.date,
    track: e.track,
    type: e.type,
    title: { ko: e.title, en: enFor(e.title) },
    lines: (e.lines ?? []).map((ko) => ({ ko, en: enFor(ko) })),
  });

  // ── 연도 전환: 이벤트를 통째로 새 학년도 것으로 바꾸고 year·intro 의 연도를 올린다 ──
  if (rollover.applied) {
    const usable = siteEvents.filter((e) => e.type !== null);
    const edits = [
      { ...eventsSpan, text: joinArray(layout, usable.map((e) => printEvent(asOurs(e), indent))) },
    ];
    const yearSpan = memberSpan(source, calSpan, 'year');
    if (yearSpan) edits.push({ ...yearSpan, text: jstr(String(targetYear)) });
    const introSpan = memberSpan(source, calSpan, 'intro');
    for (const k of ['ko', 'en']) {
      const s = introSpan ? memberSpan(source, introSpan, k) : null;
      if (!s) continue;
      const value = JSON.parse(source.slice(s.start, s.end));
      const next = value.replaceAll(String(ourYear), String(targetYear));
      if (next !== value) edits.push({ ...s, text: jstr(next) });
    }
    return {
      text: applyEdits(source, edits),
      ...empty,
      added: usable.map((e) => ({ key: patchKeyOf(e.date, e.title), date: e.date, title: e.title })),
      pending: siteEvents.filter((e) => e.type === null),
      replaced: cal.events.length,
    };
  }

  // ── 평시: 같은 키는 lines 만 갱신, 사이트에만 있는 것은 추가, 우리에만 있는 것은 삭제 후보 ──
  const ours = layout.spans.map((s) => {
    const raw = source.slice(s.start, s.end);
    const value = JSON.parse(raw);
    return { raw, value, key: patchKeyOf(value.date, value.title?.ko) };
  });
  const queue = new Map();
  for (const e of siteEvents) {
    const k = patchKeyOf(e.date, e.title);
    if (!queue.has(k)) queue.set(k, []);
    queue.get(k).push(e);
  }

  const parts = [];
  const order = [];
  const updated = [];
  const added = [];
  const deletions = [];
  const cosmetic = [];
  const pending = [];

  for (const o of ours) {
    const sortKey = { date: String(o.value.date ?? ''), titleKo: String(o.value.title?.ko ?? '') };
    const hit = queue.get(o.key)?.shift();
    if (!hit) {
      deletions.push({ key: o.key, date: sortKey.date, title: sortKey.titleKo });
      if (opts.applyDeletions) continue; // 원소를 빼는 것이 곧 삭제다
      parts.push(o.raw);
      order.push(sortKey);
      continue;
    }
    if (normalizeText(sortKey.titleKo) !== normalizeText(hit.title)) {
      cosmetic.push({ key: o.key, field: '제목', ours: sortKey.titleKo, site: hit.title });
    }
    const patched = patchEventLines(o.raw, o.value.lines ?? [], hit.lines ?? [], enFor);
    for (const c of patched.cosmetic) cosmetic.push({ key: o.key, field: '본문', ...c });
    if (patched.changed) {
      updated.push({ key: o.key, added: patched.added, dropped: patched.dropped });
      parts.push(applyEdits(o.raw, [{ start: patched.span.start, end: patched.span.end, text: patched.text }]));
    } else {
      parts.push(o.raw);
    }
    order.push(sortKey);
  }

  for (const e of [...queue.values()].flat()) {
    // 전형(tag)이 우리 type 에 대응되지 않으면 사람이 골라야 한다 — 임의로 붙이지 않는다.
    if (e.type === null) {
      pending.push(e);
      continue;
    }
    const sortKey = { date: e.date, titleKo: e.title };
    let at = order.findIndex((o) => eventOrder(o, sortKey) > 0);
    if (at < 0) at = parts.length;
    parts.splice(at, 0, printEvent(asOurs(e), indent));
    order.splice(at, 0, sortKey);
    added.push({ key: patchKeyOf(e.date, e.title), date: e.date, title: e.title });
  }

  const arrayText = joinArray(layout, parts);
  const edits = arrayText === source.slice(eventsSpan.start, eventsSpan.end) ? [] : [{ ...eventsSpan, text: arrayText }];
  return { text: applyEdits(source, edits), updated, added, deletions, cosmetic, pending, replaced: 0 };
}

/**
 * `content/admission-guide.json` 을 사이트 기준으로 갱신한 **사본 내용**을 만든다.
 * 원본 파일은 절대 건드리지 않는다(호출자가 --patch 경로에 쓴다).
 *
 * 규칙
 *   - 키 = `date + 정규화 제목`. 같은 키면 `lines` 만 사이트 값으로 갱신하고 track/type 은 우리 값 유지.
 *   - 사이트에만 있는 것(우리 범위 cate 만) → 추가. 우리에만 있는 것 → **삭제 후보로 나열만**
 *     (`--apply-deletions` 일 때만 제거).
 *   - 바뀐 줄의 `en` 은 비운다. `--translate` 면 DeepL 로 채우고, 이미 같은 ko 의 en 이 있으면 재사용.
 */
async function buildPatch({ contentFile, calendars, opts }) {
  const source = readFileSync(contentFile, 'utf8');
  const doc = JSON.parse(source);
  const cal = doc?.calendar;
  if (!cal || !Array.isArray(cal.events)) throw new Error('calendar.events 가 없다.');
  const ourYear = Number(cal.year);
  if (!Number.isInteger(ourYear)) throw new Error(`calendar.year 를 숫자로 읽지 못했다: ${cal.year}`);

  /** 연도 → 우리 범위(cate 대응됨) 사이트 이벤트. */
  const byYear = new Map(
    calendars.map((c) => [c.year, c.events.map(toOurShape).filter((e) => e.track !== null)]),
  );

  // ── 연도 전환 판정 ──
  const nextYear = ourYear + 1;
  const nextCount = byYear.has(nextYear) ? byYear.get(nextYear).length : null;
  const rollover = { requested: opts.rollover, targetYear: nextYear, count: nextCount, applied: false, reason: '' };
  if (!opts.rollover) rollover.reason = '`--rollover` 없음 — 판단하지 않았다.';
  else if (nextCount === null) rollover.reason = `${nextYear}학년도를 이번 수집에 넣지 않았다(\`--years\` 확인).`;
  else if (nextCount < ROLLOVER_MIN_EVENTS)
    rollover.reason = `${nextYear}학년도 우리 범위 ${nextCount}건 < 문턱 ${ROLLOVER_MIN_EVENTS}건 — 아직 미공표로 본다.`;
  else {
    rollover.applied = true;
    rollover.reason = `${nextYear}학년도 우리 범위 ${nextCount}건 ≥ 문턱 ${ROLLOVER_MIN_EVENTS}건 — 새 학년도로 **통째 교체**한다.`;
  }

  const targetYear = rollover.applied ? nextYear : ourYear;
  const siteEvents = byYear.get(targetYear) ?? [];
  const noTarget = !byYear.has(targetYear);

  // ── 영문: 캐시(같은 ko 의 기존 en) → 번역 → '' ──
  const cache = buildTranslationCache(cal.events);
  const glossary = buildGlossary(cal);
  const translated = new Map();
  const needed = new Set();
  const enFor = (ko) => {
    const hit = cache.get(ko);
    if (hit) return hit;
    if (translated.has(ko)) return translated.get(ko);
    needed.add(ko);
    return '';
  };

  // 렌더는 두 번 돈다 — 1회차에서 번역할 문장을 모으고, 번역한 뒤 2회차에서 실제로 채운다.
  const render = () =>
    renderPatchText({ source, cal, siteEvents, targetYear, ourYear, rollover, opts, noTarget, enFor });
  let result = render();

  const translation = { mode: 'off', needed: needed.size, filled: 0, cached: cache.size, note: '', requests: [] };
  if (opts.translateDry) {
    translation.mode = 'dry';
    const { items } = prepareRequests([...needed], { glossary });
    translation.requests = items;
    translation.note = needed.size === 0 ? '번역할 문장 없음 — 요청 0건.' : `실제 호출 없음(--translate-dry) — 요청 ${items.length}건 준비.`;
  } else if (opts.translate) {
    translation.mode = 'on';
    const apiKey = findApiKey({ envFile: ENV_FILE });
    if (!apiKey) {
      translation.note = `영문 미번역 ${needed.size}건 — DEEPL_API_KEY 없음(en 은 빈 문자열로 두었다).`;
      if (needed.size > 0) console.warn(`::warning::${translation.note}`);
    } else if (needed.size > 0) {
      try {
        const en = await translateKoToEn([...needed], {
          apiKey,
          glossary,
          onWarn: (m) => console.warn(`::warning::${m}`),
        });
        [...needed].forEach((ko, i) => {
          if (typeof en[i] === 'string' && en[i].trim() !== '') translated.set(ko, en[i]);
        });
        translation.filled = translated.size;
        translation.note =
          translated.size === needed.size
            ? `DeepL 로 ${translated.size}건 번역했다.`
            : `DeepL 로 ${translated.size}/${needed.size}건 번역했다 — 나머지는 빈 문자열.`;
        result = render(); // 채운 영문으로 다시 찍는다
      } catch (e) {
        translation.note = `번역 실패(${String(e.message || e)}) — en 은 빈 문자열로 두었다.`;
        console.warn(`::warning::${translation.note}`);
      }
    } else {
      translation.note = '번역할 문장 없음.';
    }
  } else if (needed.size > 0) {
    translation.note = `빈 영문 ${needed.size}건 — \`--translate\` 를 주지 않아 채우지 않았다.`;
  }

  return { ...result, source, rollover, translation, targetYear, noTarget, needed: [...needed] };
}

// ── 리포트 ──────────────────────────────────────────────────────
const LIST_CAP = 30; // 이슈 본문이 감당할 만큼만. 넘치면 건수만 알린다.
const SNIPPET_CAP = 25;

function capped(items, cap = LIST_CAP) {
  const shown = items.slice(0, cap);
  const rest = items.length - shown.length;
  return { shown, rest };
}

const eventLine = (e) => `\`${e.date}\` · ${e.cate || '(cate 없음)'} / ${e.tag || '(tag 없음)'} · ${e.title}`;

/** 담당자가 `content/admission-guide.json` 에 붙여 넣을 조각. en 은 사람이 채운다. */
function ourSchemaSnippet(ev) {
  const mapped = toOurShape(ev);
  const value = {
    date: mapped.date,
    track: mapped.track ?? `(미대응: ${ev.cate})`,
    type: mapped.type ?? `(미대응: ${ev.tag})`,
    title: { ko: ev.title, en: '' },
    lines: ev.lines.map((ko) => ({ ko, en: '' })),
  };
  return ['```json', JSON.stringify(value, null, 2), '```'].join('\n');
}

function renderCalendarSection(cal, diff, out) {
  out.push(
    `### ${cal.year}학년도 — 수집 ${cal.events.length}건` +
      (cal.commented > 0 ? ` (주석 처리된 낡은 행 ${cal.commented}건 제외)` : ''),
    '',
    `출처: ${cal.url}`,
    '',
  );
  if (diffCount(diff) === 0) {
    out.push('변경 없음.', '');
    return;
  }
  if (diff.added.length > 0) {
    const { shown, rest } = capped(diff.added);
    out.push(`**신규 ${diff.added.length}건**`, '');
    for (const e of shown) out.push(`- ${eventLine(e)}`);
    if (rest > 0) out.push(`- …외 ${rest}건`);
    out.push('');
  }
  if (diff.removed.length > 0) {
    const { shown, rest } = capped(diff.removed);
    out.push(`**삭제 ${diff.removed.length}건**`, '');
    for (const e of shown) out.push(`- ${eventLine(e)}`);
    if (rest > 0) out.push(`- …외 ${rest}건`);
    out.push('');
  }
  if (diff.changed.length > 0) {
    out.push(`**변경 ${diff.changed.length}건**`, '');
    for (const c of capped(diff.changed).shown) {
      out.push(`- ${eventLine(c.after)} — 바뀐 항목: ${c.fields.join(', ')}`);
      for (const f of c.fields) {
        const before = Array.isArray(c.before[f]) ? c.before[f].join(' / ') : String(c.before[f] ?? '');
        const after = Array.isArray(c.after[f]) ? c.after[f].join(' / ') : String(c.after[f] ?? '');
        out.push(`  - ${f} 이전: ${before}`);
        out.push(`  - ${f} 이후: ${after}`);
      }
    }
    out.push('');
  }
  const forPaste = [...diff.changed.map((c) => c.after), ...diff.added].filter((e) => CATE_TO_TRACK.has(e.cate));
  if (forPaste.length > 0) {
    const { shown, rest } = capped(forPaste, SNIPPET_CAP);
    out.push(`<details><summary>우리 스키마 조각 ${shown.length}건 (붙여 넣고 en 을 채운다)</summary>`, '');
    for (const e of shown) out.push(ourSchemaSnippet(e), '');
    if (rest > 0) out.push(`…외 ${rest}건은 사이트에서 직접 확인.`, '');
    out.push('</details>', '');
  }
}

function renderTrackDiff(title, url, diff, out, fmt) {
  out.push(`### ${title}`, '', `출처: ${url}`, '');
  if (diffCount(diff) === 0) {
    out.push('변경 없음.', '');
    return;
  }
  for (const [label, items] of [['신규', diff.added], ['삭제', diff.removed]]) {
    if (items.length === 0) continue;
    const { shown, rest } = capped(items);
    out.push(`**${label} ${items.length}건**`, '');
    for (const it of shown) out.push(`- ${fmt(it)}`);
    if (rest > 0) out.push(`- …외 ${rest}건`);
    out.push('');
  }
  if (diff.changed.length > 0) {
    out.push(`**변경 ${diff.changed.length}건**`, '');
    for (const c of capped(diff.changed).shown) {
      out.push(`- ${fmt(c.after)} — 바뀐 항목: ${c.fields.join(', ')}`);
      for (const f of c.fields) out.push(`  - ${f}: ${String(c.before[f] ?? '')} → ${String(c.after[f] ?? '')}`);
    }
    out.push('');
  }
}

function renderContentSection(cmp, out) {
  out.push('## 우리 캘린더와의 차이 (`content/admission-guide.json`)', '');
  out.push(
    `대상 학년도 ${cmp.year} · 우리 ${cmp.ourCount}건 vs 사이트(우리 범위) ${cmp.siteCount}건.`,
    '이 절의 차이는 **종료 코드에 반영하지 않는다** — 사람이 고칠 때까지 매주 같은 알림이 되지 않도록.',
    '',
  );
  const blocks = [
    ['우리에만 있는 항목 (사이트에 없음)', cmp.onlyOurs, (e) => `\`${e.date}\` · ${e.track}/${e.type} · ${e.title}`],
    ['사이트에만 있는 항목 (우리에 없음)', cmp.onlySite, (e) => eventLine(e)],
  ];
  for (const [label, items, fmt] of blocks) {
    out.push(`### ${label} — ${items.length}건`, '');
    if (items.length === 0) out.push('없음.', '');
    else {
      for (const e of capped(items).shown) out.push(`- ${fmt(e)}`);
      out.push('');
    }
  }
  if (cmp.onlySite.length > 0) {
    out.push('<details><summary>사이트에만 있는 항목의 우리 스키마 조각</summary>', '');
    for (const e of capped(cmp.onlySite, SNIPPET_CAP).shown) out.push(ourSchemaSnippet(e), '');
    out.push('</details>', '');
  }
  out.push(`### 같은 항목인데 내용이 다름 — ${cmp.differing.length}건`, '');
  if (cmp.differing.length === 0) out.push('없음.', '');
  for (const d of capped(cmp.differing).shown) {
    out.push(`- \`${d.key}\` — 다른 항목: ${d.fields.join(', ')}`);
    if (d.fields.includes('track') || d.fields.includes('type')) {
      out.push(`  - 우리: track=${d.mine.track}, type=${d.mine.type} / 사이트: track=${d.site.track}, type=${d.site.type}`);
    }
    if (d.fields.includes('lines')) {
      const rows = Math.max(d.mine.lines.length, d.site.lines.length);
      for (let i = 0; i < rows; i += 1) {
        const a = d.mine.lines[i] ?? '(없음)';
        const b = d.site.lines[i] ?? '(없음)';
        if (a === b) continue;
        out.push(`  - ${i + 1}행 우리: ${a}`);
        out.push(`  - ${i + 1}행 사이트: ${b}`);
      }
    }
  }
  out.push('');
  out.push(`### 미대응 항목 (우리 캘린더 범위 밖) — ${cmp.unmapped.length}건`, '');
  if (cmp.unmapped.length === 0) out.push('없음.', '');
  else {
    for (const e of capped(cmp.unmapped).shown) out.push(`- \`${e.date}\` · ${e.cate} / ${e.tag} · ${e.title}`);
    out.push('');
  }
}

/** 패치 결과 — PR 본문의 머리다. diff 가 곧 리뷰이므로 "무엇을 왜 바꿨나"만 짧게 적는다. */
function renderPatchSection(patch, opts, out) {
  const { updated, added, deletions, cosmetic, pending, rollover, translation } = patch;
  out.push('## 패치 요약 (`--patch`)', '');
  out.push(
    `\`${opts.content ?? 'content/admission-guide.json'}\` → \`${opts.patch}\` (원본은 건드리지 않는다).`,
    '',
  );
  if (patch.skipped) out.push(`**패치하지 않았다** — ${patch.skipped}.`, '');
  out.push(
    `**갱신 ${updated.length} · 추가 ${added.length} · 삭제 후보 ${deletions.length}**` +
      (patch.replaced > 0 ? ` (옛 학년도 ${patch.replaced}건은 삭제가 아니라 **통째 교체**)` : '') +
      (patch.identical ? ' — 결과가 원본과 **바이트 동일**이라 PR 을 열 것이 없다.' : ''),
    '',
    `- 연도 전환: ${rollover.reason}`,
    `- 영문: ${translation.note || '건드리지 않았다.'}`,
    cosmetic.length > 0
      ? `- 표기만 다른 줄 ${cosmetic.length}건은 **그대로 두었다** — 공백·\`※\`/\`*\` 차이로 우리 표기를 사이트 표기로 퇴화시키지 않는다.`
      : '- 표기만 다른 줄: 없음.',
    '',
  );

  const block = (title, items, fmt) => {
    out.push(`### ${title} — ${items.length}건`, '');
    if (items.length === 0) {
      out.push('없음.', '');
      return;
    }
    const { shown, rest } = capped(items);
    for (const it of shown) out.push(...[fmt(it)].flat());
    if (rest > 0) out.push(`- …외 ${rest}건`);
    out.push('');
  };

  block('갱신(기존 이벤트의 lines)', updated, (u) => [
    `- \`${u.key}\``,
    ...u.dropped.map((k) => `  - 우리 줄 삭제: ${k}`),
    ...u.added.map((k) => `  - 사이트 줄 추가: ${k} (\`en\` 은 ${translation.filled > 0 ? '번역 또는 ' : ''}빈 문자열)`),
  ]);
  block('추가(사이트에만 있던 이벤트)', added, (a) => `- \`${a.date}\` ${a.title}`);
  out.push(
    deletions.length === 0
      ? ''
      : opts.applyDeletions
        ? '`--apply-deletions` 로 아래를 **실제로 지웠다**.'
        : '아래는 **지우지 않았다** — 입학처는 지난 일정을 표에서 내리지만 우리 캘린더는 학년도 전체를 보여 준다. 정말 없어진 일정이면 `--apply-deletions` 로 다시 돌린다.',
    '',
  );
  block('삭제 후보(우리에만 있는 이벤트)', deletions, (d) => `- \`${d.date}\` ${d.title}`);
  block('추가 보류(전형 tag 가 우리 type 에 없음 — 사람이 고를 것)', pending, (p) => `- ${eventLine(p)}`);

  if (cosmetic.length > 0) {
    out.push('<details><summary>표기만 다른 줄(패치 제외)</summary>', '');
    for (const c of capped(cosmetic).shown) {
      out.push(`- \`${c.key}\` ${c.field}`, `  - 우리: ${c.ours}`, `  - 사이트: ${c.site}`);
    }
    out.push('', '</details>', '');
  }

  if (translation.mode === 'dry') {
    out.push('<details><summary>DeepL 요청 본문 (실제 호출 없음 — `--translate-dry`)</summary>', '');
    out.push(
      '`POST {api|api-free}.deepl.com/v2/translate` · `Authorization: DeepL-Auth-Key …` ·',
      '`application/x-www-form-urlencoded` · `source_lang=KO` · `target_lang=EN-US` ·',
      `한 요청에 \`text\` 를 여러 개 넣는다(요청당 최대 40건). 이번 문장 ${translation.requests.length}건.`,
      '',
    );
    for (const [i, it] of translation.requests.entries()) {
      out.push(`${i + 1}. 원문: \`${it.source}\``);
      if (it.used.length > 0) {
        out.push(`   - 치환: \`${it.text}\``);
        for (const u of it.used) out.push(`   - 용어집: \`${u.ko}\` → \`${u.token}\` → \`${u.en}\``);
      } else {
        out.push('   - 용어집 치환 없음(그대로 보낸다).');
      }
    }
    if (translation.requests.length === 0) out.push('보낼 문장이 없다.');
    out.push('', '</details>', '');
  }
}

// ── 수집 실행 ───────────────────────────────────────────────────
/** 신호 3종을 순차로 받는다. 요청 사이 300ms — 학교 서버에 대한 매너(spec 0-1). */
async function collect(years) {
  const calendars = [];
  const guides = [];
  const notices = [];
  let first = true;
  const gap = async () => {
    if (!first) await sleep(DELAY_MS);
    first = false;
  };
  for (const year of years) {
    const url = calendarUrl(year);
    await gap();
    const parsed = parseCalendar(await fetchEucKr(url), year);
    calendars.push({ year, url, events: parsed.events, commented: parsed.commented });
    console.log(`S1 캘린더 ${year}: ${parsed.events.length}건 (월 행 ${parsed.months} · 주석 행 ${parsed.commented}건 제외)`);
  }
  for (const t of PAGE_TRACKS) {
    const url = guideUrl(t.key);
    await gap();
    const g = parseGuide(await fetchEucKr(url));
    guides.push({ track: t.key, label: t.label, url, pdf: g.pdf, downloads: g.downloads });
    console.log(`S2 모집요강 ${t.key}(${t.label}): PDF ${g.pdf.length}개 · 첨부 ${g.downloads.length}개`);
  }
  for (const t of PAGE_TRACKS) {
    const url = noticeUrl(t.key);
    await gap();
    const rows = parseNotices(await fetchEucKr(url));
    notices.push({ track: t.key, label: t.label, url, notices: rows });
    console.log(`S3 공지 ${t.key}(${t.label}): ${rows.length}건`);
  }
  return { calendars, guides, notices };
}

// ── main ────────────────────────────────────────────────────────
async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${String(e.message || e)}\n${USAGE}`);
    process.exit(EXIT_FAIL);
  }

  let data;
  try {
    data = await collect(opts.years);
  } catch (e) {
    console.error(`수집 실패 — ${String(e.message || e)}`);
    process.exit(EXIT_FAIL);
  }

  const dir = opts.snapshots;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const summary = [];
  const out = [`# 입학처 변경 감지 — ${today} (KST)`, ''];
  const body = [];
  let firstRun = false;
  let changes = 0;

  // S1
  body.push('## S1 공식 입학 캘린더', '');
  for (const cal of data.calendars) {
    const path = snapPath(dir, `calendar-${cal.year}.json`);
    const prev = readJson(path);
    if (prev === null) firstRun = true;
    const diff = diffByKey(prev?.events, cal.events, calendarKey, ['cate', 'tag', 'lines']);
    changes += diffCount(diff);
    summary.push([`캘린더 ${cal.year}`, cal.events.length, diff]);
    renderCalendarSection(cal, diff, body);
    if (!opts.dryRun) writeJson(path, { year: cal.year, url: cal.url, count: cal.events.length, events: cal.events });
  }

  // S2
  body.push('## S2 모집요강 PDF', '');
  const guidePath = snapPath(dir, 'guide-pdf.json');
  const prevGuide = readJson(guidePath);
  if (prevGuide === null) firstRun = true;
  for (const g of data.guides) {
    const before = (prevGuide?.tracks ?? []).find((t) => t.track === g.track);
    const dPdf = diffList(before?.pdf, g.pdf);
    const dDown = diffList(before?.downloads, g.downloads);
    const diff = {
      added: [...dPdf.added.map((x) => `PDF ${x}`), ...dDown.added.map((x) => `첨부 ${x}`)],
      removed: [...dPdf.removed.map((x) => `PDF ${x}`), ...dDown.removed.map((x) => `첨부 ${x}`)],
      changed: [],
    };
    changes += diffCount(diff);
    summary.push([`모집요강 ${g.label}`, g.pdf.length + g.downloads.length, diff]);
    renderTrackDiff(`${g.label} (${g.track}) — PDF ${g.pdf.length}개 · 첨부 ${g.downloads.length}개`, g.url, diff, body, (x) => `\`${x}\``);
  }
  if (!opts.dryRun) writeJson(guidePath, { tracks: data.guides });

  // S3
  body.push('## S3 공지 목록', '');
  const noticePath = snapPath(dir, 'notices.json');
  const prevNotices = readJson(noticePath);
  if (prevNotices === null) firstRun = true;
  const noticeFmt = (n) => `\`${n.date ?? '날짜 없음'}\` ${n.title}${n.no ? ` (BBS_NO=${n.no})` : ''}`;
  for (const n of data.notices) {
    const before = (prevNotices?.tracks ?? []).find((t) => t.track === n.track);
    const diff = diffByKey(before?.notices, n.notices, noticeKey, ['title', 'date']);
    changes += diffCount(diff);
    summary.push([`공지 ${n.label}`, n.notices.length, diff]);
    renderTrackDiff(`${n.label} (${n.track}) — ${n.notices.length}건`, n.url, diff, body, noticeFmt);
  }
  if (!opts.dryRun) writeJson(noticePath, { tracks: data.notices });

  // 우리 콘텐츠와의 대조
  const contentFile = opts.content ?? CONTENT_FILE;
  if (opts.compareContent) {
    try {
      const doc = JSON.parse(readFileSync(contentFile, 'utf8'));
      // 우리 파일의 year 는 **문자열** "2026" 이다 — 숫자로 맞춰야 수집 연도와 만난다.
      const targetYear = Number(doc?.calendar?.year);
      const cal = Number.isInteger(targetYear) ? data.calendars.find((c) => c.year === targetYear) : null;
      if (!cal) {
        body.push('## 우리 캘린더와의 차이', '', `대상 학년도 ${targetYear} 를 이번 수집(${opts.years.join(', ')})에 넣지 않았다 — \`--years ${targetYear}\` 를 포함해서 다시 돌릴 것.`, '');
      } else {
        renderContentSection(compareWithContent(cal.events, contentFile), body);
      }
    } catch (e) {
      body.push('## 우리 캘린더와의 차이', '', `대조 실패: ${String(e.message || e)}`, '');
      console.warn(`::warning::--compare-content 대조 실패: ${String(e.message || e)}`);
    }
  }

  // 패치 사본 (--patch) — 워크플로가 이것으로 봇 브랜치·PR 을 만든다.
  let patch = null;
  if (opts.patch) {
    try {
      patch = await buildPatch({ contentFile, calendars: data.calendars, opts });
      patch.identical = patch.text === patch.source;
      mkdirSync(dirname(opts.patch), { recursive: true });
      writeFileSync(opts.patch, patch.text, 'utf8');
      renderPatchSection(patch, opts, body);
      console.log(
        `패치: ${opts.patch} — 갱신 ${patch.updated.length} · 추가 ${patch.added.length} · 삭제 후보 ${patch.deletions.length}` +
          (patch.identical ? ' (원본과 바이트 동일)' : ''),
      );
    } catch (e) {
      body.push('## 패치 요약 (`--patch`)', '', `패치 실패: ${String(e.message || e)}`, '');
      console.warn(`::warning::--patch 실패: ${String(e.message || e)}`);
    }
  }

  // 요약표
  out.push(
    firstRun
      ? '직전 스냅샷이 없다(첫 실행) — 수집한 것이 전부 "신규"로 잡힌다.'
      : changes > 0
        ? `직전 스냅샷 대비 **변경 ${changes}건**.`
        : '직전 스냅샷과 같다 — 변경 없음.',
    '',
    '| 신호 | 수집 | 신규 | 삭제 | 변경 |',
    '| --- | ---: | ---: | ---: | ---: |',
  );
  for (const [label, count, diff] of summary) {
    out.push(`| ${label} | ${count} | ${diff.added.length} | ${diff.removed.length} | ${diff.changed.length} |`);
  }
  out.push('', ...body);
  out.push(
    '---',
    '',
    patch && !patch.identical
      ? '이 리포트는 자동 생성이다. **머지는 사람이 한다** — diff 를 읽고, 빈 `en` 이 있으면 채운 뒤 머지할 것. 사이트의 disclaimer(세부 시간·장소는 변경될 수 있음)는 그대로 둔다.'
      : '이 리포트는 자동 생성이다. 반영은 사람이 한다 — 위 JSON 조각을 `content/admission-guide.json` 에 붙여 넣고 `en` 을 채운 뒤 CMS 로 저장할 것.',
  );
  const report = `${out.join('\n')}\n`;

  if (!opts.dryRun) {
    writeJson(join(dir, 'state.json'), {
      lastRun: new Date().toISOString(),
      years: opts.years,
      counts: Object.fromEntries(summary.map(([label, count]) => [label, count])),
    });
  }
  if (opts.report) {
    mkdirSync(dirname(opts.report), { recursive: true });
    writeFileSync(opts.report, report, 'utf8');
    console.log(`리포트: ${opts.report}`);
  } else {
    console.log(`\n${report}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`, 'utf8');
  }

  console.log(changes > 0 ? `변경 ${changes}건 — exit ${EXIT_CHANGED}` : `변경 없음 — exit ${EXIT_NO_CHANGE}`);
  if (opts.dryRun) console.log('--dry-run: 스냅샷·상태 파일은 쓰지 않았다.');
  process.exit(changes > 0 ? EXIT_CHANGED : EXIT_NO_CHANGE);
}

// 직접 실행됐을 때만 돈다 — 파서를 import 해서 시험할 수 있게(issue.mjs 와 같은 관례).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
