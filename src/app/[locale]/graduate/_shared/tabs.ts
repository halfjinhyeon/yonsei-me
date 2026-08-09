/**
 * 대학원 섹션 탭 배열·라벨·메타데이터 — 4개 탭 페이지가 공유한다.
 * (`_shared` 는 밑줄 접두사라 Next 라우팅에서 제외되는 비공개 폴더다.)
 *
 * ⚠️ 탭 key/href 를 손으로 적지 마라 — `@/lib/board-links` 의 CONTENT_SECTIONS·
 *    sectionTabHref 가 URL 문법의 단일 출처다. 라벨만 메시지(`menu.graduate.items.*`)에서 온다.
 * ⚠️ 메시지에는 `graduate.items.admission` 도 있지만 탭은 아니다 — 입학 안내는
 *    /about/admission 통합 안내로 일원화됐다(구 페이지의 SECTION_SLUGS 와 동일한 구성).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { TabNavItem } from '@/components/TabPageShell';
import { CONTENT_SECTIONS, sectionTabHref } from '@/lib/board-links';
import { pageAlternates } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/** 'requirements' | 'courses' | 'labs' | 'bk21' */
export type GraduateTabKey = (typeof CONTENT_SECTIONS.graduate)[number];

/** 섹션 루트(/graduate)가 308 하는 기본 탭 — 레거시 해시 구제를 여기에만 얹는다 */
export const DEFAULT_GRADUATE_TAB: GraduateTabKey = CONTENT_SECTIONS.graduate[0];

/** 탭 라벨 ("졸업 요건", "교과목 소개" …) — 메가메뉴와 같은 메시지 키를 쓴다 */
export async function graduateTabLabel(locale: Locale, tab: GraduateTabKey): Promise<string> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return tMenu(`graduate.items.${tab}`);
}

/**
 * TabNavBar 에 넘길 탭 배열.
 * key = URL 세그먼트 = 메시지 키, href = 실제 경로(`/graduate/<탭>`).
 */
export async function getGraduateTabs(locale: Locale): Promise<TabNavItem[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return CONTENT_SECTIONS.graduate.map((key) => ({
    key,
    label: tMenu(`graduate.items.${key}`),
    href: sectionTabHref('graduate', key),
  }));
}

/**
 * 탭 페이지 metadata.
 * title 은 탭 라벨만 — 레이아웃 템플릿이 `· 기계공학부` 를 붙인다.
 * description 은 구 `/graduate` 의 설명을 재사용하되 라벨을 앞에 붙여 4개가 서로
 * 달라지게 한다(같은 설명이 여러 URL 에 붙으면 GSC 중복 신호가 된다).
 */
export async function graduateTabMetadata(
  locale: string,
  tab: GraduateTabKey,
): Promise<Metadata> {
  const l = locale as Locale;
  const tP = await getTranslations({ locale: l, namespace: 'pages' });
  const label = await graduateTabLabel(l, tab);
  return {
    title: label,
    description: `${label} · ${tP('graduate.subtitle')}`,
    // hreflang(ko/en/x-default) + 자기 canonical 을 통째로 대입 — 부분만 넣으면 얕은
    // 병합이라 레이아웃의 canonical 이 사라진다. 경로는 선행 슬래시 없이 넘긴다.
    alternates: pageAlternates(sectionTabHref('graduate', tab).slice(1)),
  };
}
