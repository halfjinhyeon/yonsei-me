/**
 * 연구 세부탭 페이지 공용 껍데기 — 히어로 + 탭 셸(TabPageShell).
 *
 * 학부와 같은 이유로 탭을 경로화했다(해시는 서버로 오지 않아 6개 화면이 URL 하나로
 * 보였다). 인턴 모집 목록은 이 셸을 쓰는 탭이면서 상세(`/research/internships/<id>`)의
 * 부모 경로이기도 하다.
 *
 * ⚠️ 탭 key/href 를 손으로 적지 마라 — `@/lib/board-links` 의 CONTENT_SECTIONS·
 *    sectionTabHref 가 URL 문법의 단일 출처다. 라벨만 메시지(`menu.research.items.*`)
 *    에서 온다.
 * (`_shared` 는 밑줄 접두사라 Next 라우팅에서 제외되는 비공개 폴더다.)
 */
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Hero } from '@/components/Hero';
import { TabPageShell, type TabNavItem } from '@/components/TabPageShell';
import { CONTENT_SECTIONS, sectionDefaultHref, sectionTabHref } from '@/lib/board-links';
import { pageAlternates } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/** 연구 탭 키 — CONTENT_SECTIONS 에서 파생(오타를 타입이 잡는다) */
export type ResearchTabKey = (typeof CONTENT_SECTIONS)['research'][number];

/** 탭 라벨 ("연구 비전", "인턴 모집" …) */
export async function researchTabLabel(locale: Locale, tab: ResearchTabKey): Promise<string> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return tMenu(`research.items.${tab}`);
}

/** 6개 탭 줄 — 전 탭 페이지가 같은 배열을 그린다 */
async function researchTabs(locale: Locale): Promise<TabNavItem[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return CONTENT_SECTIONS.research.map((key) => ({
    key,
    label: tMenu(`research.items.${key}`),
    href: sectionTabHref('research', key),
  }));
}

/** 본문이 비었을 때 문구 — 6개 페이지가 같은 값을 쓴다 */
export async function researchEmptyLabel(locale: Locale): Promise<string> {
  const tStub = await getTranslations({ locale, namespace: 'stub' });
  return tStub('body');
}

/**
 * 탭 페이지 metadata.
 * title 은 탭 라벨만 — 레이아웃 템플릿이 `· 기계공학부` 를 붙인다.
 * description 은 구 `/research` 의 설명을 재사용하되 라벨을 앞에 붙여 6개가 서로
 * 달라지게 한다(같은 설명이 여러 URL 에 붙으면 GSC 중복 신호가 된다).
 */
export async function researchTabMetadata(locale: string, tab: ResearchTabKey): Promise<Metadata> {
  const l = locale as Locale;
  const tResearch = await getTranslations({ locale: l, namespace: 'research' });
  const label = await researchTabLabel(l, tab);
  return {
    title: label,
    description: `${label} · ${tResearch('hero.subtitle')}`,
    // pageAlternates 는 선행 슬래시 없는 경로를 받는다
    alternates: pageAlternates(sectionTabHref('research', tab).slice(1)),
  };
}

/**
 * 탭 페이지 껍데기. children 은 해당 탭의 콘텐츠 컴포넌트,
 * markdown 은 콘텐츠 없이 본문 마크다운만 있는 탭용이다.
 * ⚠️ setRequestLocale 은 라우트 진입점(page.tsx)이 부른다 — 여기서 부르면 이미
 *    데이터 조립이 끝난 뒤라 늦다.
 */
export async function ResearchTabPage({
  locale,
  tab,
  markdown,
  children,
}: {
  locale: string;
  tab: ResearchTabKey;
  markdown?: string | null;
  children?: ReactNode;
}) {
  const l = locale as Locale;
  const tMenu = await getTranslations({ locale: l, namespace: 'menu' });
  const tabs = await researchTabs(l);
  const label = await researchTabLabel(l, tab);
  const emptyLabel = await researchEmptyLabel(l);

  return (
    <>
      <Hero
        title={tMenu('research.label')}
        // 그룹 크럼은 기본 탭으로 보낸다 — `/research` 로 걸면 크럼 클릭마다 308 을 한 번 더 탄다
        breadcrumb={[
          { label: tMenu('research.label'), href: sectionDefaultHref('research') },
          { label },
        ]}
      />
      <TabPageShell
        navTitle={tMenu('research.label')}
        tabs={tabs}
        activeKey={tab}
        title={label}
        markdown={markdown}
        emptyLabel={emptyLabel}
      >
        {children}
      </TabPageShell>
    </>
  );
}
