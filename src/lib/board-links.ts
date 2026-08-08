/**
 * 게시판 URL 단일 출처 — 목록·상세·레거시 해시의 경로 문법이 전부 여기서 나온다.
 *
 * 문법 (2026-08 개편):
 *   /news/<탭>                게시판 목록 (탭이 곧 경로)
 *   /news/<탭>/<id>           게시판 글 상세 (소속 게시판이 URL 에 있다)
 *   /news/press/<slug>        뉴스 기사 상세 (탭 키 'news' 는 URL 에서 'press' —
 *                             /news/news/ 중첩을 피한다. 라벨·boardKey 는 그대로)
 *   /research/internships/<id> 인턴 모집 상세 (연구 메뉴 소속 게시판 — 목록은
 *                             /research#internships 콘텐츠 탭에 남는다)
 *   /alumni/news, /alumni/network  동문 게시판 목록 (/alumni 자체는 동문회 소개)
 *
 * ⚠️ 게시물 링크를 손으로 조립하지 마라 — boardPostHref/newsArticleHref 를 쓴다.
 *    경로가 또 바뀌면 여기 한 곳만 고치면 되도록 하기 위한 파일이다.
 * ⚠️ DB posts.board 값·boardKey('news' 없음, internships 포함 7종)는 이 파일과 무관한
 *    저장 계층 식별자다 — URL 을 바꾸려고 boardKey 를 개명하면 안 된다.
 */
import type { BoardPost } from '@/lib/content';

/** 뉴스 섹션 탭 — seg 가 URL 세그먼트, labelKey 가 menu.news.items.* 메시지 키 */
export const NEWS_TABS = [
  { seg: 'notices', labelKey: 'notices' },
  { seg: 'press', labelKey: 'news' }, // 뉴스 기사 — URL 만 press, 라벨은 기존 키
  { seg: 'thesis', labelKey: 'thesis' },
  { seg: 'resources', labelKey: 'resources' },
  { seg: 'career', labelKey: 'career' },
  { seg: 'events', labelKey: 'events' },
  { seg: 'seminars', labelKey: 'seminars' },
  { seg: 'calendar', labelKey: 'calendar' },
] as const;

export type NewsTabSeg = (typeof NEWS_TABS)[number]['seg'];

/** 뉴스 섹션 기본 탭 — /news 진입 시 이 목록으로 보낸다 */
export const DEFAULT_NEWS_TAB: NewsTabSeg = 'notices';

/** 로케일 접두사 없는 목록 경로 ('/news/notices' 형태) */
export function newsTabHref(seg: NewsTabSeg): string {
  return `/news/${seg}`;
}

/** 뉴스 기사 상세 (구 /news/[slug]) */
export function newsArticleHref(slug: string): string {
  return `/news/press/${slug}`;
}

/**
 * 게시판 글 상세 — boardKey 로 소속 섹션까지 결정한다.
 * internships 는 연구 메뉴 소속이라 /research 아래로 간다(상세 셸도 연구 컨텍스트).
 */
export function boardPostHref(post: Pick<BoardPost, 'id' | 'boardKey'>): string {
  if (post.boardKey === 'internships') return `/research/internships/${post.id}`;
  return `/news/${post.boardKey}/${post.id}`;
}

/** 동문 게시판 상세 */
export function alumniNewsHref(slug: string): string {
  return `/alumni/news/${slug}`;
}
export function alumniEventHref(id: string): string {
  return `/alumni/network/${id}`;
}

/**
 * 레거시 해시(#탭키) → 새 경로. 구 링크 `/news#seminars` 는 서버에 해시가 오지 않아
 * 308 로 /news/notices#seminars 에 떨어진다(브라우저가 해시를 보존) — 목록 페이지의
 * LegacyBoardHash 가 이 표로 최종 목적지로 replace 한다.
 */
export const LEGACY_NEWS_HASH: Record<string, string> = Object.fromEntries(
  NEWS_TABS.map(({ seg, labelKey }) => [labelKey, newsTabHref(seg)]),
);
export const LEGACY_ALUMNI_HASH: Record<string, string> = {
  association: '/alumni',
  news: '/alumni/news',
  network: '/alumni/network',
};

/**
 * 뉴스 기사 slug 예약어 — /news/<seg> 정적 폴더와 /news/[slug] 리다이렉트 리졸버가
 * 같은 자리를 쓰므로, slug 가 탭 세그먼트와 같으면 영구히 가려진다(정적 세그먼트 우선).
 * CMS slug 검증에서 이 목록을 거부해야 한다.
 */
export const RESERVED_NEWS_SLUGS: readonly string[] = [...NEWS_TABS.map((t) => t.seg), 'post'];
