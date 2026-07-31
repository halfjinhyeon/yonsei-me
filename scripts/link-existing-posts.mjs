// 손으로 옮긴 posts 행 ↔ 원본 기사 연결 스크립트 (백엔드 전환 Phase 3 준비).
// 실행: node scripts/link-existing-posts.mjs            ← 기본은 드라이런(읽기만)
//       node scripts/link-existing-posts.mjs --apply    ← 실제 UPDATE
//       node scripts/link-existing-posts.mjs --apply --from-report tools/link-report.json
//
// 왜 필요한가
//   운영 DB 의 53건은 사용자가 손으로 옮긴 것이다. 그중 45건은 me.yonsei.ac.kr 원본이 있고
//   8건(alumniNews 3 · alumniEvents 4 · calendar 1)은 원본 없는 창작 콘텐츠다. 손 이전분에는
//   두 가지 문제가 있다.
//     ① 게시일이 틀렸다 — 하루 밀린 것, 입력일이 그대로 박힌 것, 행사일이 게시일 칸에 들어간 것.
//     ② 원본 링크(source_url)가 없다 → 일괄 임포터가 같은 글을 중복 적재한다.
//   이 스크립트가 원본을 찾아 source_url 을 채우고 created_at 을 바로잡는다. 임포터는
//   source_url 을 키로 이 45건을 건너뛴다.
//
// 절대 건드리지 않는 것
//   title_ko / body_html_* / excerpt_* / thumbnail_url / attachments / category / host_* —
//   전부 사용자의 손 작업이고, 생성물보다 품질이 높다(뉴스 7건은 영문 번역과 R2 이미지까지 손으로 넣었다).
//   events·seminars 의 event_date 도 그대로 둔다. 행사일은 게시일과 다른, 그 자체로 맞는 사실이다.
//   쓰는 컬럼은 source_url 과 created_at 두 개뿐이다.
//
// 위험한 건 "날짜 차이"가 아니라 "후보의 모호함"이다
//   원본에는 제목이 같은 글이 아주 많다(공고가 해마다 반복된다). 예: `4단계 BK21사업 신진연구인력
//   채용 공고` 는 후보가 11건이고 연도가 제각각이다. 제목만 보고 고르면 2026년 글에 2021년 기사가
//   붙는다 — 실제로 그렇게 붙었다.
//   반대로 후보가 하나뿐이면 날짜가 20일 어긋나 있어도 그 매칭은 확실하다. 그 20일이 바로 우리가
//   고치려는 오류다 — 크다고 미루면 틀린 날짜를 그대로 남기는 꼴이 된다. 그래서 `review` 는
//   오직 **후보가 2건 이상일 때만** 붙는다. 날짜 차이는 크게 찍어 주되 위험 신호로 쓰지 않는다.
//
//   후보가 여럿이면 본문으로 가른다. 후보마다 상세 페이지의 `fr-view` 본문을 받아 태그를 걷고
//   앞 1500자를 바이그램 Sørensen–Dice 로 DB 본문과 비교한다. 다만 해마다 반복되는 공고는 본문도
//   96~98%로 닮아 있어서(실측) 본문만으로는 못 가른다 — **본문 1위와 날짜 최근접이 같은 글을
//   가리킬 때만** 자동 채택한다(matchedBy: title+date+body). 두 신호가 어긋나면 `review` 로 두고
//   양쪽 순위를 다 찍어 사람이 고르게 한다. 독립된 두 신호의 합치가 자동화의 근거다.
//
// 의존성: Node 24 내장 fetch + 정규식만 쓴다(cheerio 등 설치 금지 — 집안 규칙).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// tools/boards-raw/ 는 크롤러의 게시판 스냅샷 전용이다 — import-boards.mjs 가 그 폴더를 훑어
// 게시판 키로 해석하므로, 여기 산출물을 두면 매 실행마다 "알 수 없는 게시판 키" 경고가 뜬다.
const REPORT_PATH = join(ROOT, 'tools', 'link-report.json');
/** 후보 본문 캐시 — 재실행 때 상세 페이지를 다시 받지 않는다(둘 다 개발 로컬 산출물). */
const BODY_CACHE_PATH = join(ROOT, 'tools', 'link-body-cache.json');

// ── .env.local 로더 (scripts/migrate-boards.mjs 와 동일) ──
if (existsSync(join(ROOT, '.env.local'))) {
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

// ── CLI ──
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, fallback = null) => {
  const i = argv.findIndex((a) => a === f || a.startsWith(`${f}=`));
  if (i < 0) return fallback;
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

if (has('--help') || has('-h')) {
  console.log(`사용법: node scripts/link-existing-posts.mjs [옵션]

  (옵션 없음)          드라이런. 원본을 긁어 매칭 결과만 출력하고 JSON 리포트를 쓴다.
  --apply              accept 건을 실제로 UPDATE 한다(source_url, created_at 만).
  --accept-review      review 건도 대상에 포함한다(기본 제외).
  --from-report [경로] 크롤링을 건너뛰고 JSON 리포트의 결정을 그대로 쓴다.
                       (기본 경로: tools/link-report.json)
                       리포트에서 decision 을 "accept" 로 고쳐 두면 그 건이 반영된다.
  --help               이 도움말.`);
  process.exit(0);
}

const APPLY = has('--apply');
const ACCEPT_REVIEW = has('--accept-review');
const FROM_REPORT = has('--from-report') ? valueOf('--from-report', REPORT_PATH) : null;

// ── 원본 게시판 지도 ─────────────────────────────────────────────
// 목록 한 번에 전부 받는다: ?mode=list&articleLimit=2000&article.offset=0 (GET 만 — HEAD 는 403).
// expect 는 실측 행수. 크게 어긋나면 파서가 깨진 것이다(0 이면 확실히 깨졌다).
const BASE = 'https://me.yonsei.ac.kr/me/community';
const BOARD_SOURCES = {
  noticesUndergrad: { path: 'notice', kind: 'table', expect: 732 },
  noticesGraduate: { path: 'notice2', kind: 'table', expect: 618 },
  noticesExternal: { path: 'notice3', kind: 'table', expect: 170 },
  noticesScholarship: { path: 'notice4', kind: 'table', expect: 215 },
  news: { path: 'news', kind: 'gallery', expect: 283 },
  thesis: { path: 'degree_thesis_review', kind: 'table', expect: 150 },
  resources: { path: 'information', kind: 'table', expect: 7 },
  career: { path: 'job', kind: 'table', expect: 936 },
  events: { path: 'seminar_graduate1', kind: 'table', expect: 39 },
  seminars: { path: 'seminar', kind: 'table', expect: 378 },
};
/** 원본이 없는 창작 콘텐츠 — 매칭 대상에서 아예 뺀다. */
const SKIP_BOARDS = new Set(['alumniNews', 'alumniEvents', 'calendar', 'instagram', 'internships']);

const DELAY_MS = 350;
const TIMEOUT_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 목록의 제목은 120자에서 잘린다(실측: seminar.do 378건 중 55건이 정확히 120자, 어느 게시판도
 * 120자를 넘지 않는다). 잘린 제목은 DB 제목과 글자 그대로는 절대 같아질 수 없으므로 —
 *   `… "Robotic Machining and Mechatronics for Intelligent Manu`  ← 여기서 끊긴다
 * 정확 일치에 실패한 건에 한해 "잘린 원본 제목이 DB 제목의 접두사인가"로 한 번 더 본다.
 * 정규화는 글자를 지우거나 소문자로 바꾸기만 하므로 접두사 관계가 그대로 보존된다.
 */
const TITLE_CAP = 120;

// ── HTML 유틸 ────────────────────────────────────────────────────
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const text = (html) =>
  decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 제목 정규화. 따옴표 처리가 핵심이다 — 세미나 제목 3건이 `"` / `&quot;` / 둥근따옴표 때문에
 * 매칭에 실패했다. 구두점을 통째로 걷어내면 그 계열이 전부 사라진다.
 */
function normTitle(s) {
  return decodeEntities(s)
    .normalize('NFC')
    .replace(/\[공지\]/g, '')
    .replace(/\s+/g, '')
    .replace(/[.,·・()[\]{}「」〈〉<>~〜–—\-_:;/'"“”‘’!?]/g, '')
    .toLowerCase();
}

/** 원본 목록 URL 은 이걸로 만들고, 저장하는 source_url 은 canonical() 짧은 형태만 쓴다. */
const listUrl = (path) => `${BASE}/${path}.do?mode=list&articleLimit=2000&article.offset=0`;
/** DB unique 키라 바이트 단위로 안정적이어야 한다 — offset/limit 붙이지 않는다. */
const canonical = (path, articleNo) => `${BASE}/${path}.do?mode=view&articleNo=${articleNo}`;

async function get(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; yonsei-me-site-builder/1.0; +https://me.yonsei.ac.kr/me/community/)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── 목록 파서 ────────────────────────────────────────────────────
/**
 * 표형 목록 9종.
 * ⚠️ 제목 앵커는 `<a href="…" class="c-board-title">` — href 가 class 보다 **앞에** 온다.
 *    `<a[^>]*class="c-board-title"[^>]*href=` 로 쓰면 한 건도 안 잡힌다(실제로 0/9 를 겪었다).
 *    그래서 여는 태그를 먼저 잡고 속성을 들여다보는 방식으로 쓴다.
 * ⚠️ 날짜는 반드시 `<div class="c-board-info-m">` 안의 span 중 **통째로 20YY.MM.DD 인 것**만 쓴다.
 *    "행 안의 첫 번째 날짜"를 긁으면 제목에 박힌 날짜를 집어온다 — `(~7/12(일)까지)`,
 *    `[7/20~7/24]` 처럼 제목이 날짜를 달고 다니는 글이 흔하다. 맨 끝 <td> 의 날짜는 2자리 연도라
 *    역시 쓰지 않는다.
 * 상단 고정행(`<tr class="c-board-top-wrap">`)의 `[공지]` 배지는 제목에서 떼어낸다.
 */
function parseTableList(html) {
  const tbody = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbody) return [];
  const rows = [];
  for (const m of tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1];
    let anchor = null;
    for (const a of row.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (/class="[^"]*\bc-board-title\b[^"]*"/i.test(a[1])) {
        anchor = a;
        break;
      }
    }
    if (!anchor) continue;
    const href = decodeEntities((anchor[1].match(/href="([^"]*)"/i) || [])[1] || '');
    const articleNo = (href.match(/articleNo=(\d+)/) || [])[1];
    if (!articleNo) continue;

    const title = text(anchor[2].replace(/<span class="c-board-top-num-m">[\s\S]*?<\/span>/gi, ''));
    const info = row.match(/<div class="c-board-info-m">([\s\S]*?)<\/div>/i);
    let date = null;
    if (info) {
      for (const s of info[1].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)) {
        const d = text(s[1]).match(/^(20\d\d)\.(\d\d)\.(\d\d)$/);
        if (d) {
          date = `${d[1]}-${d[2]}-${d[3]}`;
          break;
        }
      }
    }
    if (!title || !date) continue;
    rows.push({ articleNo, title, date });
  }
  return rows;
}

/**
 * 뉴스 갤러리(news.do 전용).
 * ⚠️ `<li>` 안에 `<ul><li>` 가 중첩돼 있어 `<li>…</li>` 비탐욕 매칭으로는 행을 못 자른다.
 *    행 머리표지인 `<span class="board-list-num">` 으로 쪼갠다.
 * ⚠️ 뉴스 제목은 거의 다 성과·행사 날짜를 괄호로 달고 있다 —
 *      `'2026 인공지능 여름학교' 연세대학교에서 성황리 개최 (2026.07.15)`
 *    그래서 "<li> 안의 첫 날짜"를 긁으면 **게시일이 아니라 그 성과일**이 잡힌다. 그 값으로
 *    created_at 을 고치면 멀쩡한 뉴스 7건이 52~83일씩 과거로 밀려난다 — 고치는 게 아니라 망가뜨린다.
 *    게시일의 진실은 오직 `<span class="board-list-content-date">` 다(283건에 83개의 서로 다른
 *    날짜가 들어 있는 진짜 타임라인이다). 제목 표기일은 여기서 읽지 않는다.
 */
function parseGalleryList(html) {
  const start = html.indexOf('<ul class="board-list-wrap"');
  if (start < 0) return [];
  const chunks = html.slice(start).split(/<span class="board-list-num">/).slice(1);
  const rows = [];
  for (const chunk of chunks) {
    const dt = chunk.match(/<dt class="board-list-content-title">([\s\S]*?)<\/dt>/i);
    if (!dt) continue;
    const a = dt[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const href = decodeEntities((a[1].match(/href="([^"]*)"/i) || [])[1] || '');
    const articleNo = (href.match(/articleNo=(\d+)/) || [])[1];
    if (!articleNo) continue;

    const title = text(a[2]);
    const posted = chunk.match(/<span class="board-list-content-date">([\s\S]*?)<\/span>/i);
    const pd = posted ? text(posted[1]).match(/^(20\d\d)\.(\d\d)\.(\d\d)$/) : null;
    const date = pd ? `${pd[1]}-${pd[2]}-${pd[3]}` : null;
    if (!title || !date) continue;
    rows.push({ articleNo, title, date });
  }
  return rows;
}

// ── 본문 유사도 ──────────────────────────────────────────────────
/** 상세 페이지의 본문 컨테이너. <div> 가 중첩돼 있어 깊이를 세며 닫는 지점을 찾는다. */
function extractFrView(html) {
  const open = html.match(/<div[^>]*class="[^"]*\bfr-view\b[^"]*"[^>]*>/i);
  if (!open) return null;
  const start = open.index + open[0].length;
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0].toLowerCase() === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start);
}

/** 태그를 걷고 공백을 지운 뒤 앞 1500자. DB 본문(body_html_ko)도 똑같이 줄여서 비교한다. */
function bodyKey(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, '')
    .toLowerCase()
    .slice(0, 1500);
}

/** 바이그램 Sørensen–Dice. 0(무관) ~ 1(동일). */
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  let total = 0;
  for (const [g, c] of A) {
    total += c;
    if (B.has(g)) inter += Math.min(c, B.get(g));
  }
  for (const c of B.values()) total += c;
  return total ? (2 * inter) / total : 0;
}

const bodyCache = existsSync(BODY_CACHE_PATH) ? JSON.parse(readFileSync(BODY_CACHE_PATH, 'utf8')) : {};
let bodyCacheDirty = false;
let bodyFetches = 0;

/** 후보 본문(줄인 형태)을 받아 온다. 캐시에 있으면 네트워크를 타지 않는다. */
async function sourceBody(path, articleNo) {
  const key = `${path}:${articleNo}`;
  if (key in bodyCache) return bodyCache[key];
  let reduced = '';
  try {
    reduced = bodyKey(extractFrView(await get(canonical(path, articleNo))));
  } catch (e) {
    console.warn(`  ⚠️ 본문 수집 실패 ${key}: ${e.message}`);
  }
  bodyCache[key] = reduced;
  bodyCacheDirty = true;
  bodyFetches += 1;
  await sleep(DELAY_MS);
  return reduced;
}

// ── 날짜 유틸 ────────────────────────────────────────────────────
/**
 * ⚠️ created_at 은 timestamptz 다. PostgREST 가 `2026-06-11T15:00:00+00:00` (UTC) 로 돌려주므로
 *    String(...).slice(0,10) 하면 하루 앞당겨진 날짜가 나온다 — 있지도 않은 off-by-one 을
 *    만들어낸다. 반드시 KST 로 환산해서 비교한다.
 *    (같은 함정 설명이 src/lib/admin/posts-server.ts 의 rowToEditRecord 주석에도 있다.)
 */
const KST_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const kstDate = (v) => (v ? KST_FMT.format(new Date(v)) : null);
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const ts = (date) => `${date}T00:00:00+09:00`;

// ── DB 읽기 ──────────────────────────────────────────────────────
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let hasSourceUrlColumn = true;
let dbRows = [];
{
  const full = await sb.from('posts').select('id, board, title_ko, created_at, event_date, body_html_ko, source_url');
  if (full.error && /source_url/.test(full.error.message)) {
    // 스키마 마이그레이션(scripts/sql/schema.sql 의 `alter table posts add column … source_url`)이
    // 아직 안 돈 DB. 드라이런은 그대로 돌리고, --apply 만 막는다.
    hasSourceUrlColumn = false;
    const partial = await sb.from('posts').select('id, board, title_ko, created_at, event_date, body_html_ko');
    if (partial.error) {
      console.error('posts 조회 실패:', partial.error.message);
      process.exit(1);
    }
    dbRows = partial.data.map((r) => ({ ...r, source_url: null }));
  } else if (full.error) {
    console.error('posts 조회 실패:', full.error.message);
    process.exit(1);
  } else {
    dbRows = full.data;
  }
}

const targets = dbRows
  .filter((r) => !SKIP_BOARDS.has(r.board))
  .filter((r) => {
    if (BOARD_SOURCES[r.board]) return true;
    console.warn(`⚠️  원본 매핑이 없는 게시판 — 건너뜀: ${r.board} / ${r.title_ko}`);
    return false;
  });

console.log(
  `DB posts ${dbRows.length}건 · 원본 대조 대상 ${targets.length}건 · ` +
    `원본 없는 창작분 ${dbRows.length - targets.length}건 제외` +
    (hasSourceUrlColumn ? '' : '  ⚠️ source_url 컬럼 없음(마이그레이션 미적용)'),
);
console.log('');

// ── 원본 수집 ────────────────────────────────────────────────────
/** board → { rows, byTitle: Map<normTitle, rows[]> } */
const index = new Map();

async function crawl() {
  const boards = [...new Set(targets.map((r) => r.board))].sort();
  console.log(`원본 목록 수집 (${boards.length}개 게시판 · 요청 간 ${DELAY_MS}ms 지연)`);
  for (const board of boards) {
    const src = BOARD_SOURCES[board];
    let rows = [];
    try {
      const html = await get(listUrl(src.path));
      rows = src.kind === 'gallery' ? parseGalleryList(html) : parseTableList(html);
    } catch (e) {
      console.error(`  ✖ ${board} (${src.path}.do) 수집 실패: ${e.message}`);
      process.exit(1);
    }
    // 상단 고정행은 목록에 한 번 더 나온다 — articleNo 기준으로 중복을 접는다.
    const seen = new Set();
    const unique = rows.filter((r) => (seen.has(r.articleNo) ? false : (seen.add(r.articleNo), true)));
    const byTitle = new Map();
    for (const r of unique) {
      const k = normTitle(r.title);
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push(r);
    }
    // 120자에서 잘린 제목들 — 정확 일치가 실패했을 때 접두사로 다시 본다.
    const truncated = unique
      .filter((r) => r.title.length >= TITLE_CAP)
      .map((r) => ({ ...r, norm: normTitle(r.title) }));
    index.set(board, { rows: unique, byTitle, truncated });

    const dupGroups = [...byTitle.values()].filter((v) => v.length > 1);
    const flag = unique.length === 0 ? '  ✖ 0건 — 파서 깨짐' : Math.abs(unique.length - src.expect) > 20 ? `  ⚠️ 실측 ${src.expect} 과 차이` : '';
    console.log(
      `  ${board.padEnd(18)} ${src.path}.do`.padEnd(48) +
        `${String(unique.length).padStart(4)}건` +
        (rows.length !== unique.length ? ` (고정행 중복 ${rows.length - unique.length} 접음)` : '') +
        `  동일제목군 ${dupGroups.length}` +
        flag,
    );
    await sleep(DELAY_MS);
  }
  const allDup = [...index.values()].flatMap(({ byTitle }) => [...byTitle.values()].filter((v) => v.length > 1));
  console.log(
    `\n동일 제목군 ${allDup.length}개 · 해당 원본글 ${allDup.reduce((n, v) => n + v.length, 0)}건 ` +
      `— 공고가 해마다 반복돼서다. 여기 걸리면 자동 반영하지 않는다.\n`,
  );
}

// ── 매칭 ─────────────────────────────────────────────────────────
async function decide(post) {
  const board = post.board;
  const src = BOARD_SOURCES[board];
  const dbDate = kstDate(post.created_at);
  const key = normTitle(post.title_ko ?? '');
  let cands = index.get(board)?.byTitle.get(key) ?? [];
  let titleMatch = 'exact';
  if (cands.length === 0) {
    // 잘린 제목 되살리기. 접두사 길이가 100자를 넘으므로 우연히 걸릴 여지는 없다.
    const pre = (index.get(board)?.truncated ?? []).filter((r) => r.norm && key.startsWith(r.norm));
    if (pre.length > 0) {
      cands = pre;
      titleMatch = 'prefix';
    }
  }

  const base = {
    titleMatch: cands.length === 0 ? null : titleMatch,
    postId: post.id,
    board,
    title: post.title_ko,
    dbDate,
    eventDate: post.event_date ?? null,
    existingSourceUrl: post.source_url ?? null,
    candidates: cands.map((c) => ({
      articleNo: c.articleNo,
      date: c.date,
      title: c.title,
      url: canonical(src.path, c.articleNo),
    })),
  };

  if (cands.length === 0) return { ...base, decision: 'unmatched', reason: '원본에 같은 제목 없음' };

  // 날짜 최근접 후보.
  let dateBest = cands[0];
  for (const c of cands) {
    if (Math.abs(dayDiff(c.date, dbDate)) < Math.abs(dayDiff(dateBest.date, dbDate))) dateBest = c;
  }
  const pick = (c) => ({
    ...base,
    articleNo: c.articleNo,
    sourceDate: c.date,
    sourceTitle: c.title,
    sourceUrl: canonical(src.path, c.articleNo),
    deltaDays: dayDiff(dbDate, c.date),
  });

  // 후보가 하나면 그걸로 끝이다. 날짜가 얼마나 벌어졌든 매칭 자체는 확실하다.
  if (cands.length === 1) {
    return {
      ...pick(dateBest),
      decision: 'accept',
      matchedBy: 'title',
      reason: titleMatch === 'prefix' ? '제목 유일 일치(120자 잘림 접두사)' : '제목 유일 일치',
    };
  }

  // 후보가 여럿 → 본문 유사도로 가른다.
  const dbBody = bodyKey(post.body_html_ko);
  const ranking = [];
  for (const c of cands) {
    ranking.push({
      articleNo: c.articleNo,
      date: c.date,
      url: canonical(src.path, c.articleNo),
      score: dbBody ? dice(dbBody, await sourceBody(src.path, c.articleNo)) : 0,
    });
  }
  ranking.sort((a, b) => b.score - a.score);
  const bodyBest = ranking[0];
  const withRank = (e) => ({ ...e, ranking, dateNearest: dateBest.articleNo, bodyBest: bodyBest.articleNo });

  if (!dbBody) {
    return withRank({ ...pick(dateBest), decision: 'review', reason: `동일 제목 후보 ${cands.length}건 — DB 본문이 비어 대조 불가` });
  }
  if (bodyBest.score <= 0) {
    return withRank({ ...pick(dateBest), decision: 'review', reason: `동일 제목 후보 ${cands.length}건 — 원본 본문을 못 읽었다` });
  }
  // 독립된 두 신호(날짜·본문)가 같은 글을 가리킬 때만 자동 채택한다.
  if (bodyBest.articleNo !== dateBest.articleNo) {
    return withRank({
      ...pick(dateBest),
      decision: 'review',
      reason:
        `동일 제목 후보 ${cands.length}건 — 본문 1위(#${bodyBest.articleNo})와 ` +
        `날짜 최근접(#${dateBest.articleNo})이 어긋난다`,
    });
  }
  return withRank({
    ...pick(dateBest),
    decision: 'accept',
    matchedBy: 'title+date+body',
    reason: `동일 제목 후보 ${cands.length}건 — 본문 ${(bodyBest.score * 100).toFixed(1)}% 1위와 날짜 최근접이 일치`,
  });
}

// ── 리포트 출력 ──────────────────────────────────────────────────
const ORDER = { accept: 0, review: 1, unmatched: 2 };
const LABEL = { accept: '[accept]', review: '[review]', unmatched: '[unmatch]' };

function printEntry(e) {
  const head = `${LABEL[e.decision].padEnd(10)}${e.board.padEnd(19)}`;
  if (e.decision === 'unmatched') {
    console.log(`${head}${e.dbDate} → ?           ${e.title}`);
    console.log(`${' '.repeat(29)}${e.reason}`);
    return;
  }
  const move = e.dbDate === e.sourceDate ? `${e.dbDate} (변경 없음)` : `${e.dbDate} → ${e.sourceDate}`;
  console.log(`${head}${move}  (Δ${Math.abs(e.deltaDays)})  ${e.title}`);
  console.log(`${' '.repeat(29)}${e.sourceUrl}`);
  if (e.titleMatch === 'prefix') {
    console.log(`${' '.repeat(29)}원본 목록 제목이 120자에서 잘려 접두사로 일치: 「${e.sourceTitle}」`);
  }
  if (e.candidates.length > 1) {
    console.log(`${' '.repeat(29)}${e.reason}`);
    const rank = e.ranking ?? [];
    for (const c of rank.slice(0, 8)) {
      const mark = c.articleNo === e.articleNo ? '★' : ' ';
      const tag =
        [c.articleNo === e.bodyBest ? '본문1위' : null, c.articleNo === e.dateNearest ? '날짜최근접' : null]
          .filter(Boolean)
          .join('·');
      console.log(
        `${' '.repeat(31)}${mark} ${(c.score * 100).toFixed(1).padStart(5)}%  ${c.date}  #${c.articleNo}` +
          (tag ? `  ← ${tag}` : ''),
      );
    }
    if (rank.length > 8) console.log(`${' '.repeat(31)}  … 외 ${rank.length - 8}건`);
  }
  if (e.eventDate) console.log(`${' '.repeat(29)}event_date ${e.eventDate} — 건드리지 않는다`);
}

// ── 실행 ─────────────────────────────────────────────────────────
let entries;

if (FROM_REPORT) {
  if (!existsSync(FROM_REPORT)) {
    console.error(`리포트 파일이 없다: ${FROM_REPORT}`);
    process.exit(1);
  }
  const saved = JSON.parse(readFileSync(FROM_REPORT, 'utf8'));
  entries = saved.entries ?? [];
  console.log(`리포트에서 결정 ${entries.length}건을 읽었다 (크롤링 생략): ${FROM_REPORT}\n`);
  // 리포트가 만들어진 뒤 DB 가 바뀌었을 수 있다 — 현재 값으로 다시 채운다.
  const byId = new Map(dbRows.map((r) => [r.id, r]));
  entries = entries
    .filter((e) => byId.has(e.postId))
    .map((e) => {
      const cur = byId.get(e.postId);
      return { ...e, dbDate: kstDate(cur.created_at), existingSourceUrl: cur.source_url ?? null, title: cur.title_ko };
    });
} else {
  await crawl();
  entries = [];
  for (const post of targets) entries.push(await decide(post));
  if (bodyCacheDirty) {
    writeFileSync(BODY_CACHE_PATH, JSON.stringify(bodyCache, null, 0) + '\n', 'utf8');
    console.log(`후보 본문 ${bodyFetches}건 수집 → 캐시 ${BODY_CACHE_PATH}\n`);
  } else if (Object.keys(bodyCache).length > 0) {
    console.log(`후보 본문은 캐시에서 읽었다(재수집 없음): ${BODY_CACHE_PATH}\n`);
  }
}

entries.sort((a, b) => ORDER[a.decision] - ORDER[b.decision] || a.board.localeCompare(b.board) || (a.dbDate ?? '').localeCompare(b.dbDate ?? ''));

for (const decision of ['accept', 'review', 'unmatched']) {
  const group = entries.filter((e) => e.decision === decision);
  if (group.length === 0) continue;
  console.log(`── ${decision} ${group.length}건 ${'─'.repeat(Math.max(0, 60 - decision.length))}`);
  for (const e of group) printEntry(e);
  console.log('');
}

const count = (d) => entries.filter((e) => e.decision === d).length;
const dateFixes = entries.filter((e) => e.decision !== 'unmatched' && e.sourceDate && e.sourceDate !== e.dbDate);
console.log(
  `요약: accept ${count('accept')} · review ${count('review')} · unmatched ${count('unmatched')} · ` +
    `날짜수정 대상 ${dateFixes.length}`,
);
{
  const byDelta = { '1일': 0, '2~7일': 0, '8일 이상': 0 };
  for (const e of dateFixes) {
    const d = Math.abs(e.deltaDays);
    byDelta[d === 1 ? '1일' : d <= 7 ? '2~7일' : '8일 이상'] += 1;
  }
  console.log(`  날짜차 분포 — ${Object.entries(byDelta).map(([k, v]) => `${k} ${v}건`).join(' · ')}`);
}

// ── 리포트 저장 ──────────────────────────────────────────────────
if (!FROM_REPORT) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'decision 을 "accept" 로 고치면 --from-report --apply 로 반영된다. "skip" 이면 제외.',
        summary: { accept: count('accept'), review: count('review'), unmatched: count('unmatched'), dateFixes: dateFixes.length },
        entries,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`\n리포트 저장: ${REPORT_PATH}`);
}

// ── 쓰기 ─────────────────────────────────────────────────────────
if (!APPLY) {
  console.log('\n드라이런이다 — DB 는 아무것도 바뀌지 않았다. 반영하려면 --apply.');
  process.exit(0);
}

if (!hasSourceUrlColumn) {
  console.error('\n✖ posts.source_url 컬럼이 없다. scripts/sql/schema.sql 의 alter 문을 먼저 적용할 것.');
  process.exit(1);
}

const writable = entries.filter(
  (e) => e.sourceUrl && (e.decision === 'accept' || (ACCEPT_REVIEW && e.decision === 'review')),
);

// source_url 은 unique 인덱스다 — 한 번의 실행 안에서 같은 URL 이 둘이면 반드시 하나는 오매칭이다.
{
  const seen = new Map();
  const clash = [];
  for (const e of writable) {
    if (seen.has(e.sourceUrl)) clash.push([seen.get(e.sourceUrl), e]);
    else seen.set(e.sourceUrl, e);
  }
  if (clash.length) {
    console.error('\n✖ 같은 원본 URL 에 두 건이 붙었다 — 오매칭이다. 중단한다:');
    for (const [a, b] of clash) console.error(`  ${a.sourceUrl}\n    #${a.postId} ${a.title}\n    #${b.postId} ${b.title}`);
    process.exit(1);
  }
}

// 이미 다른 원본이 붙어 있는 행은 손대지 않는다.
{
  const conflicts = writable.filter((e) => e.existingSourceUrl && e.existingSourceUrl !== e.sourceUrl);
  if (conflicts.length) {
    console.error('\n✖ 이미 다른 source_url 이 있는 행이 있다. 중단한다:');
    for (const e of conflicts) console.error(`  #${e.postId} ${e.title}\n    기존 ${e.existingSourceUrl}\n    신규 ${e.sourceUrl}`);
    process.exit(1);
  }
}

console.log(`\n반영 대상 ${writable.length}건${ACCEPT_REVIEW ? ' (review 포함)' : ''}\n`);
let ok = 0;
for (const e of writable) {
  const patch = { source_url: e.sourceUrl };
  if (e.sourceDate && e.sourceDate !== e.dbDate) patch.created_at = ts(e.sourceDate);
  const { error } = await sb.from('posts').update(patch).eq('id', e.postId);
  if (error) {
    console.error(`  ✖ #${e.postId} ${e.title} — ${error.message}`);
    process.exit(1);
  }
  ok += 1;
  console.log(
    `  #${String(e.postId).padStart(3)} ${e.board.padEnd(19)}` +
      `${patch.created_at ? `${e.dbDate} → ${e.sourceDate}` : `${e.dbDate} (날짜 유지)`}  ` +
      `source_url ← ${e.sourceUrl}  |  ${e.title}`,
  );
}
console.log(`\n완료: ${ok}건 갱신(source_url${dateFixes.length ? ' · created_at' : ''}). 나머지 컬럼은 손대지 않았다.`);
