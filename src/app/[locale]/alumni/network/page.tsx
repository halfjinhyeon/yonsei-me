import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabPageShell } from '@/components/TabPageShell';
import { LegacyBoardHash } from '@/components/LegacyBoardHash';
import { type BoardRow } from '@/components/BoardList';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { pick } from '@/lib/content';
import { fetchAlumniEvents } from '@/lib/posts';
import { alumniEventHref, LEGACY_ALUMNI_HASH } from '@/lib/board-links';
import { pageAlternates } from '@/lib/seo';
import { getAlumniTabs } from '../_shared/tabs';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tAlumni = await getTranslations({ locale: params.locale, namespace: 'alumni' });
  return {
    title: tMenu('alumni.items.network'),
    description: tAlumni('hero.subtitle'),
    alternates: pageAlternates('alumni/network'),
  };
}

export default async function AlumniNetworkListPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tAlumni = await getTranslations({ locale, namespace: 'alumni' });
  const tStub = await getTranslations({ locale, namespace: 'stub' });

  const alumniEvents = await fetchAlumniEvents();

  // 동문 소식·네트워크: 세미나형 게시판(alumniEvents) → 게시판 행
  const eventRows: BoardRow[] = alumniEvents.map((e) => ({
    id: e.id,
    date: e.date,
    title: pick(e.title, locale),
    subtitle: pick(e.host, locale),
    href: alumniEventHref(e.id),
    image: e.image,
    pinned: e.pinned,
  }));

  const tabs = await getAlumniTabs(locale);
  const boardName = tMenu('alumni.items.network');

  return (
    <>
      {/* narrow: 히어로 → 남색 바 → 목록이 한 좌측선에 선다(뉴스 목록과 동일) */}
      <Hero
        title={tAlumni('hero.title')}
        subtitle={tAlumni('hero.subtitle')}
        narrow
        breadcrumb={[{ label: tMenu('alumni.label'), href: '/alumni' }, { label: boardName }]}
      />
      {/* 히어로 하단 남색 내비게이션 바 + 목록 — title 은 h2 큰 제목(게시판 라벨) */}
      <TabPageShell
        navTitle={tMenu('alumni.label')}
        tabs={tabs}
        activeKey="network"
        title={boardName}
        narrow
      >
        <FilterableBoardList items={eventRows} locale={locale} emptyLabel={tStub('empty')} />
      </TabPageShell>
      {/* 구 링크 /alumni#network 가 여기로 떨어졌을 때(해시 잔류) 자기 자신이면 무시된다 */}
      <LegacyBoardHash map={LEGACY_ALUMNI_HASH} />
    </>
  );
}
