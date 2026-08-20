/**
 * 교수 학술활동 프로필 수집기 — 교원정보시스템에서 받아 **기존 기록에 병합**한다.
 *
 *   node tools/crawl-faculty-profiles.mjs                    # 드라이런 — 신규 행 개수만
 *   node tools/crawl-faculty-profiles.mjs --apply            # 레포 파일에 병합 기록
 *   node tools/crawl-faculty-profiles.mjs --source=db --apply # 프로덕션 DB 에 병합 기록
 *   node tools/crawl-faculty-profiles.mjs --only=강건욱,김대은  # 일부만
 *
 * 하는 일
 *   ① content/faculty-profiles/*.json 의 `sourceUrl`(암호화 userId)로 대상을 고른다.
 *      프로필이 아직 없는 교수는 faculty-directory 의 moreInfoUrl 로 보완한다.
 *   ② 상세 셸에서 이름·영문명·이메일·전화·연구실·홈페이지를 뽑는다 (mode=view).
 *   ③ 같은 userId 의 리포트 5종(논문·수상·학술활동·연구과제·지적재산권)을 받아 표를
 *      행 단위로 파싱한다 (mode=report&reportType=article|award|conference|funding|patent).
 *      ⚠️ 한 페이지가 100행에서 끊긴다. 하단 paging 에 2쪽 링크(mode=report_next)가 있으면
 *         그 쪽까지 받아 이어 붙인다. 원본이 제공하는 쪽은 최대 2쪽뿐이다(실측).
 *   ④ 기존 프로필에 **없던 행만 뒤에 붙여** 저장한다. 지우거나 덮어쓰지 않는다.
 *
 * ⚠️ 병합인 이유 두 가지
 *   ⓐ 원본 리포트는 분류당 최대 2쪽·200건 하드캡이라, 새 실적이 등록되면 오래된 실적이
 *      창밖으로 밀려난다. 덮어쓰면 우리 쪽 기록까지 같이 사라진다(조형희 학술활동에서 실측).
 *   ⓑ CMS(교수 학술활동 팝업 편집기)에서 손본 행과 AI 연구요약이 지워진다.
 *
 * ⚠️ 호스트
 *   원본은 me.yonsei.ac.kr 인데, 도메인 컷오버 뒤 그 주소는 이 사이트가 된다. 같은 페이지를
 *   서빙하는 원본 CMS 호스트(devcms.yonsei.ac.kr)로 요청한다 — 2026-08 실측으로 상세·리포트
 *   모두 동일 응답. 학교가 주소를 옮기면 FACULTY_INFO_HOST 만 고치면 된다.
 *
 * 언제 도는가
 *   학기마다 한 번이면 충분하다(논문·과제가 학기 단위로 갱신된다). 자동 실행은 GitHub
 *   Actions 스케줄(.github/workflows/crawl-faculty-profiles.yml)이 맡는다 — 한 바퀴가
 *   몇 분 걸려 서버리스 함수 타임아웃에 맞지 않는다.
 *
 * 상대 서버 배려
 *   순차 처리 + 요청 사이 300ms 지연. 교수 한 명당 6~11요청(셸 1 + 리포트 5 + 2쪽 추가).
 *   개별 요청 실패는 그 분류만 기존 값을 유지한 채 넘어가고, 마지막에 실패 목록을 찍는다.
 *
 * 의존성: Node 24 내장 fetch. --source=db 일 때만 @supabase/supabase-js 를 쓴다.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = join(ROOT, 'content', 'faculty-directory.json');
const OUT_DIR = join(ROOT, 'content', 'faculty-profiles');

const DELAY_MS = 300;
const TIMEOUT_MS = 15000;
const REPORT_TYPES = ['article', 'award', 'conference', 'funding', 'patent'];

/** 원본 CMS 호스트. me.yonsei.ac.kr 은 컷오버 뒤 이 사이트가 되므로 쓰지 않는다. */
const FACULTY_INFO_HOST = 'devcms.yonsei.ac.kr';

/** 저장돼 있는 URL 이 옛 호스트를 가리키면 원본 CMS 호스트로 바꾼다. */
function infoHost(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'me.yonsei.ac.kr') u.hostname = FACULTY_INFO_HOST;
    return u.toString();
  } catch {
    return url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 저장소 (레포 파일 / Supabase content_files) ─────────────────
/** 공통 인터페이스: raw(name) → 원문 문자열|null, read(name) → 파싱본|null, write(name, body) */
function openFileStore() {
  const pathOf = (name) => join(OUT_DIR, `${name}.json`);
  const raw = async (name) => {
    try {
      return readFileSync(pathOf(name), 'utf8');
    } catch {
      return null;
    }
  };
  return {
    raw,
    read: async (name) => {
      const t = await raw(name);
      return t ? JSON.parse(t) : null;
    },
    write: async (name, body) => writeFileSync(pathOf(name), body, 'utf8'),
  };
}

async function openDbStore() {
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다 (.env.local 확인).');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const pathOf = (name) => `content/faculty-profiles/${name}.json`;
  const cache = new Map(); // name → { body, version } | null
  const load = async (name) => {
    if (cache.has(name)) return cache.get(name);
    const { data, error } = await sb
      .from('content_files')
      .select('body, version')
      .eq('path', pathOf(name))
      .maybeSingle();
    if (error) throw new Error(`content_files 조회 실패 (${name}): ${error.message}`);
    cache.set(name, data ?? null);
    return data ?? null;
  };
  return {
    raw: async (name) => (await load(name))?.body ?? null,
    read: async (name) => {
      const row = await load(name);
      return row ? JSON.parse(row.body) : null;
    },
    write: async (name, body) => {
      const row = await load(name);
      const { error } = row
        ? await sb
            .from('content_files')
            .update({ body, version: row.version + 1 })
            .eq('path', pathOf(name))
        : await sb.from('content_files').insert({ path: pathOf(name), body });
      if (error) throw new Error(`content_files 기록 실패 (${name}): ${error.message}`);
      cache.set(name, { body, version: (row?.version ?? 0) + 1 });
    },
  };
}

// ── HTML 유틸 ──────────────────────────────────────────────────
/** 엔티티 최소 6종 + 숫자 참조를 되돌린다. 사이트가 그 이상은 쓰지 않는다(실측). */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** 태그를 걷어내고 공백을 접는다. <br/> 은 붙여 쓴다 — 기간 셀이 `2026-03-01~<br/>2027-02-28` 꼴이라. */
function text(html) {
  if (html == null) return '';
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 기간 셀 정리. 원본이 `2023.08.21~<br/> 2023.08.25` 처럼 <br/> 뒤에 공백을 두기도 해서
 * 물결표 좌우 공백을 없애 `2023.08.21~2023.08.25` 한 덩어리로 만든다.
 */
function period(s) {
  return s ? s.replace(/\s*~\s*/g, '~').trim() : s;
}

/** <tr>…</tr> 안의 <td>/<th> 원문(태그 포함)을 순서대로 돌려준다. */
function cellsOf(rowHtml) {
  const out = [];
  const re = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
  let m;
  while ((m = re.exec(rowHtml))) out.push(m[2]);
  return out;
}

/** 표(첫 <table>)의 본문 행만. 헤더행(<th> 포함)과 "데이터가 없습니다" 한 칸짜리 행은 버린다. */
function tableRows(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/i);
  if (!table) return [];
  const rows = [];
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(table[0]))) {
    const raw = m[1];
    if (/<th\b/i.test(raw)) continue;
    const cells = cellsOf(raw).map(text);
    if (cells.length < 2) continue; // colspan 안내 문구 행
    rows.push(cells);
  }
  return rows;
}

// ── 네트워크 ───────────────────────────────────────────────────
async function get(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; yonsei-me-site-builder/1.0; +https://me.yonsei.ac.kr/faculty/)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── 상세 셸 파싱 ───────────────────────────────────────────────
function parseProfile(html) {
  const box = html.match(/<div class="info-box"[\s\S]*?<div class="career-box"/i);
  const scope = box ? box[0] : html;

  const dt = scope.match(/<dt>([\s\S]*?)<\/dt>/i);
  let name = null;
  let nameEn = null;
  if (dt) {
    const span = dt[1].match(/<span>([\s\S]*?)<\/span>/i);
    nameEn = span ? text(span[1]) || null : null;
    name = text(dt[1].replace(/<span>[\s\S]*?<\/span>/gi, '')) || null;
  }

  const mail = scope.match(/href="mailto:([^"]+)"/i);
  const email = mail ? decodeEntities(mail[1]).trim() : null;

  const items = [...scope.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1]));
  const field = (label) => {
    const hit = items.find((v) => v.startsWith(`${label} :`));
    if (!hit) return null;
    const v = hit.slice(label.length + 2).trim();
    return v || null;
  };

  const sns = scope.match(/<ul class="btn-sns"[\s\S]*?<\/ul>/i);
  const home = sns ? sns[0].match(/href="([^"]+)"/i) : null;
  const homepage = home ? decodeEntities(home[1]).trim() : null;

  return {
    name,
    nameEn,
    email,
    phone: field('Tel'),
    office: field('Office'),
    homepage,
  };
}

// ── 리포트 파싱 (헤더 순서는 실측 고정) ─────────────────────────
const REPORT_MAP = {
  // Issue Date | Title | Journals
  article: (c) => ({ date: c[0] || null, title: c[1] || '', journal: c[2] || null }),
  // No | Title | Contents | Date
  award: (c) => ({ title: c[1] || '', contents: c[2] || null, date: c[3] || null }),
  // No | Title | Academic Conference | Period
  conference: (c) => ({ title: c[1] || '', conference: c[2] || null, period: period(c[3]) || null }),
  // No | Title | Support Org | Period
  funding: (c) => ({ title: c[1] || '', org: c[2] || null, period: period(c[3]) || null }),
  // No | Title | Type | Applicant | Appl.Date
  patent: (c) => ({
    title: c[1] || '',
    type: c[2] || null,
    applicant: c[3] || null,
    date: c[4] || null,
  }),
};
const KEY_OF = {
  article: 'articles',
  award: 'awards',
  conference: 'conferences',
  funding: 'fundings',
  patent: 'patents',
};

// ── 대상 선별 ──────────────────────────────────────────────────
// 기준은 **각 프로필 파일의 sourceUrl** 이다(암호화된 userId 가 들어 있다).
// 과거엔 faculty-directory 의 moreInfoUrl 을 썼는데, 레거시 링크 청산(2026-08) 때
// 그 값이 전부 null 이 되면서 대상이 0명이 돼 크롤러가 통째로 멈춰 있었다.
// 프로필이 아직 없는 교수는 디렉터리의 moreInfoUrl 로 보완한다(수동으로 채운 경우).
function listTargets() {
  const seen = new Map(); // 이름 → viewUrl
  let names = [];
  try {
    names = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    /* 첫 실행 — 디렉터리 없음 */
  }
  for (const file of names) {
    try {
      const p = JSON.parse(readFileSync(join(OUT_DIR, file), 'utf8'));
      if (typeof p.sourceUrl === 'string' && p.sourceUrl.includes('mode=view')) {
        seen.set(file.replace(/\.json$/, ''), p.sourceUrl);
      }
    } catch {
      /* 깨진 파일은 건너뛴다 — 실패 목록에 남길 만한 값이 없다 */
    }
  }
  for (const person of JSON.parse(readFileSync(DIRECTORY, 'utf8'))) {
    if (seen.has(person.name)) continue;
    const url = person.moreInfoUrl;
    if (typeof url === 'string' && url.includes('mode=view')) seen.set(person.name, url);
  }
  return [...seen].map(([name, viewUrl]) => ({ name, viewUrl }));
}

// ── 병합 ───────────────────────────────────────────────────────
/** 행 동일성 판정 — CMS 편집기(FacultyActivitiesDialog)와 같은 문자열 비교다.
 *  키 순서가 크롤러 산출물과 어긋나면 전 행이 신규로 잡히므로 REPORT_MAP 의
 *  프로퍼티 순서를 함부로 바꾸지 말 것. */
const rowKey = (row) => JSON.stringify(row);

/** 기존 행은 순서 그대로 두고, 없던 행만 뒤에 붙인다. 절대 지우지 않는다 —
 *  원본이 분류당 200건 하드캡이라 오래된 실적이 창밖으로 밀려나는데, 여기서
 *  덮어쓰면 그 기록까지 같이 사라진다. CMS 에서 손본 행도 같은 이유로 보존된다. */
function appendNew(base, fresh) {
  const known = new Set((base ?? []).map(rowKey));
  const added = (fresh ?? []).filter((r) => !known.has(rowKey(r)));
  return { rows: [...(base ?? []), ...added], added: added.length };
}

/** 스칼라는 기존 값 우선 — 비어 있을 때만 크롤 값으로 채운다(CMS 편집분 보호) */
const keepOr = (base, fresh) => (base != null && base !== '' ? base : (fresh ?? null));

// ── 실행 ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sourceArg = args.find((a) => a.startsWith('--source='))?.slice('--source='.length) ?? 'file';
if (sourceArg !== 'file' && sourceArg !== 'db') {
  console.error(`알 수 없는 --source 값: ${sourceArg} (file | db)`);
  process.exit(1);
}
const useDb = sourceArg === 'db';
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);

const store = useDb ? await openDbStore() : openFileStore();

let targets = listTargets();
if (only) targets = targets.filter((t) => only.includes(t.name));
if (targets.length === 0) {
  console.error('대상 0명 — content/faculty-profiles 가 비었고 디렉터리에도 mode=view 링크가 없다.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const failures = []; // { name, what, reason }
let written = 0;
let totalAdded = 0;

console.log(
  `대상 ${targets.length}명 · 소스 ${useDb ? 'DB(content_files)' : '레포 파일'} · ` +
    `${APPLY ? '기록' : '드라이런'} · 요청 간 ${DELAY_MS}ms 지연\n`,
);

for (const person of targets) {
  const viewUrl = infoHost(person.viewUrl);
  const userId = (viewUrl.match(/[?&]userId=([^&]*)/) || [])[1] || '';

  let shell = null;
  try {
    shell = await get(viewUrl);
  } catch (e) {
    failures.push({ name: person.name, what: 'view', reason: String(e.message || e) });
  }
  await sleep(DELAY_MS);

  const fresh = shell
    ? parseProfile(shell)
    : { name: null, nameEn: null, email: null, phone: null, office: null, homepage: null };

  const sections = {};
  let sectionOk = 0;
  for (const rt of REPORT_TYPES) {
    const url = (mode) =>
      infoHost(`https://${FACULTY_INFO_HOST}/faculty/name_search.do?mode=${mode}&userId=${userId}&reportType=${rt}`);
    try {
      const html = await get(url('report'));
      const rows = tableRows(html);
      // 2쪽 링크가 있으면(=100행에서 잘렸으면) 나머지를 받아 이어 붙인다.
      if (html.includes('mode=report_next')) {
        await sleep(DELAY_MS);
        try {
          rows.push(...tableRows(await get(url('report_next'))));
        } catch (e) {
          failures.push({ name: person.name, what: `${rt} 2쪽`, reason: String(e.message || e) });
        }
      }
      sections[KEY_OF[rt]] = rows.map(REPORT_MAP[rt]);
      sectionOk += 1;
    } catch (e) {
      sections[KEY_OF[rt]] = null; // null = 받아오지 못함(빈 배열과 구분 — 병합에서 건너뛴다)
      failures.push({ name: person.name, what: rt, reason: String(e.message || e) });
    }
    await sleep(DELAY_MS);
  }

  if (!shell && sectionOk === 0) {
    console.log(`${person.name} … 전부 실패 — 건너뜀`);
    continue;
  }

  const base = (await store.read(person.name)) ?? {};
  const merged = {
    name: base.name ?? person.name,
    nameEn: keepOr(base.nameEn, fresh.nameEn),
    email: keepOr(base.email, fresh.email),
    phone: keepOr(base.phone, fresh.phone),
    office: keepOr(base.office, fresh.office),
    homepage: keepOr(base.homepage, fresh.homepage),
    sourceUrl: base.sourceUrl ?? person.viewUrl,
    crawledAt: today,
  };
  // AI 연구요약은 CMS 가 관리한다 — 크롤러가 만들지도, 지우지도 않는다.
  if (base.aiSummary != null) merged.aiSummary = base.aiSummary;

  const counts = [];
  for (const key of ['articles', 'awards', 'conferences', 'fundings', 'patents']) {
    if (sections[key] == null) {
      merged[key] = base[key] ?? []; // 이번에 못 받은 분류는 기존 그대로
      counts.push(`${key} ✗`);
      continue;
    }
    const { rows, added } = appendNew(base[key], sections[key]);
    merged[key] = rows;
    totalAdded += added;
    counts.push(`${key} ${rows.length}${added ? ` (+${added})` : ''}`);
  }

  const body = JSON.stringify(merged, null, 2) + '\n';
  const changed = body !== (await store.raw(person.name));
  if (APPLY && changed) {
    await store.write(person.name, body);
    written += 1;
  }
  console.log(`${person.name} … ${counts.join(' · ')}${changed ? '' : '  (변경 없음)'}`);
}

console.log(
  `\n신규 행 ${totalAdded}건` +
    (APPLY ? ` · ${written}명 저장 → ${useDb ? 'content_files(DB)' : 'content/faculty-profiles/'}` : ' · 드라이런(기록 안 함) — 기록하려면 --apply'),
);
if (failures.length) {
  console.log(`\n실패한 요청 ${failures.length}건:`);
  for (const f of failures) console.log(`  - ${f.name} / ${f.what} : ${f.reason}`);
} else {
  console.log('실패한 요청 없음.');
}
