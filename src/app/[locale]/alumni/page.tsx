import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { type BoardRow } from '@/components/BoardList';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { NewsBoard, type NewsCardItem } from '@/components/NewsBoard';
import { AlumniGreeting } from '@/components/AlumniContent';
import { alumniNews, alumniEvents, pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'alumni' });
  return { title: t('hero.title') };
}

export default async function AlumniPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tNews = await getTranslations({ locale, namespace: 'news' });
  const tAlumni = await getTranslations({ locale, namespace: 'alumni' });
  const tStub = await getTranslations({ locale, namespace: 'stub' });

  // 동문 뉴스: 카드형/목록형 토글 지원 — 동문 전용 상세 라우트로 이동
  const newsItems: NewsCardItem[] = alumniNews.map((item) => ({
    id: item.slug,
    date: item.date,
    title: pick(item.title, locale),
    subtitle: pick(item.excerpt, locale),
    excerpt: pick(item.excerpt, locale),
    tag: tNews(`categories.${item.category}`),
    href: `/alumni/news/${item.slug}`,
    image: item.image,
  }));

  // 동문 소식·네트워크: 세미나형 게시판(alumniEvents) → 게시판 행
  const eventRows: BoardRow[] = alumniEvents.map((e) => ({
    id: e.id,
    date: e.date,
    title: pick(e.title, locale),
    subtitle: pick(e.host, locale),
    href: `/alumni/post/${e.id}`,
  }));

  const tabs: TabItem[] = [
    {
      key: 'greeting',
      label: tMenu('alumni.items.greeting'),
      markdown: null,
      content: <AlumniGreeting locale={locale} />,
    },
    {
      key: 'news',
      label: tMenu('alumni.items.news'),
      markdown: null,
      content: (
        <NewsBoard
          items={newsItems}
          locale={locale}
          emptyLabel={tStub('body')}
          cardLabel={tNews('view.card')}
          listLabel={tNews('view.list')}
        />
      ),
    },
    {
      key: 'network',
      label: tMenu('alumni.items.network'),
      markdown: null,
      content: <FilterableBoardList items={eventRows} locale={locale} emptyLabel={tStub('body')} />,
    },
  ];

  return (
    <>
      <Hero
        title={tAlumni('hero.title')}
        subtitle={tAlumni('hero.subtitle')}
        breadcrumb={[{ label: tMenu('alumni.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('alumni.label')} />
    </>
  );
}
