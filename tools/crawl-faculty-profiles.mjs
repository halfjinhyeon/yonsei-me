/**
 * 교수 상세 프로필 수집기 (개발 전용 · 학기마다 1회 실행)
 *
 *   node tools/crawl-faculty-profiles.mjs
 *
 * 하는 일
 *   ① content/faculty-directory.json 에서 교원정보 시스템 상세 링크를 가진 교수만 골라낸다.
 *      (me.yonsei.ac.kr 의 name_search.do?mode=view&userId=… 형태. 개인 홈페이지 링크는 제외)
 *   ② 상세 셸 페이지에서 이름·영문명·이메일·전화·연구실·홈페이지를 뽑는다.
 *      https://me.yonsei.ac.kr/faculty/name_search.do?mode=view&userId=<id>
 *   ③ 같은 userId 의 리포트 5종(논문·수상·학술활동·연구과제·지적재산권)을 각각 받아
 *      표 한 개를 행 단위로 파싱한다.
 *      https://me.yonsei.ac.kr/faculty/name_search.do?mode=report&userId=<id>&reportType=
 *        article | award | conference | funding | patent
 *      ⚠️ 한 페이지가 100행에서 끊긴다. 하단 paging 에 2쪽 링크(mode=report_next)가 있으면
 *         그 쪽까지 받아 이어 붙인다. 원본이 제공하는 쪽은 최대 2쪽뿐이다(실측).
 *   ④ 교수 1인당 content/faculty-profiles/<한글이름>.json 한 개를 쓴다.
 *
 * 언제 다시 도는가
 *   학기마다 한 번이면 충분하다(논문·과제가 학기 단위로 갱신된다). 교수 명단이 바뀌었을 때는
 *   faculty-directory.json 을 먼저 갱신한 뒤 이 스크립트를 통째로 다시 돌린다. 인자 없이
 *   전체 재수집하도록 만들어 두었다 — 부분 갱신 옵션은 일부러 두지 않았다.
 *
 * 상대 서버 배려
 *   학교 서버를 몰아붙이지 않도록 순차 처리 + 요청 사이 300ms 지연을 지킨다. 교수 한 명당
 *   6~11요청(셸 1 + 리포트 5 + 2쪽이 있는 리포트만 추가 1)이라 전체 한 바퀴가 몇 분 걸린다
 *   — 그 정도는 기다린다.
 *   개별 요청 실패는 해당 섹션만 빈 배열로 두고 계속 진행하며, 마지막에 실패 목록을 찍는다.
 *
 * 의존성 없음: Node 24 내장 fetch 만 쓴다(cheerio 등 설치 금지).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = join(ROOT, 'content', 'faculty-directory.json');
const OUT_DIR = join(ROOT, 'content', 'faculty-profiles');

const DELAY_MS = 300;
const TIMEOUT_MS = 15000;
const REPORT_TYPES = ['article', 'award', 'conference', 'funding', 'patent'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ── 실행 ───────────────────────────────────────────────────────
const directory = JSON.parse(readFileSync(DIRECTORY, 'utf8'));
const targets = directory.filter(
  (p) =>
    typeof p.moreInfoUrl === 'string' &&
    p.moreInfoUrl.includes('me.yonsei.ac.kr') &&
    p.moreInfoUrl.includes('mode=view'),
);

mkdirSync(OUT_DIR, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const failures = []; // { name, what, reason }
let written = 0;

console.log(`대상 ${targets.length}명 · 요청 간 ${DELAY_MS}ms 지연\n`);

for (const person of targets) {
  const viewUrl = person.moreInfoUrl;
  const userId = (viewUrl.match(/[?&]userId=([^&]*)/) || [])[1] || '';

  let shell = null;
  try {
    shell = await get(viewUrl);
  } catch (e) {
    failures.push({ name: person.name, what: 'view', reason: String(e.message || e) });
  }
  await sleep(DELAY_MS);

  const profile = shell
    ? parseProfile(shell)
    : { name: null, nameEn: null, email: null, phone: null, office: null, homepage: null };

  const sections = {};
  let sectionOk = 0;
  for (const rt of REPORT_TYPES) {
    const url = (mode) =>
      `https://me.yonsei.ac.kr/faculty/name_search.do?mode=${mode}&userId=${userId}&reportType=${rt}`;
    try {
      const html = await get(url('report'));
      const rows = tableRows(html);
      // 2쪽 링크가 있으면(=100행에서 잘렸으면) 나머지를 받아 이어 붙인다.
      if (html.includes('mode=report_next')) {
        await sleep(DELAY_MS);
        try {
          rows.push(...tableRows(await get(url('report_next'))));
        } catch (e) {
          failures.push({
            name: person.name,
            what: `${rt} 2쪽`,
            reason: String(e.message || e),
          });
        }
      }
      sections[KEY_OF[rt]] = rows.map(REPORT_MAP[rt]);
      sectionOk += 1;
    } catch (e) {
      sections[KEY_OF[rt]] = [];
      failures.push({ name: person.name, what: rt, reason: String(e.message || e) });
    }
    await sleep(DELAY_MS);
  }

  if (!shell && sectionOk === 0) {
    console.log(`${person.name} … 전부 실패 — 파일 없음`);
    continue;
  }

  const data = {
    name: person.name,
    nameEn: profile.nameEn,
    email: profile.email,
    phone: profile.phone,
    office: profile.office,
    homepage: profile.homepage,
    sourceUrl: viewUrl,
    crawledAt: today,
    articles: sections.articles,
    awards: sections.awards,
    conferences: sections.conferences,
    fundings: sections.fundings,
    patents: sections.patents,
  };

  writeFileSync(join(OUT_DIR, `${person.name}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8');
  written += 1;

  console.log(
    `${person.name} … 논문 ${data.articles.length} · 수상 ${data.awards.length} · ` +
      `학술 ${data.conferences.length} · 과제 ${data.fundings.length} · 특허 ${data.patents.length}`,
  );
}

console.log(`\n완료: ${written}/${targets.length}명 저장 → content/faculty-profiles/`);
if (failures.length) {
  console.log(`\n실패한 요청 ${failures.length}건:`);
  for (const f of failures) console.log(`  - ${f.name} / ${f.what} : ${f.reason}`);
} else {
  console.log('실패한 요청 없음.');
}
