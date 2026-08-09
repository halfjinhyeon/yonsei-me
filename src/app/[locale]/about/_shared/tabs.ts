/**
 * 소개 섹션 탭 배열·라벨·메타데이터 — 6개 탭 페이지가 공유한다.
 * (`_shared` 는 밑줄 접두사라 Next 라우팅에서 제외되는 비공개 폴더다.)
 *
 * ⚠️ 탭 key/href 를 손으로 적지 마라 — `@/lib/board-links` 의 CONTENT_SECTIONS·
 *    sectionTabHref 가 URL 문법의 단일 출처다. 라벨만 메시지(`menu.about.items.*`)에서 온다.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { TabNavItem } from '@/components/TabPageShell';
import { CONTENT_SECTIONS, sectionTabHref } from '@/lib/board-links';
import { pageAlternates } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/** 'history' | 'faculty' | 'staff' | 'directions' | 'admission' | 'careers' */
export type AboutTabKey = (typeof CONTENT_SECTIONS.about)[number];

/** 섹션 루트(/about)가 308 하는 기본 탭 — 레거시 해시 구제를 여기에만 얹는다 */
export const DEFAULT_ABOUT_TAB: AboutTabKey = CONTENT_SECTIONS.about[0];

/** 탭 라벨 ("학과 소개", "교수진" …) — 메가메뉴와 같은 메시지 키를 쓴다 */
export async function aboutTabLabel(locale: Locale, tab: AboutTabKey): Promise<string> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return tMenu(`about.items.${tab}`);
}

/**
 * TabNavBar 에 넘길 탭 배열.
 * key = URL 세그먼트 = 메시지 키, href = 실제 경로(`/about/<탭>`) — 해시가 아니라
 * 크롤 가능한 링크다.
 */
export async function getAboutTabs(locale: Locale): Promise<TabNavItem[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return CONTENT_SECTIONS.about.map((key) => ({
    key,
    label: tMenu(`about.items.${key}`),
    href: sectionTabHref('about', key),
  }));
}

/**
 * 탭 페이지 metadata.
 * title 은 탭 라벨만 — 레이아웃 템플릿이 `· 기계공학부` 를 붙인다.
 * description 은 구 `/about` 의 설명을 재사용하되 라벨을 앞에 붙여 6개가 서로 달라지게
 * 한다(같은 설명이 여러 URL 에 붙으면 GSC 중복 신호가 된다 — 뉴스 목록과 같은 처리).
 */
export async function aboutTabMetadata(locale: string, tab: AboutTabKey): Promise<Metadata> {
  const l = locale as Locale;
  const t = await getTranslations({ locale: l, namespace: 'about' });
  const label = await aboutTabLabel(l, tab);
  return {
    title: label,
    description: `${label} · ${t('hero.subtitle')}`,
    // hreflang(ko/en/x-default) + 자기 canonical. 통째로 대입해야 한다 — 부분만 넣으면
    // 얕은 병합이라 레이아웃의 canonical 이 사라진다.
    // pageAlternates 는 선행 슬래시 없는 경로를 받는다.
    alternates: pageAlternates(sectionTabHref('about', tab).slice(1)),
  };
}
