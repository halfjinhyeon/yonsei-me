/**
 * 대학원 섹션 탭 페이지 공용 껍데기 — 히어로 + 탭 셸 + 레거시 해시 구제.
 *
 * 예전에는 `/graduate` 한 장이 4개 탭을 클라이언트 상태(TabbedContent)로 갈아 끼웠다.
 * 해시는 서버로 오지 않아 검색엔진에게 4개 문서가 URL 하나로 보였다 — 그래서 탭마다
 * 진짜 경로를 준다. 히어로·탭·본문 조립은 여기 한 곳에 모은다.
 */
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Hero } from '@/components/Hero';
import { LegacyBoardHash } from '@/components/LegacyBoardHash';
import { TabPageShell } from '@/components/TabPageShell';
import { legacySectionHash } from '@/lib/board-links';
import {
  DEFAULT_GRADUATE_TAB,
  getGraduateTabs,
  graduateTabLabel,
  type GraduateTabKey,
} from './tabs';
import type { Locale } from '@/i18n/routing';

/**
 * ⚠️ setRequestLocale 은 라우트 진입점(page.tsx)이 부른다 — 여기서 부르면 이미
 *    데이터 조립이 끝난 뒤라 늦다.
 */
export async function GraduateTabPage({
  locale,
  tab,
  markdown,
  children,
}: {
  locale: string;
  tab: GraduateTabKey;
  /** 마크다운 본문 탭용 (커스텀 컴포넌트를 쓰는 탭은 children) */
  markdown?: string | null;
  children?: ReactNode;
}) {
  const l = locale as Locale;
  const tMenu = await getTranslations({ locale: l, namespace: 'menu' });
  const tPages = await getTranslations({ locale: l, namespace: 'pages' });
  const tStub = await getTranslations({ locale: l, namespace: 'stub' });
  const tabs = await getGraduateTabs(l);
  const label = await graduateTabLabel(l, tab);

  return (
    <>
      {/* 히어로는 4개 탭이 동일 — 구 /graduate 의 것을 그대로 쓴다 */}
      <Hero
        title={tMenu('graduate.label')}
        subtitle={tPages('graduate.subtitle')}
        breadcrumb={[{ label: tMenu('graduate.label') }]}
      />

      <TabPageShell
        navTitle={tMenu('graduate.label')}
        tabs={tabs}
        activeKey={tab}
        title={label}
        markdown={markdown}
        emptyLabel={tStub('body')}
      >
        {children}
      </TabPageShell>

      {/* 구 `/graduate#labs` 북마크 구제 — 해시는 서버에 오지 않아, 루트의 308 을 따라온
          기본 탭에서 클라이언트로만 잡을 수 있다(그래서 기본 탭에만 얹는다) */}
      {tab === DEFAULT_GRADUATE_TAB && <LegacyBoardHash map={legacySectionHash('graduate')} />}
    </>
  );
}
