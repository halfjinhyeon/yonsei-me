// 게시판 쓰기 서버 헬퍼 (admin API 라우트 전용) — 백엔드 전환 Phase 3.
//
// 계약: DB 의 body_html_* 는 "정화된 HTML"만 저장한다. 현재 에디터(마크다운)든
// 이후의 WYSIWYG 든, 저장 직전에 반드시 renderAndSanitize 를 거친다.
// 마크다운 원문은 body_md_* 에 함께 보관 — 텍스트 에디터의 수정 왕복용
// (HTML→마크다운 역변환은 손실이 있어 원문 보관이 정공법).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { formatPeriodLabel, isoToDays, parseDateLabelRange } from '@/lib/calendar';

// 사이트 렌더와 동일 설정(breaks: 단일 개행도 줄바꿈 — 게시판 본문 관례)
const marked = new Marked({ gfm: true, breaks: true });

/** 정화 정책 — marked 산출물 + 에디터가 만들 만한 안전한 리치 텍스트만 허용.
 *  script/iframe/style/이벤트 핸들러는 여기서 전부 떨어진다. */
const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sup', 'sub',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['colspan', 'rowspan', 'align'],
    td: ['colspan', 'rowspan', 'align'],
    // Tiptap 글자색(span style="color:…") + 정렬(p/h* style="text-align:…") 허용
    span: ['style'],
    p: ['style'],
    h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], h5: ['style'],
  },
  // style 은 아래 속성·값 패턴만 통과 — 그 외 스타일은 제거된다
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/],
      'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/],
      'text-align': [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  // 외부 링크는 새 탭 + noopener 로 강제(에디터 산출물 신뢰하지 않음)
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: /^https?:\/\//.test(attribs.href ?? '')
        ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
        : attribs,
    }),
  },
};

/** 마크다운 → 정화된 HTML (빈 입력은 빈 문자열) */
export function renderAndSanitize(markdown: string | null | undefined): string {
  const md = (markdown ?? '').trim();
  if (!md) return '';
  return sanitizeHtml(marked.parse(md) as string, SANITIZE_OPTS);
}

/** (WYSIWYG 대비) HTML 입력을 그대로 정화만 */
export function sanitizeEditorHtml(html: string | null | undefined): string {
  const h = (html ?? '').trim();
  if (!h) return '';
  return sanitizeHtml(h, SANITIZE_OPTS);
}

// ── Supabase 서비스 클라이언트 (RLS 우회 — 라우트에서 인증 확인 후에만 사용) ──
let _sb: SupabaseClient | null = null;
export function adminDb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

// ── CMS 페이로드 ↔ DB 행 ──────────────────────────────────────────────

/** CMS 가 보내는 글 페이로드 (boards.ts 의 EditRecord 와 동일 필드 + 마크다운 본문) */
export interface AdminPostPayload {
  board: string;
  slug?: string | null;
  date: string; // YYYY-MM-DD (표시일 — created_at 으로 저장)
  titleKo: string;
  titleEn?: string;
  bodyKo?: string; // 마크다운
  bodyEn?: string;
  excerptKo?: string;
  excerptEn?: string;
  category?: string;
  hostKo?: string;
  hostEn?: string;
  /** 종료일(YYYY-MM-DD) — 행사·세미나·동문행사 전용. 없으면 하루(기간 라벨은 서버가 자동 생성) */
  endDate?: string | null;
  /** 게시물 링크(URL) — 인스타그램 전용(타일 클릭 목적지) */
  linkUrl?: string;
  isEvent?: boolean;
  /** 목록 최상단 고정 — 글 목록이 아닌 게시판(noBody)은 보내지 않는다 */
  pinned?: boolean;
  image?: string;
  attachments?: { labelKo?: string; labelEn?: string; href: string; size?: number }[];
}

const BOARDS = new Set([
  'calendar',
  'noticesUndergrad', 'noticesGraduate', 'noticesExternal', 'noticesScholarship',
  'news', 'seminars', 'events',
  'thesis', 'resources', 'career', 'internships', 'alumniNews', 'alumniEvents',
  'instagram',
]);

export function isValidBoard(board: string): boolean {
  return BOARDS.has(board);
}

const nn = (s: string | undefined | null) => {
  const v = (s ?? '').trim();
  return v === '' ? null : v;
};

/** 종료일 페이로드 검증 — 오류 메시지 반환(정상이면 null). 라우트 400 응답용(POST/PUT 공용) */
export function endDateError(p: AdminPostPayload): string | null {
  const e = (p.endDate ?? '').trim();
  if (!e) return null;
  if (Number.isNaN(isoToDays(e))) return '종료일 형식이 올바르지 않습니다.';
  if (p.date && e < p.date) return '종료일은 시작일보다 빠를 수 없습니다.';
  return null;
}

/** 페이로드 → posts 행 (본문은 md 보관 + 정화 HTML 동시 저장) */
export function payloadToRow(p: AdminPostPayload) {
  const isNews = p.board === 'news' || p.board === 'alumniNews';
  // 캘린더 전용 일정은 "그 날짜에 일어나는 일"이 본체라 행사와 똑같이 event_date 에
  // 시작일을 박는다. created_at 은 timestamptz 라 표시일로 쓰면 시간대에 휘둘린다.
  const isEvent =
    p.board === 'alumniEvents'
      ? p.isEvent === true
      : p.board === 'events' || p.board === 'calendar';
  // 종료일·자동 라벨 대상: 행사 + 세미나 + 일정 + 동문(행사 체크 시). 그 외 게시판은 항상 null.
  // 일정을 여기 넣는 이유는 홈 캘린더의 날짜 pill 표기다 — 행사 글과 같은
  // formatPeriodLabel 을 타야 "7/20~7/24" 같은 기간 표기가 한 문법으로 나온다.
  // is_event/event_date 의 기존 의미는 불변(세미나는 event_date null 유지 — dateOf 가
  // created_at 으로 폴백해 표시 날짜가 동일하다).
  const hasSchedule =
    p.board === 'events' || p.board === 'seminars' || p.board === 'calendar' ||
    (p.board === 'alumniEvents' && p.isEvent === true);
  // end==start(하루)는 null 로 정규화 — "end_date null = 하루" 단일 의미를 DB 레벨에서 유지
  const e = nn(p.endDate);
  const endDate = hasSchedule && e && e > p.date ? e : null;
  // 기간 라벨은 시작/종료일에서 ko/en 자동 생성(수동 입력 폐지) — 홈 pill 등 기존 라벨
  // 소비자는 무변경으로 동작하고, 그간 전부 공백이던 EN 라벨 문제도 함께 해결된다.
  const label = hasSchedule && p.date ? formatPeriodLabel(p.date, endDate) : null;
  // 분류 — 뉴스와 캘린더가 같은 category 칼럼을 쓰되 값 집합이 다르다. board 로
  // 스코프가 갈리므로 섞이지 않고, 기본값만 각자의 것으로 준다(뉴스 '일반',
  // 일정 '학사일정'). 분류가 없는 게시판은 예전처럼 null 이다.
  let category: string | null = null;
  // 뉴스 분류는 일반/성과 2종 — 구 값(notice/seminar)이 들어와도 '일반'으로 눕힌다
  if (isNews) category = nn(p.category) === 'achievement' ? 'achievement' : 'general';
  else if (p.board === 'calendar') category = nn(p.category) ?? 'academic';
  // 자료실은 미분류를 허용한다 — 분류 없는 글은 목록의 '전체' 탭에만 잡힌다
  else if (p.board === 'resources') category = nn(p.category);
  return {
    board: p.board,
    slug: isNews ? nn(p.slug) : null,
    title_ko: (p.titleKo ?? '').trim(),
    title_en: nn(p.titleEn),
    // Tiptap 전환(Phase 3b): 에디터 산출물이 HTML — 정화만 거쳐 저장한다.
    // body_md_* 는 마크다운 시대의 원문 보관용이었고 이제 동결(신규 글은 null).
    body_md_ko: null,
    body_md_en: null,
    body_html_ko: sanitizeEditorHtml(p.bodyKo),
    body_html_en: nn(p.bodyEn) ? sanitizeEditorHtml(p.bodyEn) : null,
    excerpt_ko: nn(p.excerptKo),
    excerpt_en: nn(p.excerptEn),
    category,
    host_ko: nn(p.hostKo),
    host_en: nn(p.hostEn),
    date_label_ko: label ? nn(label.ko) : null,
    date_label_en: label ? nn(label.en) : null,
    is_event: p.board === 'alumniEvents' ? p.isEvent === true : false,
    event_date: isEvent && p.date ? p.date : null,
    end_date: endDate,
    // 링크 — 같은 칼럼이지만 성격이 다르다. 인스타그램은 타일이 반드시 가야 할
    // 필수 목적지고, 캘린더는 있으면 좋은 선택 링크(비면 홈에서 링크 없는 카드).
    link_url: p.board === 'instagram' || p.board === 'calendar' ? nn(p.linkUrl) : null,
    // 고정 — 페이로드에 없으면(고정 대상이 아닌 게시판) 항상 false 로 눕힌다
    pinned: p.pinned === true,
    thumbnail_url: nn(p.image),
    created_at: `${p.date}T00:00:00+09:00`,
  };
}

/** posts 행(+attachments 관계) — select('*, attachments(*)') 결과의 필요한 필드만 */
export interface DbPostRow {
  id: number | string;
  board: string;
  slug: string | null;
  created_at: string;
  event_date: string | null;
  end_date: string | null;
  link_url: string | null;
  is_event: boolean | null;
  /** 목록 최상단 고정 — 구 행은 null(스키마 추가 이전) */
  pinned: boolean | null;
  title_ko: string | null;
  title_en: string | null;
  body_html_ko: string | null;
  body_html_en: string | null;
  excerpt_ko: string | null;
  excerpt_en: string | null;
  category: string | null;
  host_ko: string | null;
  host_en: string | null;
  date_label_ko: string | null;
  date_label_en: string | null;
  thumbnail_url: string | null;
  attachments?: {
    label_ko: string | null;
    label_en: string | null;
    url: string;
    sort: number;
    size_bytes?: number | null;
  }[];
}

/** timestamptz → KST 달력 날짜(YYYY-MM-DD).
 *  저장은 언제나 KST 자정(`${date}T00:00:00+09:00`)인데 Supabase 는 UTC 로 돌려주므로,
 *  그대로 자르면 하루 전날이 된다. src/lib/posts.ts 의 kstDate 와 같은 규칙이다. */
function kstDate(ts: string): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts.slice(0, 10);
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** DB 행 → CMS 편집 레코드(마크다운 우선, 없으면 빈 문자열 — 구 데이터 호환) */
export function rowToEditRecord(r: DbPostRow) {
  // 캘린더를 여기 넣는 이유: created_at 은 timestamptz(+09:00) 라 UTC 로 돌아오면
  // slice(0,10) 이 하루 앞당겨진다. 일정은 날짜가 곧 내용이므로 그 하루가
  // 그대로 오답이 된다 — 시작일의 진실은 언제나 event_date 다.
  // 나머지 게시판도 사정은 같다: 예전에는 여기서 UTC 로 잘라 폼에 하루 이른 날짜가
  // 뜨고, 그 상태로 저장하면 진짜 하루가 밀렸다(왕복할수록 누적). kstDate 로 바로잡는다.
  const date = (r.event_date && (r.board === 'events' || r.board === 'calendar' || r.is_event)
    ? r.event_date
    : kstDate(String(r.created_at))) as string;
  // 종료일: end_date 우선. 없으면(구 데이터) 수동 기간 라벨을 파싱해 폼에 프리필한다 —
  // 라벨이 저장 시 자동 재생성되므로, 프리필 없이는 구 행사 글을 수정·저장하는 순간
  // "7/20~7/24" 같은 기간 정보가 하루짜리 라벨로 덮어써져 소실된다(프리필 → end_date 승격).
  let endDate = r.end_date ?? '';
  if (!endDate && r.date_label_ko) {
    const parsedEnd = parseDateLabelRange(date, r.date_label_ko).end;
    if (parsedEnd > date) endDate = parsedEnd;
  }
  return {
    id: String(r.id),
    board: r.board as string,
    slug: r.slug ?? null,
    date,
    endDate,
    titleKo: r.title_ko ?? '',
    titleEn: r.title_en ?? '',
    // Tiptap 은 HTML 왕복 — 기존 글(마이그레이션분 포함)도 body_html 이 원본이다
    bodyKo: r.body_html_ko ?? '',
    bodyEn: r.body_html_en ?? '',
    excerptKo: r.excerpt_ko ?? '',
    excerptEn: r.excerpt_en ?? '',
    category: r.category ?? undefined,
    hostKo: r.host_ko ?? '',
    hostEn: r.host_en ?? '',
    dateLabelKo: r.date_label_ko ?? '',
    dateLabelEn: r.date_label_en ?? '',
    linkUrl: r.link_url ?? '',
    isEvent: r.is_event === true,
    pinned: r.pinned === true,
    image: r.thumbnail_url ?? '',
    attachments: (r.attachments ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({
        labelKo: a.label_ko ?? '',
        labelEn: a.label_en ?? '',
        href: a.url,
        ...(a.size_bytes ? { size: a.size_bytes } : {}),
      })),
  };
}
