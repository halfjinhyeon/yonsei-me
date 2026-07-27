// 게시판 데이터 레이어 (서버 전용) — 백엔드 전환 Phase 2.
//
// 게시판 10종의 "읽기"를 이 모듈로 일원화한다. 소스는 둘:
//  - db  : Supabase(posts/attachments). unstable_cache + 'posts' 태그로 캐시되고,
//          CMS 쓰기가 revalidateTag('posts') 를 호출하면 재배포 없이 갱신된다.
//  - git : 기존 content/*.json (content.ts) — 롤백/오프라인 폴백.
//  기본값은 SUPABASE_URL 이 있으면 db. BOARDS_SOURCE=git env 로 강제 롤백 가능.
//
// 반환 타입은 기존 content.ts 의 것(NewsItem/Notice/Seminar/EventItem/BoardPost…)을
// 그대로 사용해 페이지 수정을 최소화한다. 단 body 의 의미가 소스에 따라 다르다:
//  - db  : body = 정화된 HTML (에디터 산출물, 마이그레이션 시 마크다운→HTML 변환)
//  - git : body = 마크다운 원문
// 상세 페이지는 postsBodyFormat() 을 PostArticle 의 bodyFormat 으로 넘겨 구분한다.

import { unstable_cache } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  news as gitNews,
  alumniNews as gitAlumniNews,
  board as gitBoard,
  getAllBoardPosts as gitAllBoardPosts,
  getCalendarEntries as gitCalendarEntries,
  alumniEvents as gitAlumniEvents,
  type NewsItem,
  type NewsCategory,
  type Notice,
  type Seminar,
  type EventItem,
  type AlumniEvent,
  type BoardPost,
  type CalendarEntry,
  type Attachment,
  type Localized,
} from './content';

// ── 소스 판별 ──────────────────────────────────────────────────────────
export type PostsSource = 'db' | 'git';

export function postsSource(): PostsSource {
  if (process.env.BOARDS_SOURCE === 'git') return 'git'; // 명시적 롤백 스위치
  return process.env.SUPABASE_URL ? 'db' : 'git';
}

/** 상세 페이지가 body 를 어떻게 렌더할지 — db=HTML(정화됨), git=마크다운 */
export function postsBodyFormat(): 'html' | 'markdown' {
  return postsSource() === 'db' ? 'html' : 'markdown';
}

// ── Supabase 클라이언트 (lazy, 서버 전용 service key) ───────────────────
let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

// ── DB 행 형태 (scripts/sql/schema.sql 과 1:1) ─────────────────────────
interface DbAttachment {
  id: number;
  label_ko: string | null;
  label_en: string | null;
  url: string;
  sort: number;
  /** 바이트 크기 — 구 행은 null(스키마 추가 이전). 자료실 목록의 크기 표기에 쓴다 */
  size_bytes: number | null;
}
interface DbPost {
  id: number;
  board: string;
  slug: string | null;
  title_ko: string;
  title_en: string | null;
  body_html_ko: string;
  body_html_en: string | null;
  excerpt_ko: string | null;
  excerpt_en: string | null;
  category: string | null;
  host_ko: string | null;
  host_en: string | null;
  date_label_ko: string | null;
  date_label_en: string | null;
  is_event: boolean;
  event_date: string | null;
  end_date: string | null;
  link_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  attachments: DbAttachment[] | null;
}

// 전체 공개 글 1회 조회(첨부 포함) — 'posts' 태그 하나로 단순·확실하게 캐시한다.
// 학과 게시판 규모(수백 건)에선 파생 목록을 메모리에서 나누는 편이 낫다.
const fetchAllRows = unstable_cache(
  async (): Promise<DbPost[]> => {
    const { data, error } = await sb()
      .from('posts')
      .select('*, attachments(*)')
      .eq('published', true)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`게시글 조회 실패: ${error.message}`);
    return (data ?? []) as DbPost[];
  },
  ['posts-all-published'],
  { tags: ['posts'], revalidate: 600 },
);

// ── DB 행 → 기존 타입 어댑터 ───────────────────────────────────────────
function loc(ko: string | null | undefined, en: string | null | undefined): Localized {
  const k = ko ?? '';
  return { ko: k, en: en && en.trim() !== '' ? en : k };
}

/** 표시용 날짜 — 행사(또는 isEvent)는 행사일, 그 외는 작성일 */
function dateOf(r: DbPost): string {
  if ((r.board === 'events' || r.is_event) && r.event_date) return r.event_date;
  return r.created_at.slice(0, 10);
}

function attsOf(r: DbPost): Attachment[] | undefined {
  const list = (r.attachments ?? []).slice().sort((a, b) => a.sort - b.sort);
  if (list.length === 0) return undefined;
  return list.map((a) => ({
    label: loc(a.label_ko, a.label_en),
    href: a.url,
    ...(a.size_bytes && a.size_bytes > 0 ? { size: a.size_bytes } : {}),
  }));
}

/** 본문 HTML(정화 저장분)에서 첫 <img> 의 src 추출 — 썸네일 미지정 시 목록 폴백.
 *  `<img` 바로 뒤 공백을 요구해 img 로 시작하는 다른 태그명 오탐을 차단한다. */
const FIRST_IMG_RE = /<img\s[^>]*?src=["']([^"']+)["']/i;
function firstBodyImage(r: DbPost): string | undefined {
  const m = (r.body_html_ko ?? '').match(FIRST_IMG_RE) ?? (r.body_html_en ?? '').match(FIRST_IMG_RE);
  return m?.[1];
}

/** 표시용 썸네일 — 지정 썸네일 우선, 없으면 본문 첫 사진(붙여넣기·드래그 포함) */
function thumbOf(r: DbPost): string | undefined {
  return r.thumbnail_url ?? firstBodyImage(r);
}

function toNews(r: DbPost): NewsItem {
  return {
    slug: r.slug ?? String(r.id),
    category: (r.category ?? 'notice') as NewsCategory,
    date: dateOf(r),
    title: loc(r.title_ko, r.title_en),
    excerpt: loc(r.excerpt_ko, r.excerpt_en),
    body: loc(r.body_html_ko, r.body_html_en),
    image: thumbOf(r) ?? '',
    ...(attsOf(r) ? { attachments: attsOf(r) } : {}),
  };
}

function toNotice(r: DbPost): Notice {
  const thumb = thumbOf(r);
  return {
    id: String(r.id),
    date: dateOf(r),
    title: loc(r.title_ko, r.title_en),
    body: loc(r.body_html_ko, r.body_html_en),
    // 에디토리얼 목록용 썸네일·발췌 — 값이 있을 때만 (모든 게시판 공통, toSeminar 등에 전파)
    ...(thumb ? { image: thumb } : {}),
    ...(r.excerpt_ko || r.excerpt_en ? { excerpt: loc(r.excerpt_ko, r.excerpt_en) } : {}),
    ...(attsOf(r) ? { attachments: attsOf(r) } : {}),
    // 게시판 자체 분류(자료실의 서식/규정 등) — 값이 있을 때만 실어 보낸다
    ...(r.category ? { category: r.category } : {}),
  };
}

function toSeminar(r: DbPost): Seminar {
  // end_date(종료일) — 세미나·동문행사(toAlumniEvent 가 스프레드로 상속)도 기간을 가질 수 있다
  return {
    ...toNotice(r),
    host: loc(r.host_ko, r.host_en),
    ...(r.end_date ? { endDate: r.end_date } : {}),
  };
}

function toEvent(r: DbPost): EventItem {
  return {
    ...toNotice(r),
    dateLabel: loc(r.date_label_ko, r.date_label_en),
    ...(r.end_date ? { endDate: r.end_date } : {}),
  };
}

function toAlumniEvent(r: DbPost): AlumniEvent {
  return { ...toSeminar(r), ...(r.is_event ? { isEvent: true } : {}) };
}

const byDateDesc = <T extends { date: string }>(arr: T[]) =>
  arr.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

async function rowsOf(board: string): Promise<DbPost[]> {
  return (await fetchAllRows()).filter((r) => r.board === board);
}

// ── 공개 API (기존 content.ts 이름과 대응) ─────────────────────────────

export async function fetchNews(): Promise<NewsItem[]> {
  if (postsSource() === 'git') return gitNews;
  return byDateDesc((await rowsOf('news')).map(toNews));
}

export async function fetchAlumniNews(): Promise<NewsItem[]> {
  if (postsSource() === 'git') return gitAlumniNews;
  return byDateDesc((await rowsOf('alumniNews')).map(toNews));
}

export async function fetchNewsBySlug(slug: string): Promise<NewsItem | undefined> {
  return (await fetchNews()).find((n) => n.slug === slug);
}

/** 홈 인스타그램 그리드용 게시물 — CMS '인스타그램' 게시판(DB 전용, git 폴백은 빈 목록).
 *  제목 = 캡션, thumbnail = 타일 사진, link_url = 실제 게시물(새 창). URL 없는 행은 제외. */
export interface InstagramPost {
  id: string;
  date: string;
  caption: Localized;
  image?: string;
  url: string;
}

export async function fetchInstagramPosts(): Promise<InstagramPost[]> {
  if (postsSource() === 'git') return [];
  return byDateDesc(
    (await rowsOf('instagram'))
      .filter((r) => (r.link_url ?? '').trim() !== '')
      .map((r) => ({
        id: String(r.id),
        date: dateOf(r),
        caption: loc(r.title_ko, r.title_en),
        ...(thumbOf(r) ? { image: thumbOf(r) } : {}),
        url: (r.link_url as string).trim(),
      })),
  );
}

/** 홈 캘린더용 '캘린더 전용 일정' — CMS '일정 (캘린더)' 게시판(DB 전용, git 폴백은 빈 목록).
 *  게시글 본문이 없는 학사일정이라 event_date(시작)·end_date(종료)·category 만 쓴다.
 *  link_url 은 선택 — 없으면 홈에서 링크 없는 정적 카드가 된다. */
export interface CalendarPost {
  id: string;
  /** 시작일 YYYY-MM-DD */
  start: string;
  /** 종료일. 없으면 하루 일정 */
  end?: string;
  title: Localized;
  category: string;
  /** 선택 링크 — 비면 홈 카드가 <div> 로 렌더된다 */
  href?: string;
}

export async function fetchCalendarPosts(): Promise<CalendarPost[]> {
  if (postsSource() === 'git') return [];
  return (await rowsOf('calendar'))
    // 시작일이 없는 행은 달력에 놓을 자리가 없다 — 조용히 뺀다.
    .filter((r) => (r.event_date ?? '').trim() !== '')
    .map((r) => ({
      id: String(r.id),
      start: r.event_date as string,
      ...(r.end_date ? { end: r.end_date } : {}),
      title: loc(r.title_ko, r.title_en),
      category: r.category ?? 'academic',
      ...((r.link_url ?? '').trim() !== '' ? { href: (r.link_url as string).trim() } : {}),
    }))
    // 시작일 오름차순 — 소비하는 쪽이 다시 정렬하지만, 순서가 매번 흔들리면
    // 같은 날짜끼리의 배열이 요청마다 달라져 정적 렌더 결과가 불안정해진다.
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

export async function fetchAlumniNewsBySlug(slug: string): Promise<NewsItem | undefined> {
  return (await fetchAlumniNews()).find((n) => n.slug === slug);
}

/** board.json 대응 — 게시판별 배열 묶음 */
export async function fetchBoardData(): Promise<typeof gitBoard> {
  if (postsSource() === 'git') return gitBoard;
  const rows = await fetchAllRows();
  const of = (b: string) => rows.filter((r) => r.board === b);
  return {
    seminars: byDateDesc(of('seminars').map(toSeminar)),
    events: byDateDesc(of('events').map(toEvent)),
    noticesUndergrad: byDateDesc(of('noticesUndergrad').map(toNotice)),
    noticesGraduate: byDateDesc(of('noticesGraduate').map(toNotice)),
    noticesExternal: byDateDesc(of('noticesExternal').map(toNotice)),
    noticesScholarship: byDateDesc(of('noticesScholarship').map(toNotice)),
    thesis: byDateDesc(of('thesis').map(toNotice)),
    career: byDateDesc(of('career').map(toNotice)),
    resources: byDateDesc(of('resources').map(toNotice)),
    internships: byDateDesc(of('internships').map(toNotice)),
    alumniEvents: byDateDesc(of('alumniEvents').map(toAlumniEvent)),
  };
}

/** getAllBoardPosts 대응 — 상세/사이트맵용 통합 목록 (meta 라벨 규칙 동일) */
export async function fetchAllBoardPosts(): Promise<BoardPost[]> {
  if (postsSource() === 'git') return gitAllBoardPosts();
  const b = await fetchBoardData();
  return [
    ...b.noticesUndergrad.map(
      (n): BoardPost => ({ ...n, boardKey: 'notices', meta: { ko: '학부 공지', en: 'Undergraduate' } }),
    ),
    ...b.noticesGraduate.map(
      (n): BoardPost => ({ ...n, boardKey: 'notices', meta: { ko: '대학원 공지', en: 'Graduate' } }),
    ),
    ...b.noticesExternal.map(
      (n): BoardPost => ({ ...n, boardKey: 'notices', meta: { ko: '외부기관 공지', en: 'External' } }),
    ),
    ...b.noticesScholarship.map(
      (n): BoardPost => ({ ...n, boardKey: 'notices', meta: { ko: '장학생 선발공고', en: 'Scholarship' } }),
    ),
    ...b.seminars.map(
      (s): BoardPost => ({
        id: s.id, date: s.date, title: s.title, body: s.body,
        boardKey: 'seminars', meta: s.host, attachments: s.attachments,
      }),
    ),
    ...b.events.map(
      (e): BoardPost => ({
        id: e.id, date: e.date, title: e.title, body: e.body,
        boardKey: 'events', meta: e.dateLabel, attachments: e.attachments,
      }),
    ),
    ...b.thesis.map((t): BoardPost => ({ ...t, boardKey: 'thesis' })),
    ...b.career.map((c): BoardPost => ({ ...c, boardKey: 'career' })),
    ...b.resources.map((r): BoardPost => ({ ...r, boardKey: 'resources' })),
    ...b.internships.map((n): BoardPost => ({ ...n, boardKey: 'internships' })),
  ];
}

export async function fetchBoardPost(id: string): Promise<BoardPost | undefined> {
  return (await fetchAllBoardPosts()).find((p) => p.id === id);
}

/** 동문 소식·네트워크 (동문 전용 라우트) */
export async function fetchAlumniEvents(): Promise<AlumniEvent[]> {
  if (postsSource() === 'git') return gitAlumniEvents;
  return byDateDesc((await rowsOf('alumniEvents')).map(toAlumniEvent));
}

export async function fetchAlumniEventById(id: string): Promise<AlumniEvent | undefined> {
  return (await fetchAlumniEvents()).find((e) => e.id === id);
}

/** 금주 캘린더 — 행사 전체 + 동문(isEvent) */
export async function fetchCalendarEntries(): Promise<CalendarEntry[]> {
  if (postsSource() === 'git') return gitCalendarEntries();
  const b = await fetchBoardData();
  const events: CalendarEntry[] = b.events.map((e) => ({
    id: e.id, date: e.date, title: e.title, category: 'event',
  }));
  const alumni: CalendarEntry[] = b.alumniEvents
    .filter((a) => a.isEvent && a.date)
    .map((a) => ({ id: a.id, date: a.date, title: a.title, category: 'alumni' }));
  return [...events, ...alumni];
}
