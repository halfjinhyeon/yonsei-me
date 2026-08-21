// 교수 학술활동 수집기의 **공용 알맹이** — 한 명 분량의 크롤·파싱·병합.
//
// 왜 여기(src/lib)에 있나
//   같은 로직을 두 곳이 돌린다: ① CMS 의 "실적 불러오기" 버튼(교수 한 명씩 API 라우트로),
//   ② 월 1회 GitHub Actions 배치(tools/crawl-faculty-profiles.mjs). 파싱 규칙이 두 벌로
//   갈리면 행 키 순서가 어긋나 **고치지도 않은 행이 전부 신규로 잡힌다**(병합 계약이 깨진다).
//   그래서 규칙은 이 파일 하나에만 둔다.
//
// ⚠️ 이 파일은 **의존성이 없어야 한다**. Node 24 가 tools/*.mjs 에서 이 .ts 를 그대로
//    import 하기 때문이다(내장 타입 스트리핑). `@/` 별칭이나 패키지 import 를 넣는 순간
//    CLI 쪽이 깨진다. 타입만 쓰는 import 도 넣지 말 것. 같은 이유로 enum·namespace 같은
//    "지울 수 없는" 문법도 금지(타입 스트리핑은 지우기만 한다).
//
// ⚠️ 행 객체의 **키 순서는 계약**이다. 병합 동일성 판정이 JSON.stringify 문자열 비교라,
//    REPORT_MAP 의 프로퍼티 순서를 바꾸면 기존 행이 전부 신규로 잡힌다. CMS 편집기
//    (FacultyActivitiesDialog)도 같은 순서로 행을 만든다.

/** 원본 CMS 호스트. me.yonsei.ac.kr 은 도메인 컷오버 뒤 우리 사이트가 되므로 쓰지 않는다.
 *  학교가 주소를 옮기면 여기만 고치면 된다(2026-08 실측: 상세·리포트 모두 동일 응답). */
export const FACULTY_INFO_HOST = 'devcms.yonsei.ac.kr';

/** 저장돼 있는 URL 이 옛 호스트를 가리키면 원본 CMS 호스트로 바꾼다. */
export function infoHost(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'me.yonsei.ac.kr') u.hostname = FACULTY_INFO_HOST;
    return u.toString();
  } catch {
    return url;
  }
}

export const REPORT_TYPES = ['article', 'award', 'conference', 'funding', 'patent'] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/** 리포트 종류 → 프로필 파일의 배열 키 */
export const KEY_OF: Record<ReportType, string> = {
  article: 'articles',
  award: 'awards',
  conference: 'conferences',
  funding: 'fundings',
  patent: 'patents',
};

/** 프로필 파일이 담는 다섯 배열 — 순서는 화면 순서가 아니라 저장 순서다 */
export const SECTION_KEYS = ['articles', 'awards', 'conferences', 'fundings', 'patents'] as const;

/** 분류별 한국어 라벨 — CMS 로그 줄("논문 3 · 수상 1")과 CLI 출력이 같은 말을 쓴다 */
export const SECTION_LABEL: Record<string, string> = {
  articles: '논문',
  awards: '수상',
  conferences: '학술활동',
  fundings: '연구과제',
  patents: '지적재산권',
};

export type ProfileRow = Record<string, string | null>;

export type Profile = Record<string, unknown>;

export interface CrawlTarget {
  name: string;
  /** mode=view 상세 셸 URL (암호화된 userId 가 들어 있다) */
  viewUrl: string;
}

export interface CrawlFailure {
  name: string;
  /** 실패 지점 — 'view' | 'article' | 'award 2쪽' … */
  what: string;
  reason: string;
}

/** 새로 붙은 항목 한 줄 — 분류 라벨 · 제목 · 부가정보(저널/기관/학회 · 시점) */
export interface AddedItem {
  cat: string;
  title: string;
  meta: string;
}

/** 분류별 부가정보 조립 — 행 모양이 분류마다 달라 여기서 한 번만 정한다 */
function metaOf(key: string, row: ProfileRow): string {
  const parts: (string | null)[] =
    key === 'articles'
      ? [row.journal, row.date]
      : key === 'fundings'
        ? [row.org, row.period]
        : key === 'conferences'
          ? [row.conference, row.period]
          : key === 'awards'
            ? [row.contents, row.date]
            : [row.type, row.applicant, row.date]; // patents
  return parts.filter((v) => v != null && v !== '').join(' · ');
}

export interface CrawlPersonResult {
  name: string;
  /** 병합 결과 프로필. 전부 실패했으면 null(=저장하지 않는다) */
  merged: Profile | null;
  /** 분류 키 → 이번에 새로 붙은 행 수. 받아오지 못한 분류는 키가 없다 */
  addedByKey: Record<string, number>;
  /** 분류 키 → 병합 뒤 총 행 수 */
  totalByKey: Record<string, number>;
  /** 새로 붙은 행 수 합계 */
  added: number;
  /** 새로 붙은 항목 — CMS 가 줄을 펼치면 이 목록이 그대로 보인다 */
  addedItems: AddedItem[];
  /** 받아오지 못한 분류(기존 값 유지) */
  missing: string[];
  failures: CrawlFailure[];
}

// ── HTML 유틸 ──────────────────────────────────────────────────

/** 엔티티 최소 6종 + 숫자 참조를 되돌린다. 사이트가 그 이상은 쓰지 않는다(실측). */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** 태그를 걷어내고 공백을 접는다. <br/> 은 붙여 쓴다 — 기간 셀이 `2026-03-01~<br/>2027-02-28` 꼴이라. */
function text(html: string | null | undefined): string {
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
function period(s: string): string {
  return s ? s.replace(/\s*~\s*/g, '~').trim() : s;
}

/** <tr>…</tr> 안의 <td>/<th> 원문(태그 포함)을 순서대로 돌려준다. */
function cellsOf(rowHtml: string): string[] {
  const out: string[] = [];
  const re = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml))) out.push(m[2]);
  return out;
}

/** 표(첫 <table>)의 본문 행만. 헤더행(<th> 포함)과 "데이터가 없습니다" 한 칸짜리 행은 버린다. */
export function tableRows(html: string): string[][] {
  const table = html.match(/<table[\s\S]*?<\/table>/i);
  if (!table) return [];
  const rows: string[][] = [];
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
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

const DEFAULT_TIMEOUT_MS = 15000;

async function get(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; yonsei-me-site-builder/1.0; +https://me.yonsei.ac.kr/faculty/)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── 상세 셸 파싱 ───────────────────────────────────────────────

export interface ParsedShell {
  name: string | null;
  nameEn: string | null;
  email: string | null;
  phone: string | null;
  office: string | null;
  homepage: string | null;
}

export function parseProfile(html: string): ParsedShell {
  const box = html.match(/<div class="info-box"[\s\S]*?<div class="career-box"/i);
  const scope = box ? box[0] : html;

  const dt = scope.match(/<dt>([\s\S]*?)<\/dt>/i);
  let name: string | null = null;
  let nameEn: string | null = null;
  if (dt) {
    const span = dt[1].match(/<span>([\s\S]*?)<\/span>/i);
    nameEn = span ? text(span[1]) || null : null;
    name = text(dt[1].replace(/<span>[\s\S]*?<\/span>/gi, '')) || null;
  }

  const mail = scope.match(/href="mailto:([^"]+)"/i);
  const email = mail ? decodeEntities(mail[1]).trim() : null;

  const items = [...scope.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1]));
  const field = (label: string): string | null => {
    const hit = items.find((v) => v.startsWith(`${label} :`));
    if (!hit) return null;
    const v = hit.slice(label.length + 2).trim();
    return v || null;
  };

  const sns = scope.match(/<ul class="btn-sns"[\s\S]*?<\/ul>/i);
  const home = sns ? sns[0].match(/href="([^"]+)"/i) : null;
  const homepage = home ? decodeEntities(home[1]).trim() : null;

  return { name, nameEn, email, phone: field('Tel'), office: field('Office'), homepage };
}

// ── 리포트 파싱 (헤더 순서는 실측 고정) ─────────────────────────
// ⚠️ 아래 객체 리터럴의 **키 순서가 병합 동일성 판정의 계약**이다(파일 머리말 참고).
export const REPORT_MAP: Record<ReportType, (c: string[]) => ProfileRow> = {
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

// ── 병합 ───────────────────────────────────────────────────────

/** 행 동일성 판정 — CMS 편집기와 같은 문자열 비교다(키 순서 계약, 머리말 참고). */
const rowKey = (row: ProfileRow): string => JSON.stringify(row);

/** 기존 행은 순서 그대로 두고, 없던 행만 뒤에 붙인다. 절대 지우지 않는다 —
 *  원본이 분류당 200건 하드캡이라 오래된 실적이 창밖으로 밀려나는데, 여기서
 *  덮어쓰면 그 기록까지 같이 사라진다. CMS 에서 손본 행도 같은 이유로 보존된다. */
export function appendNew(
  base: ProfileRow[] | null | undefined,
  fresh: ProfileRow[] | null | undefined,
): { rows: ProfileRow[]; added: ProfileRow[] } {
  const known = new Set((base ?? []).map(rowKey));
  const added = (fresh ?? []).filter((r) => !known.has(rowKey(r)));
  return { rows: [...(base ?? []), ...added], added };
}

/** 스칼라는 기존 값 우선 — 비어 있을 때만 크롤 값으로 채운다(CMS 편집분 보호) */
function keepOr(base: unknown, fresh: string | null): string | null {
  if (base != null && base !== '') return base as string;
  return fresh ?? null;
}

// ── 한 명 수집 ─────────────────────────────────────────────────

export interface CrawlPersonOptions {
  /** 요청 사이 지연(ms) — 상대 서버 배려. 기본 300 */
  delayMs?: number;
  /** 요청 타임아웃(ms). 기본 15000 */
  timeoutMs?: number;
  /** 오늘 날짜(YYYY-MM-DD) — 호출자가 넘긴다(테스트 재현성) */
  today?: string;
}

/**
 * 교수 한 명을 수집해 기존 프로필(base)에 **병합한 결과**를 돌려준다. 저장은 하지 않는다
 * — 저장처(로컬 파일 / Supabase content_files)는 호출자가 정한다.
 *
 * 요청 수: 상세 셸 1 + 리포트 5 (+ 100행에서 잘린 분류마다 2쪽 1). 대략 6~11회,
 * 지연 포함 3~5초. 개별 요청 실패는 그 분류만 기존 값을 유지하고 넘어간다.
 */
export async function crawlPerson(
  target: CrawlTarget,
  base: Profile | null,
  options?: CrawlPersonOptions,
): Promise<CrawlPersonResult> {
  const delayMs = options?.delayMs ?? 300;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const today = options?.today ?? new Date().toISOString().slice(0, 10);

  const failures: CrawlFailure[] = [];
  const viewUrl = infoHost(target.viewUrl);
  const userId = (viewUrl.match(/[?&]userId=([^&]*)/) || [])[1] || '';

  let shellHtml: string | null = null;
  try {
    shellHtml = await get(viewUrl, timeoutMs);
  } catch (e) {
    failures.push({ name: target.name, what: 'view', reason: String((e as Error).message || e) });
  }
  await sleep(delayMs);

  const fresh: ParsedShell = shellHtml
    ? parseProfile(shellHtml)
    : { name: null, nameEn: null, email: null, phone: null, office: null, homepage: null };

  // 분류별 수집. null = 받아오지 못함(빈 배열과 구분 — 병합에서 건너뛴다)
  const sections: Record<string, ProfileRow[] | null> = {};
  let sectionOk = 0;
  for (const rt of REPORT_TYPES) {
    const url = (mode: string): string =>
      infoHost(
        `https://${FACULTY_INFO_HOST}/faculty/name_search.do?mode=${mode}&userId=${userId}&reportType=${rt}`,
      );
    try {
      const html = await get(url('report'), timeoutMs);
      const rows = tableRows(html);
      // 2쪽 링크가 있으면(=100행에서 잘렸으면) 나머지를 받아 이어 붙인다.
      // 원본이 제공하는 쪽은 최대 2쪽뿐이다(실측).
      if (html.includes('mode=report_next')) {
        await sleep(delayMs);
        try {
          rows.push(...tableRows(await get(url('report_next'), timeoutMs)));
        } catch (e) {
          failures.push({
            name: target.name,
            what: `${rt} 2쪽`,
            reason: String((e as Error).message || e),
          });
        }
      }
      sections[KEY_OF[rt]] = rows.map(REPORT_MAP[rt]);
      sectionOk += 1;
    } catch (e) {
      sections[KEY_OF[rt]] = null;
      failures.push({ name: target.name, what: rt, reason: String((e as Error).message || e) });
    }
    await sleep(delayMs);
  }

  const addedByKey: Record<string, number> = {};
  const totalByKey: Record<string, number> = {};
  const addedItems: AddedItem[] = [];
  const missing: string[] = [];

  if (!shellHtml && sectionOk === 0) {
    return {
      name: target.name,
      merged: null,
      addedByKey,
      totalByKey,
      added: 0,
      addedItems,
      missing: SECTION_KEYS.slice(),
      failures,
    };
  }

  const b = base ?? {};
  const merged: Profile = {
    name: (b.name as string) ?? target.name,
    nameEn: keepOr(b.nameEn, fresh.nameEn),
    email: keepOr(b.email, fresh.email),
    phone: keepOr(b.phone, fresh.phone),
    office: keepOr(b.office, fresh.office),
    homepage: keepOr(b.homepage, fresh.homepage),
    sourceUrl: (b.sourceUrl as string) ?? target.viewUrl,
    crawledAt: today,
  };
  // AI 연구요약은 CMS 가 관리한다 — 크롤러가 만들지도, 지우지도 않는다.
  if (b.aiSummary != null) merged.aiSummary = b.aiSummary;

  let added = 0;
  for (const key of SECTION_KEYS) {
    const baseRows = (b[key] as ProfileRow[] | undefined) ?? [];
    if (sections[key] == null) {
      merged[key] = baseRows; // 이번에 못 받은 분류는 기존 그대로
      totalByKey[key] = baseRows.length;
      missing.push(key);
      continue;
    }
    const result = appendNew(baseRows, sections[key]);
    merged[key] = result.rows;
    totalByKey[key] = result.rows.length;
    if (result.added.length > 0) {
      addedByKey[key] = result.added.length;
      added += result.added.length;
      for (const row of result.added) {
        addedItems.push({
          cat: SECTION_LABEL[key],
          title: String(row.title ?? '').trim() || '(제목 없음)',
          meta: metaOf(key, row),
        });
      }
    } else {
      addedByKey[key] = 0;
    }
  }

  return { name: target.name, merged, addedByKey, totalByKey, added, addedItems, missing, failures };
}

/** 프로필 파일 직렬화 — 저장 형식은 한 곳에서만 정한다(파일/DB 양쪽 동일, 끝에 개행). */
export function serializeProfile(profile: Profile): string {
  return JSON.stringify(profile, null, 2) + '\n';
}
