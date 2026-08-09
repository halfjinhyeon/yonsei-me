/**
 * 학부 세부탭 페이지 공용 껍데기 — 히어로 + 탭 셸(TabPageShell).
 *
 * 예전에는 `/undergraduate` 한 장이 8개 탭을 해시로 갈아 끼웠다(TabbedContent).
 * 해시는 서버로 오지 않아 검색엔진에게 8개 화면이 URL 하나로 보였고, 졸업요건
 * 체커·마일리지 같은 무거운 탭도 공유 링크를 가질 수 없었다 — 그래서 탭마다
 * 진짜 경로를 준다. 페이지가 8장으로 갈렸으므로 히어로·탭 줄·메타 조립은
 * 이 파일 한 곳에 모아 둔다.
 *
 * ⚠️ 탭 key/href 를 손으로 적지 마라 — `@/lib/board-links` 의 CONTENT_SECTIONS·
 *    sectionTabHref 가 URL 문법의 단일 출처다. 라벨만 메시지(`menu.undergraduate.items.*`)
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

/** 학부 탭 키 — CONTENT_SECTIONS 에서 파생(오타를 타입이 잡는다) */
export type UndergraduateTabKey = (typeof CONTENT_SECTIONS)['undergraduate'][number];

/** 탭 라벨 ("졸업 요건", "나의 졸업요건" …) */
export async function undergraduateTabLabel(
  locale: Locale,
  tab: UndergraduateTabKey,
): Promise<string> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return tMenu(`undergraduate.items.${tab}`);
}

/** 8개 탭 줄 — 전 탭 페이지가 같은 배열을 그린다 */
async function undergraduateTabs(locale: Locale): Promise<TabNavItem[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return CONTENT_SECTIONS.undergraduate.map((key) => ({
    key,
    label: tMenu(`undergraduate.items.${key}`),
    href: sectionTabHref('undergraduate', key),
  }));
}

/** 본문이 비었을 때 문구 — 8개 페이지가 같은 값을 쓴다 */
export async function undergraduateEmptyLabel(locale: Locale): Promise<string> {
  const tStub = await getTranslations({ locale, namespace: 'stub' });
  return tStub('body');
}

/**
 * 탭 페이지 metadata.
 * title 은 탭 라벨만 — 레이아웃 템플릿이 `· 기계공학부` 를 붙인다.
 * description 은 구 `/undergraduate` 의 설명을 재사용하되 라벨을 앞에 붙여 8개가
 * 서로 달라지게 한다(같은 설명이 여러 URL 에 붙으면 GSC 중복 신호가 된다).
 */
export async function undergraduateTabMetadata(
  locale: string,
  tab: UndergraduateTabKey,
): Promise<Metadata> {
  const l = locale as Locale;
  const tPages = await getTranslations({ locale: l, namespace: 'pages' });
  const label = await undergraduateTabLabel(l, tab);
  return {
    title: label,
    description: `${label} · ${tPages('undergraduate.subtitle')}`,
    // pageAlternates 는 선행 슬래시 없는 경로를 받는다
    alternates: pageAlternates(sectionTabHref('undergraduate', tab).slice(1)),
  };
}

/**
 * 탭 페이지 껍데기. children 은 해당 탭의 콘텐츠 컴포넌트,
 * markdown 은 콘텐츠 없이 본문 마크다운만 있는 탭(장학금)용이다.
 * ⚠️ setRequestLocale 은 라우트 진입점(page.tsx)이 부른다 — 여기서 부르면 이미
 *    데이터 조립이 끝난 뒤라 늦다.
 */
export async function UndergraduateTabPage({
  locale,
  tab,
  markdown,
  children,
}: {
  locale: string;
  tab: UndergraduateTabKey;
  markdown?: string | null;
  children?: ReactNode;
}) {
  const l = locale as Locale;
  const tMenu = await getTranslations({ locale: l, namespace: 'menu' });
  const tabs = await undergraduateTabs(l);
  const label = await undergraduateTabLabel(l, tab);
  const emptyLabel = await undergraduateEmptyLabel(l);

  return (
    <>
      <Hero
        title={tMenu('undergraduate.label')}
        // 그룹 크럼은 기본 탭으로 보낸다 — `/undergraduate` 로 걸면 크럼 클릭마다 308 을 한 번 더 탄다
        breadcrumb={[
          { label: tMenu('undergraduate.label'), href: sectionDefaultHref('undergraduate') },
          { label },
        ]}
      />
      <TabPageShell
        navTitle={tMenu('undergraduate.label')}
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
