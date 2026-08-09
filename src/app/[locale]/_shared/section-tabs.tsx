/**
 * 콘텐츠 섹션(소개·학부·대학원·연구) 탭 페이지 공용 껍데기 — 히어로 + 탭 셸 +
 * 레거시 해시 구제 + metadata. 24개 탭 페이지가 전부 이 한 곳을 쓴다.
 *
 * 예전에는 섹션마다 같은 껍데기(AboutTabPage·GraduateTabPage·ResearchTabPage·
 * UndergraduateTabPage + 섹션별 tabs.ts)를 한 벌씩 들고 있었다. 로직은 동일하고
 * 히어로 문구 출처·크럼 모양만 달랐으므로, 그 차이만 SPEC 데이터로 내리고
 * 코드는 하나로 합쳤다. 탭이 경로가 된 이유는 종전과 같다 — 해시는 서버로 오지
 * 않아 검색엔진에게 여러 화면이 URL 하나로 보였다.
 *
 * ⚠️ 탭 key/href 를 손으로 적지 마라 — `@/lib/board-links` 의 CONTENT_SECTIONS·
 *    sectionTabHref 가 URL 문법의 단일 출처다. 라벨만 메시지(`menu.<섹션>.items.*`)에서 온다.
 * ⚠️ setRequestLocale 은 라우트 진입점(page.tsx)이 부른다 — 여기서 부르면 이미
 *    데이터 조립이 끝난 뒤라 늦다.
 * (`_shared` 는 밑줄 접두사라 Next 라우팅에서 제외되는 비공개 폴더다.)
 */
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Hero } from '@/components/Hero';
import { LegacyBoardHash } from '@/components/LegacyBoardHash';
import { TabPageShell, type TabNavItem } from '@/components/TabPageShell';
import {
  CONTENT_SECTIONS,
  legacySectionHash,
  sectionDefaultHref,
  sectionTabHref,
  type ContentSection,
} from '@/lib/board-links';
import { pageAlternates } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/** 섹션별 탭 키 — CONTENT_SECTIONS 에서 파생(오타를 타입이 잡는다) */
export type SectionTabKey<S extends ContentSection> = (typeof CONTENT_SECTIONS)[S][number];

/** 메시지 참조: [네임스페이스, 키] */
type Msg = [ns: string, key: string];

/**
 * 섹션별로 실제로 다른 것 전부 — 히어로 문구 출처와 크럼 모양뿐이다.
 * desc 는 metadata description 의 꼬리: 구 섹션 한 장의 설명을 재사용하되 앞에
 * 탭 라벨을 붙여 탭끼리 서로 달라지게 한다(같은 설명이 여러 URL 에 붙으면
 * GSC 중복 신호가 된다).
 */
const SPEC: Record<
  ContentSection,
  {
    heroTitle: Msg;
    heroSubtitle?: Msg;
    /** simple: 그룹 라벨 하나(링크 없음) / linked: 그룹→기본 탭 링크 + 현재 탭 */
    crumb: 'simple' | 'linked';
    /** simple 크럼의 라벨 출처(생략 시 메뉴 라벨) — about 만 nav 라벨을 쓴다 */
    crumbLabel?: Msg;
    desc: Msg;
  }
> = {
  about: {
    heroTitle: ['about', 'hero.title'],
    heroSubtitle: ['about', 'hero.subtitle'],
    crumb: 'simple',
    crumbLabel: ['nav', 'about'],
    desc: ['about', 'hero.subtitle'],
  },
  undergraduate: {
    heroTitle: ['menu', 'undergraduate.label'],
    crumb: 'linked',
    desc: ['pages', 'undergraduate.subtitle'],
  },
  graduate: {
    heroTitle: ['menu', 'graduate.label'],
    heroSubtitle: ['pages', 'graduate.subtitle'],
    crumb: 'simple',
    desc: ['pages', 'graduate.subtitle'],
  },
  research: {
    heroTitle: ['menu', 'research.label'],
    crumb: 'linked',
    desc: ['research', 'hero.subtitle'],
  },
};

/** [ns, key] → 번역 문자열 (getTranslations 는 next-intl 이 요청 단위로 캐시한다) */
async function msg(locale: Locale, [ns, key]: Msg): Promise<string> {
  const t = await getTranslations({ locale, namespace: ns });
  return t(key);
}

/** 탭 라벨 ("교수진", "나의 졸업요건" …) — 메가메뉴와 같은 메시지 키를 쓴다 */
export async function sectionTabLabel<S extends ContentSection>(
  locale: Locale,
  section: S,
  tab: SectionTabKey<S>,
): Promise<string> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return tMenu(`${section}.items.${tab}`);
}

/** 본문이 비었을 때 문구 — 전 탭 페이지가 같은 값을 쓴다 */
export async function sectionEmptyLabel(locale: Locale): Promise<string> {
  const tStub = await getTranslations({ locale, namespace: 'stub' });
  return tStub('body');
}

/**
 * 탭 페이지 metadata.
 * title 은 탭 라벨만 — 레이아웃 템플릿이 `· 기계공학부` 를 붙인다.
 * alternates 는 hreflang(ko/en/x-default) + 자기 canonical 을 **통째로** 대입한다 —
 * 부분만 넣으면 얕은 병합이라 레이아웃의 canonical 이 사라진다.
 * pageAlternates 는 선행 슬래시 없는 경로를 받는다.
 */
export async function sectionTabMetadata<S extends ContentSection>(
  locale: string,
  section: S,
  tab: SectionTabKey<S>,
): Promise<Metadata> {
  const l = locale as Locale;
  const label = await sectionTabLabel(l, section, tab);
  return {
    title: label,
    description: `${label} · ${await msg(l, SPEC[section].desc)}`,
    alternates: pageAlternates(sectionTabHref(section, tab).slice(1)),
  };
}

/**
 * 탭 페이지 껍데기. children 은 해당 탭의 콘텐츠 컴포넌트,
 * markdown 은 콘텐츠 없이 본문 마크다운만 있는 탭(장학금·BK21 등)용이다.
 */
export async function SectionTabPage<S extends ContentSection>({
  locale,
  section,
  tab,
  markdown,
  children,
}: {
  locale: string;
  section: S;
  tab: SectionTabKey<S>;
  /** 마크다운 본문 탭용 (커스텀 컴포넌트를 쓰는 탭은 children) */
  markdown?: string | null;
  children?: ReactNode;
}) {
  const l = locale as Locale;
  const spec = SPEC[section];
  const tMenu = await getTranslations({ locale: l, namespace: 'menu' });
  const tStub = await getTranslations({ locale: l, namespace: 'stub' });
  const menuLabel = tMenu(`${section}.label`);
  const label = await sectionTabLabel(l, section, tab);
  const heroTitle = await msg(l, spec.heroTitle);
  const heroSubtitle = spec.heroSubtitle ? await msg(l, spec.heroSubtitle) : undefined;
  // 그룹 크럼은 기본 탭으로 보낸다 — 섹션 루트로 걸면 크럼 클릭마다 308 을 한 번 더 탄다
  const breadcrumb =
    spec.crumb === 'linked'
      ? [{ label: menuLabel, href: sectionDefaultHref(section) }, { label }]
      : [{ label: spec.crumbLabel ? await msg(l, spec.crumbLabel) : menuLabel }];
  // 유니온 튜플에는 .map 을 바로 못 부르므로 readonly string[] 으로 넓힌다(사이트맵과 동일)
  const tabs: TabNavItem[] = (CONTENT_SECTIONS[section] as readonly string[]).map((key) => ({
    key,
    label: tMenu(`${section}.items.${key}`),
    href: sectionTabHref(section, key),
  }));

  return (
    <>
      <Hero title={heroTitle} subtitle={heroSubtitle} breadcrumb={breadcrumb} />
      <TabPageShell
        navTitle={menuLabel}
        tabs={tabs}
        activeKey={tab}
        title={label}
        markdown={markdown}
        emptyLabel={tStub('body')}
      >
        {children}
      </TabPageShell>
      {/* 구 해시 북마크(`/about#staff` 등) 구제 — 해시는 서버에 오지 않아, 섹션 루트의
          308 을 따라온 기본 탭에서 클라이언트로만 잡을 수 있다(그래서 기본 탭에만 얹는다) */}
      {tab === CONTENT_SECTIONS[section][0] && <LegacyBoardHash map={legacySectionHash(section)} />}
    </>
  );
}
