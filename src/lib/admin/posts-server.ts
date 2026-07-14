// 게시판 쓰기 서버 헬퍼 (admin API 라우트 전용) — 백엔드 전환 Phase 3.
//
// 계약: DB 의 body_html_* 는 "정화된 HTML"만 저장한다. 현재 에디터(마크다운)든
// 이후의 WYSIWYG 든, 저장 직전에 반드시 renderAndSanitize 를 거친다.
// 마크다운 원문은 body_md_* 에 함께 보관 — 텍스트 에디터의 수정 왕복용
// (HTML→마크다운 역변환은 손실이 있어 원문 보관이 정공법).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

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
  dateLabelKo?: string;
  dateLabelEn?: string;
  isEvent?: boolean;
  image?: string;
  attachments?: { labelKo?: string; labelEn?: string; href: string }[];
}

const BOARDS = new Set([
  'noticesUndergrad', 'noticesGraduate', 'news', 'seminars', 'events',
  'thesis', 'resources', 'career', 'alumniNews', 'alumniEvents',
]);

export function isValidBoard(board: string): boolean {
  return BOARDS.has(board);
}

const nn = (s: string | undefined | null) => {
  const v = (s ?? '').trim();
  return v === '' ? null : v;
};

/** 페이로드 → posts 행 (본문은 md 보관 + 정화 HTML 동시 저장) */
export function payloadToRow(p: AdminPostPayload) {
  const isNews = p.board === 'news' || p.board === 'alumniNews';
  const isEvent = p.board === 'alumniEvents' ? p.isEvent === true : p.board === 'events';
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
    category: isNews ? (nn(p.category) ?? 'notice') : null,
    host_ko: nn(p.hostKo),
    host_en: nn(p.hostEn),
    date_label_ko: nn(p.dateLabelKo),
    date_label_en: nn(p.dateLabelEn),
    is_event: p.board === 'alumniEvents' ? p.isEvent === true : false,
    event_date: isEvent && p.date ? p.date : null,
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
  is_event: boolean | null;
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
  attachments?: { label_ko: string | null; label_en: string | null; url: string; sort: number }[];
}

/** DB 행 → CMS 편집 레코드(마크다운 우선, 없으면 빈 문자열 — 구 데이터 호환) */
export function rowToEditRecord(r: DbPostRow) {
  return {
    id: String(r.id),
    board: r.board as string,
    slug: r.slug ?? null,
    date: (r.event_date && (r.board === 'events' || r.is_event)
      ? r.event_date
      : String(r.created_at).slice(0, 10)) as string,
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
    isEvent: r.is_event === true,
    image: r.thumbnail_url ?? '',
    attachments: (r.attachments ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({ labelKo: a.label_ko ?? '', labelEn: a.label_en ?? '', href: a.url })),
  };
}
