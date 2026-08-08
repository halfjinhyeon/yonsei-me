/**
 * 게시판 셸(BoardShell)의 탭 배열 — 뉴스 8개 · 연구 5개.
 *
 * 목록 8페이지와 상세 7라우트가 모두 같은 탭 줄을 그리므로 여기 한 곳에서만 만든다.
 * (`_shared` 는 밑줄 접두사라 Next 라우팅에서 제외되는 비공개 폴더다.)
 *
 * ⚠️ 탭 key/href 를 손으로 적지 마라 — `@/lib/board-links` 의 NEWS_TABS·newsTabHref 가
 *    URL 문법의 단일 출처다. 라벨만 메시지(`menu.news.items.*`)에서 온다.
 */
import { getTranslations } from 'next-intl/server';
import type { BoardShellTab } from '@/components/BoardShell';
import { NEWS_TABS, newsTabHref } from '@/lib/board-links';
import type { Locale } from '@/i18n/routing';

/**
 * 뉴스 섹션 8개 탭.
 * key = URL 세그먼트(= 게시판 boardKey. 뉴스 기사만 'press' 로 갈린다),
 * href = 실제 경로(`/news/<seg>`) — 해시가 아니라 크롤 가능한 링크다.
 */
export async function getNewsTabs(locale: Locale): Promise<BoardShellTab[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return NEWS_TABS.map(({ seg, labelKey }) => ({
    key: seg,
    label: tMenu(`news.items.${labelKey}`),
    href: newsTabHref(seg),
  }));
}

/**
 * 인턴 모집 상세(`/research/internships/<id>`)가 쓰는 연구 탭.
 * 연구 페이지는 아직 **콘텐츠 탭(TabbedContent)** 이라 해시가 현역 문법이다 —
 * 그래서 href 가 `/research#<key>` 다. 뉴스처럼 경로로 쪼개지 않는다.
 *
 * 목록에 'recruit'(교수 초빙)가 빠져 있는 것은 기존 동작 그대로다 — 상세 셸의 탭 구성을
 * 이번 개편에서 바꾸지 않는다(연구 탭 자체 개편 때 함께 정리할 일).
 */
const RESEARCH_TAB_KEYS = ['vision', 'capacity', 'labs', 'internships', 'social'] as const;

export async function getResearchTabs(locale: Locale): Promise<BoardShellTab[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return RESEARCH_TAB_KEYS.map((key) => ({
    key,
    label: tMenu(`research.items.${key}`),
    href: `/research#${key}`,
  }));
}
