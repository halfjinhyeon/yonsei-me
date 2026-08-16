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
import { kstDate } from '@/lib/utils';
import {
  news as gitNews,
  alumniNews as gitAlumniNews,
  board as gitBoard,
  getAllBoardPosts as gitAllBoardPosts,
  getCalendarEntries as gitCalendarEntries,
  alumniEvents as gitAlumniEvents,
  normalizeNewsCategory,
  type NewsItem,
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
  /** 본문 — **목록 조회에는 실려 오지 않는다**(LIST_COLUMNS 주석 참조). 선택 필드인 이유가
   *  그것이고, 어댑터들은 값이 없으면 빈 문자열을 낸다(loc 이 undefined→'' 로 접는다).
   *  본문이 필요한 자리는 상세 조회(fetchRowById/fetchRowBySlug)뿐이다. */
  body_html_ko?: string;
  body_html_en?: string | null;
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
  /** 목록 최상단 고정 — 구 행은 null(스키마 추가 이전) */
  pinned: boolean | null;
  thumbnail_url: string | null;
  created_at: string;
  attachments: DbAttachment[] | null;
}

// ⚠️⚠️ 목록 조회의 컬럼을 **명시**하는 이유 — `select('*')` 로 되돌리지 말 것.
//
// 이 조회 결과는 unstable_cache 로 Vercel Data Cache 에 들어가는데, 그 캐시는 항목
// 하나가 **2MB** 를 넘으면 저장을 조용히 포기한다(오류도, 로그도 없다). 게시물을 대량
// 이전한 뒤 공개 글이 1,275건이 되면서 `*, attachments(*)` 응답이 약 3MB 가 됐고,
// 그래서 캐시는 한 번도 적중하지 못한 채 **매 요청이 전체 코퍼스를 다시 조회**하고
// 있었다(사이트가 눈에 띄게 느려진 원인). 측정해 보니 그중 body_html_* 만 1.57MB —
// 본문만 빼면 한도 아래로 넉넉히 내려온다.
//
// 그리고 목록은 본문을 **쓰지 않는다**. 본문이 필요한 곳은 상세 페이지 한 곳뿐이고
// (fetchRowById/fetchRowBySlug), 자료실 검색 인덱스만 예외라 7건짜리 전용 조회
// (fetchResourceBodies)로 따로 뗐다. 썸네일 폴백(firstBodyImage)도 thumbnail_url
// 백필 이후로는 본문 없이 동작한다.
//
// 새 컬럼을 어댑터에서 읽기 시작했다면 이 목록에도 더해야 한다 — 빠뜨리면 undefined 다.
const LIST_COLUMNS =
  'id, board, slug, title_ko, title_en, excerpt_ko, excerpt_en, category, ' +
  'host_ko, host_en, date_label_ko, date_label_en, is_event, event_date, end_date, ' +
  'link_url, pinned, thumbnail_url, created_at, attachments(*)';

/** 상세 조회용 — 본문 포함 전체 행 */
const DETAIL_COLUMNS = '*, attachments(*)';

// ── 게시 예약 게이트 ───────────────────────────────────────────────────
//
// CMS 가 글에 "공개 시각"을 실을 수 있다(posts-server.ts 의 AdminPostPayload.time).
// 스키마를 늘리지 않고 created_at(timestamptz) 에 `YYYY-MM-DDTHH:MM+09:00` 로 저장하므로,
// **사이트 조회는 created_at 이 아직 오지 않은 글을 빼면** 그것이 곧 예약 게시다.
//
// ⚠️ event_date 가 있는 행은 면제한다. 그 행들(행사·세미나·일정·동문행사)은
//    payloadToRow 가 created_at 에 **행사일**을 박는다 — 다음 달 행사를 지금 등록하면
//    created_at 도 다음 달이다. 면제하지 않으면 "앞으로 열릴 행사"가 사이트 목록과
//    홈 캘린더에서 통째로 사라진다(예약이 아니라 그 게시판의 날짜 의미가 그런 것뿐이다).
//    이관된 구 행들은 created_at 이 작성일이라 어차피 과거지만, CMS 로 새로 쓰거나
//    수정하는 순간 행사일로 덮인다 — 면제 조항이 실제로 일하는 지점은 거기다.
//    바꿔 말해 예약 게시가 걸리는 곳은 event_date 를 쓰지 않는 게시판 —
//    공지 4종·뉴스·동문 뉴스·학위논문·자료실·취업·인턴·인스타그램·비행사 동문글이다.
//
// ⚠️ 의미 변화: 이 게이트가 붙기 전에는 "게시일을 미래 날짜로 적어 둔" 글도 즉시 보였다.
//    이제 그런 글은 그 날짜 00:00(KST)까지 숨는다. 예약 기능의 정의상 올바른 방향이라
//    그대로 두되, 놀라지 않도록 여기 적어 둔다.
//
// ⚠️ 반영 지연: 아래 조회는 전부 unstable_cache(revalidate 600) 안에서 돌고 페이지도
//    revalidate=300 이다. now() 는 캐시 미스 때만 다시 평가되므로 예약 시각이 지나도
//    최대 10여 분 뒤에 나타난다. 분 단위 정확도가 필요한 기능이 아니라 그대로 둔다.
//
// ⚠️ 관리자 API(app/api/admin/**)에는 이 게이트를 넣지 않는다 — 관리자는 예약 글을
//    목록에서 보고 고칠 수 있어야 한다.
function scheduleGate(): string {
  // PostgREST or= 그룹. 값에 ':' 가 들어가므로 큰따옴표로 감싼다(구분자 오인 방지).
  return `event_date.not.is.null,created_at.lte."${new Date().toISOString()}"`;
}

// 전체 공개 글 1회 조회(본문 제외, 첨부 포함) — 'posts' 태그 하나로 단순·확실하게 캐시한다.
// 목록을 파생하는 모든 API 가 이 하나를 공유하고 메모리에서 게시판별로 나눈다.
const fetchListRows = unstable_cache(
  async (): Promise<DbPost[]> => {
    // ⚠️ PostgREST 는 응답 행 수에 상한(Supabase 기본 1,000)이 걸려 있고, 넘치면
    //    오류가 아니라 조용히 잘라서 준다. 학과 사이트 게시물을 대량 이전한 뒤로
    //    전체 공개 글이 1,000건을 넘으므로 range 로 끝까지 페이지를 넘겨 받는다.
    //    이 루프가 없으면 오래된 글이 전 게시판에서 소리 없이 사라진다.
    const PAGE = 1000;
    const rows: DbPost[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb()
        .from('posts')
        .select(LIST_COLUMNS)
        .eq('published', true)
        // 예약 게시 — 공개 시각이 오지 않은 글은 어느 목록에도 실리지 않는다
        .or(scheduleGate())
        .order('created_at', { ascending: false })
        // 같은 날짜가 여럿이면 정렬이 요청마다 흔들려 페이지 경계에서 행이
        // 중복·누락될 수 있다 — id 로 순서를 확정한다.
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`게시글 조회 실패: ${error.message}`);
      const page = (data ?? []) as unknown as DbPost[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows;
  },
  ['posts-list-nobody'],
  { tags: ['posts'], revalidate: 600 },
);

// ── 상세 조회 (본문 포함, 1행) ─────────────────────────────────────────
// 목록에서 본문을 뺐으므로 상세는 자기 행을 직접 읽는다. 전체를 훑어 find 하던
// 예전 방식과 달리 캐시 항목이 글 하나 크기라 2MB 한도와 무관하고, 재방문은
// 같은 키로 바로 맞는다. 무효화는 목록과 같은 'posts' 태그 하나로 함께 걸린다.

const fetchRowById = unstable_cache(
  async (id: number): Promise<DbPost | null> => {
    const { data, error } = await sb()
      .from('posts')
      .select(DETAIL_COLUMNS)
      .eq('published', true)
      // 예약 게시 — 목록에서 뺀 글이 주소를 직접 쳐서 열리면 게이트가 무의미하다
      .or(scheduleGate())
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`게시글 조회 실패(id=${id}): ${error.message}`);
    return (data as unknown as DbPost | null) ?? null;
  },
  ['post-by-id'],
  { tags: ['posts'], revalidate: 600 },
);

const fetchRowBySlugOnly = unstable_cache(
  async (board: string, slug: string): Promise<DbPost | null> => {
    const { data, error } = await sb()
      .from('posts')
      .select(DETAIL_COLUMNS)
      .eq('published', true)
      // 예약 게시 — 뉴스형 상세(slug 주소)도 같은 규칙으로 막는다
      .or(scheduleGate())
      .eq('board', board)
      .eq('slug', slug)
      // 목록 정렬과 같은 규칙 — slug 가 중복된 행이 생겨도 고르는 글이 흔들리지 않는다
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw new Error(`게시글 조회 실패(slug=${slug}): ${error.message}`);
    return ((data ?? [])[0] as unknown as DbPost | undefined) ?? null;
  },
  ['post-by-slug'],
  { tags: ['posts'], revalidate: 600 },
);

/** 뉴스형 상세 1건 — slug 로 찾되, slug 가 비어 있는 글은 목록이 id 를 slug 로 쓰므로
 *  (toNews 의 `r.slug ?? String(r.id)`) 숫자 주소도 같은 규칙으로 받아 준다. */
async function fetchRowBySlug(board: string, slug: string): Promise<DbPost | null> {
  const hit = await fetchRowBySlugOnly(board, slug);
  if (hit) return hit;
  if (!/^\d+$/.test(slug)) return null;
  const row = await fetchRowById(Number(slug));
  // 목록이 만들어 냈을 주소와 정확히 같을 때만 인정한다 — slug 를 가진 글이
  // id 주소로도 열리면 같은 글에 URL 이 둘 생긴다.
  if (!row || row.board !== board) return null;
  return (row.slug ?? String(row.id)) === slug ? row : null;
}

// ── DB 행 → 기존 타입 어댑터 ───────────────────────────────────────────
function loc(ko: string | null | undefined, en: string | null | undefined): Localized {
  const k = ko ?? '';
  return { ko: k, en: en && en.trim() !== '' ? en : k };
}


/** 표시용 날짜 — 행사·세미나(또는 isEvent)는 행사일, 그 외는 작성일.
 *  세미나를 행사일 기준에 넣은 이유: 캘린더가 세미나를 게시일 칸에 올려 제목의
 *  날짜(8/18)와 칸(8/11)이 어긋났다. event_date 없는 구 글은 작성일로 폴백한다. */
function dateOf(r: DbPost): string {
  // event_date 는 date 칼럼이라 시간대가 없다 — 그대로 쓴다.
  if ((r.board === 'events' || r.board === 'seminars' || r.is_event) && r.event_date)
    return r.event_date;
  return kstDate(r.created_at);
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

/** 본문 HTML(정화 저장분)에서 첫 <img> 의 src 추출 — 썸네일 미지정 시 폴백.
 *  `<img` 바로 뒤 공백을 요구해 img 로 시작하는 다른 태그명 오탐을 차단한다.
 *  ⚠️ 목록 행에는 본문이 없어(LIST_COLUMNS) 이 폴백이 돌지 않는다. 대신 thumbnail_url 을
 *  일괄 백필해 두었다(본문 사진이 있는데 썸네일이 없는 글은 4건뿐, 모두 이모지·추적
 *  픽셀이라 의도적으로 제외한 것들이다). 상세 행에서는 그대로 동작한다. */
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
    // 분류는 일반/성과 2종 — DB 에 남은 구 값(notice/seminar)은 '일반'으로 눕힌다
    category: normalizeNewsCategory(r.category),
    date: dateOf(r),
    title: loc(r.title_ko, r.title_en),
    excerpt: loc(r.excerpt_ko, r.excerpt_en),
    body: loc(r.body_html_ko, r.body_html_en),
    image: thumbOf(r) ?? '',
    ...(attsOf(r) ? { attachments: attsOf(r) } : {}),
    // 고정은 켜졌을 때만 실어 보낸다 — 값이 있을 때만 넣는 다른 선택 필드와 같은 관례
    ...(r.pinned ? { pinned: true } : {}),
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
    // 고정(toSeminar·toEvent·toAlumniEvent 가 스프레드로 상속받는다)
    ...(r.pinned ? { pinned: true } : {}),
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

// ── 통합 게시판 글(BoardPost) 라벨 — 단일 출처 ─────────────────────────
// 목록(fetchAllBoardPosts)과 상세(fetchBoardPost)가 서로 다른 경로로 같은 글을 만들므로
// boardKey·meta 표를 양쪽에 복사해 두면 언젠가 어긋난다. 여기 한 곳만 본다.
// 표에 없는 게시판(news/alumniNews/alumniEvents/instagram/calendar)은 통합 목록의
// 대상이 아니다 — 자기 전용 라우트를 쓴다.
const BOARD_POST_META: Record<string, { boardKey: BoardPost['boardKey']; meta?: Localized }> = {
  noticesUndergrad: { boardKey: 'notices', meta: { ko: '학부 공지', en: 'Undergraduate' } },
  noticesGraduate: { boardKey: 'notices', meta: { ko: '대학원 공지', en: 'Graduate' } },
  noticesExternal: { boardKey: 'notices', meta: { ko: '외부기관 공지', en: 'External' } },
  noticesScholarship: { boardKey: 'notices', meta: { ko: '장학생 선발공고', en: 'Scholarship' } },
  // 아래 넷은 meta 가 게시판 고정 라벨이 아니라 행마다 다른 값이라 표에 두지 않는다:
  // 세미나는 연사(host), 행사는 기간(dateLabel), 나머지는 meta 없음.
  seminars: { boardKey: 'seminars' },
  events: { boardKey: 'events' },
  thesis: { boardKey: 'thesis' },
  career: { boardKey: 'career' },
  resources: { boardKey: 'resources' },
  internships: { boardKey: 'internships' },
};

function noticeToBoardPost(n: Notice, board: string): BoardPost {
  const m = BOARD_POST_META[board];
  return { ...n, boardKey: m.boardKey, ...(m.meta ? { meta: m.meta } : {}) };
}

const seminarToBoardPost = (s: Seminar): BoardPost => ({
  id: s.id, date: s.date, title: s.title, body: s.body,
  boardKey: 'seminars', meta: s.host, attachments: s.attachments,
});

const eventToBoardPost = (e: EventItem): BoardPost => ({
  id: e.id, date: e.date, title: e.title, body: e.body,
  boardKey: 'events', meta: e.dateLabel, attachments: e.attachments,
});

/** DB 행 → BoardPost. 통합 게시판 소속이 아니면 undefined(상세 페이지의 404 경로). */
function rowToBoardPost(r: DbPost): BoardPost | undefined {
  if (!BOARD_POST_META[r.board]) return undefined;
  if (r.board === 'seminars') return seminarToBoardPost(toSeminar(r));
  if (r.board === 'events') return eventToBoardPost(toEvent(r));
  return noticeToBoardPost(toNotice(r), r.board);
}

const byDateDesc = <T extends { date: string }>(arr: T[]) =>
  arr.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

/** 고정 글 먼저, 그 안에서(그리고 나머지도) 최신순 — 게시판 목록 공통 정렬 */
const byPinnedDate = <T extends { date: string; pinned?: boolean }>(arr: T[]) =>
  arr.slice().sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.date < b.date ? 1 : -1),
  );

/** git 폴백용 — 날짜 재정렬 없이 고정만 앞으로(파일 순서 보존, 안정 분할) */
const pinnedFirst = <T extends { pinned?: boolean }>(arr: T[]) => [
  ...arr.filter((p) => p.pinned),
  ...arr.filter((p) => !p.pinned),
];

async function rowsOf(board: string): Promise<DbPost[]> {
  return (await fetchListRows()).filter((r) => r.board === board);
}

// ── 공개 API (기존 content.ts 이름과 대응) ─────────────────────────────

export async function fetchNews(): Promise<NewsItem[]> {
  if (postsSource() === 'git') return pinnedFirst(gitNews);
  return byPinnedDate((await rowsOf('news')).map(toNews));
}

export async function fetchAlumniNews(): Promise<NewsItem[]> {
  if (postsSource() === 'git') return pinnedFirst(gitAlumniNews);
  return byPinnedDate((await rowsOf('alumniNews')).map(toNews));
}

/** 뉴스 상세 1건 — 목록에는 본문이 없으므로(LIST_COLUMNS) 자기 행을 직접 읽는다 */
export async function fetchNewsBySlug(slug: string): Promise<NewsItem | undefined> {
  if (postsSource() === 'git') return gitNews.find((n) => n.slug === slug);
  const r = await fetchRowBySlug('news', slug);
  return r ? toNews(r) : undefined;
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

/** 동문 소식 상세 1건 — 뉴스와 같은 이유로 단건 조회 */
export async function fetchAlumniNewsBySlug(slug: string): Promise<NewsItem | undefined> {
  if (postsSource() === 'git') return gitAlumniNews.find((n) => n.slug === slug);
  const r = await fetchRowBySlug('alumniNews', slug);
  return r ? toNews(r) : undefined;
}

/** board.json 대응 — 게시판별 배열 묶음 */
export async function fetchBoardData(): Promise<typeof gitBoard> {
  if (postsSource() === 'git') {
    // 폴백에서도 고정은 지킨다 — 같은 모양을 그대로 돌려주되 각 배열만 앞당긴다
    return {
      seminars: pinnedFirst(gitBoard.seminars),
      events: pinnedFirst(gitBoard.events),
      noticesUndergrad: pinnedFirst(gitBoard.noticesUndergrad),
      noticesGraduate: pinnedFirst(gitBoard.noticesGraduate),
      noticesExternal: pinnedFirst(gitBoard.noticesExternal),
      noticesScholarship: pinnedFirst(gitBoard.noticesScholarship),
      thesis: pinnedFirst(gitBoard.thesis),
      career: pinnedFirst(gitBoard.career),
      resources: pinnedFirst(gitBoard.resources),
      internships: pinnedFirst(gitBoard.internships),
      alumniEvents: pinnedFirst(gitBoard.alumniEvents),
    };
  }
  const rows = await fetchListRows();
  const of = (b: string) => rows.filter((r) => r.board === b);
  return {
    seminars: byPinnedDate(of('seminars').map(toSeminar)),
    events: byPinnedDate(of('events').map(toEvent)),
    noticesUndergrad: byPinnedDate(of('noticesUndergrad').map(toNotice)),
    noticesGraduate: byPinnedDate(of('noticesGraduate').map(toNotice)),
    noticesExternal: byPinnedDate(of('noticesExternal').map(toNotice)),
    noticesScholarship: byPinnedDate(of('noticesScholarship').map(toNotice)),
    thesis: byPinnedDate(of('thesis').map(toNotice)),
    career: byPinnedDate(of('career').map(toNotice)),
    resources: byPinnedDate(of('resources').map(toNotice)),
    internships: byPinnedDate(of('internships').map(toNotice)),
    alumniEvents: byPinnedDate(of('alumniEvents').map(toAlumniEvent)),
  };
}

/** getAllBoardPosts 대응 — 사이트맵·검색용 통합 목록 (meta 라벨 규칙 동일).
 *  ⚠️ 여기서 나오는 글들의 body 는 빈 문자열이다(목록 조회에 본문이 없다).
 *  본문이 필요하면 fetchBoardPost(id) 를 쓸 것. */
export async function fetchAllBoardPosts(): Promise<BoardPost[]> {
  if (postsSource() === 'git') return gitAllBoardPosts();
  const b = await fetchBoardData();
  return [
    ...b.noticesUndergrad.map((n) => noticeToBoardPost(n, 'noticesUndergrad')),
    ...b.noticesGraduate.map((n) => noticeToBoardPost(n, 'noticesGraduate')),
    ...b.noticesExternal.map((n) => noticeToBoardPost(n, 'noticesExternal')),
    ...b.noticesScholarship.map((n) => noticeToBoardPost(n, 'noticesScholarship')),
    ...b.seminars.map(seminarToBoardPost),
    ...b.events.map(eventToBoardPost),
    ...b.thesis.map((t) => noticeToBoardPost(t, 'thesis')),
    ...b.career.map((c) => noticeToBoardPost(c, 'career')),
    ...b.resources.map((r) => noticeToBoardPost(r, 'resources')),
    ...b.internships.map((n) => noticeToBoardPost(n, 'internships')),
  ];
}

/** 게시판 글 상세 1건 — 본문 포함. 통합 목록을 훑지 않고 그 행만 읽는다. */
export async function fetchBoardPost(id: string): Promise<BoardPost | undefined> {
  if (postsSource() === 'git') return gitAllBoardPosts().find((p) => p.id === id);
  if (!/^\d+$/.test(id)) return undefined; // DB id 는 연번 — 그 외 주소는 조회할 것도 없다
  const r = await fetchRowById(Number(id));
  return r ? rowToBoardPost(r) : undefined;
}

/** 동문 소식·네트워크 (동문 전용 라우트) */
export async function fetchAlumniEvents(): Promise<AlumniEvent[]> {
  if (postsSource() === 'git') return pinnedFirst(gitAlumniEvents);
  return byPinnedDate((await rowsOf('alumniEvents')).map(toAlumniEvent));
}

/** 동문 행사 상세 1건 — 본문 포함 단건 조회 */
export async function fetchAlumniEventById(id: string): Promise<AlumniEvent | undefined> {
  if (postsSource() === 'git') return gitAlumniEvents.find((e) => e.id === id);
  if (!/^\d+$/.test(id)) return undefined;
  const r = await fetchRowById(Number(id));
  return r && r.board === 'alumniEvents' ? toAlumniEvent(r) : undefined;
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

// ── 자료실 검색 인덱스용 본문 ──────────────────────────────────────────
// 목록에서 본문을 뺀 뒤 유일하게 남은 "목록인데 본문이 필요한" 자리. 자료실은 받아 가는
// 파일 목록이라 제목·첨부만으로는 원하는 서식을 못 찾는 일이 있어 본문까지 훑는다.
// 다행히 자료실은 7건뿐이라 전용 조회가 부담이 없다 — 전체 1,275건에 본문을 다시
// 실어 2MB 한도를 넘기는 것과는 비교가 안 된다.
const fetchResourceBodiesDb = unstable_cache(
  async (): Promise<Record<string, Localized>> => {
    const { data, error } = await sb()
      .from('posts')
      .select('id, body_html_ko, body_html_en')
      .eq('published', true)
      // 예약 게시 — 목록(fetchBoardData)과 같은 집합이어야 검색 인덱스에 유령 항목이
      // 생기지 않는다(자료실은 event_date 를 쓰지 않아 게이트가 실제로 걸린다)
      .or(scheduleGate())
      .eq('board', 'resources');
    if (error) throw new Error(`자료실 본문 조회 실패: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<{
      id: number;
      body_html_ko: string | null;
      body_html_en: string | null;
    }>;
    return Object.fromEntries(rows.map((r) => [String(r.id), loc(r.body_html_ko, r.body_html_en)]));
  },
  ['posts-resource-bodies'],
  { tags: ['posts'], revalidate: 600 },
);

/** 자료실 글 id → 본문. 목록(fetchBoardData().resources)의 body 가 비어 있으므로
 *  검색 인덱스를 만드는 쪽이 이걸 따로 받아 간다(서버에서만 쓰고 클라이언트로는
 *  태그를 지운 검색 문자열만 나간다). */
export async function fetchResourceBodies(): Promise<Record<string, Localized>> {
  if (postsSource() === 'git') {
    return Object.fromEntries(gitBoard.resources.map((r) => [r.id, r.body]));
  }
  return fetchResourceBodiesDb();
}
