/**
 * 입학처(admission.yonsei.ac.kr) 변경 감지 — 사람이 옮겨 적어야 하는 변화를 주 1회 찾아낸다.
 *
 *   node tools/automation/admission-watch.mjs --snapshots <dir> [--years 2026,2027] \
 *        [--report <md>] [--compare-content] [--dry-run]
 *
 * 하는 일
 *   ① 신호 3종을 GET 으로 받아(EUC-KR) 정규화한 뒤 스냅샷 JSON 으로 만든다.
 *      S1 입학 캘린더  counsel/calendar.asp?s_year=<YYYY>&s_cate=  → snapshots/calendar-<YYYY>.json
 *      S2 모집요강 PDF {rolling,regular,transfer}/guide.asp       → snapshots/guide-pdf.json
 *      S3 공지 목록    {rolling,regular,transfer}/notice.asp      → snapshots/notices.json
 *   ② 직전 스냅샷과 대조해 신규·삭제·변경을 마크다운 리포트로 낸다. 이것이 "변경 감지"의 본체다.
 *   ③ `--compare-content` 면 S1 을 대응표로 우리 스키마에 사상해 `content/admission-guide.json`
 *      의 `calendar.events` 와도 비교한다(ko 만). 리포트의 "우리 캘린더와의 차이" 절.
 *   ④ 자동 반영은 하지 않는다 — 리포트의 JSON 조각을 담당자가 붙여 넣고 en 을 채운다
 *      (automation-plan.md 2절 2: 입학 정보는 사람이 확인하고 옮긴다).
 *
 * 종료 코드: 0 변경 없음 · 10 변경 있음(**스냅샷 대조** 기준) · 1 수집 실패
 *   `--dry-run` 은 스냅샷·상태 파일을 쓰지 않는다(리포트는 쓴다).
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
 *
 * 의존성: 없음(Node 24 내장 fetch · TextDecoder('euc-kr')).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const USAGE = `사용법: node tools/automation/admission-watch.mjs --snapshots <dir> [--years 2026,2027] [--report <md>] [--compare-content] [--dry-run]`;

// ── 인자 ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { years: null, report: null, compareContent: false, dryRun: false, snapshots: null };
  const take = (a, i) => {
    const v = argv[i];
    if (v === undefined) throw new Error(`${a} 뒤에 값이 없다.`);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--compare-content') out.compareContent = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--snapshots') out.snapshots = take(a, ++i);
    else if (a === '--report') out.report = take(a, ++i);
    else if (a === '--years') out.years = take(a, ++i);
    else if (a.startsWith('--snapshots=')) out.snapshots = a.slice('--snapshots='.length);
    else if (a.startsWith('--report=')) out.report = a.slice('--report='.length);
    else if (a.startsWith('--years=')) out.years = a.slice('--years='.length);
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (!out.snapshots) throw new Error('--snapshots <dir> 이 없다.');
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
function compareWithContent(siteEvents) {
  const doc = JSON.parse(readFileSync(CONTENT_FILE, 'utf8'));
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
  if (opts.compareContent) {
    try {
      const doc = JSON.parse(readFileSync(CONTENT_FILE, 'utf8'));
      // 우리 파일의 year 는 **문자열** "2026" 이다 — 숫자로 맞춰야 수집 연도와 만난다.
      const targetYear = Number(doc?.calendar?.year);
      const cal = Number.isInteger(targetYear) ? data.calendars.find((c) => c.year === targetYear) : null;
      if (!cal) {
        body.push('## 우리 캘린더와의 차이', '', `대상 학년도 ${targetYear} 를 이번 수집(${opts.years.join(', ')})에 넣지 않았다 — \`--years ${targetYear}\` 를 포함해서 다시 돌릴 것.`, '');
      } else {
        renderContentSection(compareWithContent(cal.events), body);
      }
    } catch (e) {
      body.push('## 우리 캘린더와의 차이', '', `대조 실패: ${String(e.message || e)}`, '');
      console.warn(`::warning::--compare-content 대조 실패: ${String(e.message || e)}`);
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
  out.push('---', '', '이 리포트는 자동 생성이다. 반영은 사람이 한다 — 위 JSON 조각을 `content/admission-guide.json` 에 붙여 넣고 `en` 을 채운 뒤 CMS 로 저장할 것.');
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
