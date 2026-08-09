import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabPageShell } from '@/components/TabPageShell';
import { LegacyBoardHash } from '@/components/LegacyBoardHash';
import { type BoardRow } from '@/components/BoardList';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { pick } from '@/lib/content';
import { fetchAlumniNews } from '@/lib/posts';
import { alumniNewsHref, LEGACY_ALUMNI_HASH } from '@/lib/board-links';
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
    title: tMenu('alumni.items.news'),
    description: tAlumni('hero.subtitle'),
    alternates: pageAlternates('alumni/news'),
  };
}

export default async function AlumniNewsListPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tNews = await getTranslations({ locale, namespace: 'news' });
  const tAlumni = await getTranslations({ locale, namespace: 'alumni' });
  const tStub = await getTranslations({ locale, namespace: 'stub' });

  const alumniNews = await fetchAlumniNews();

  // 동문 뉴스 — 뉴스·공지와 동일한 에디토리얼 목록, 동문 전용 상세 라우트로 이동
  const newsItems: BoardRow[] = alumniNews.map((item) => ({
    id: item.slug,
    date: item.date,
    title: pick(item.title, locale),
    subtitle: pick(item.excerpt, locale),
    tag: tNews(`categories.${item.category}`),
    href: alumniNewsHref(item.slug),
    image: item.image || undefined,
    pinned: item.pinned,
  }));

  const tabs = await getAlumniTabs(locale);
  const boardName = tMenu('alumni.items.news');

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
        activeKey="news"
        title={boardName}
        narrow
      >
        <FilterableBoardList items={newsItems} locale={locale} emptyLabel={tStub('empty')} />
      </TabPageShell>
      {/* 구 링크 /alumni#news 가 여기로 떨어졌을 때(해시 잔류) 자기 자신이면 무시된다 */}
      <LegacyBoardHash map={LEGACY_ALUMNI_HASH} />
    </>
  );
}
