import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { BoardList, type BoardRow } from '@/components/BoardList';
import { NewsBoard, type NewsCardItem } from '@/components/NewsBoard';
import { CalendarStrip } from '@/components/CalendarStrip';
import { news, board, pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'news' });
  return { title: t('hero.title') };
}

export default async function NewsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tNews = await getTranslations({ locale, namespace: 'news' });
  const tBoard = await getTranslations({ locale, namespace: 'board' });
  const tStub = await getTranslations({ locale, namespace: 'stub' });

  // 공지사항: 학부 + 대학원 공지를 하나의 게시판으로 병합, 최신순 (클릭 → 상세)
  const notices: BoardRow[] = [
    ...board.noticesUndergrad.map((n) => ({
      id: n.id,
      date: n.date,
      title: pick(n.title, locale),
      tag: tBoard('noticesUndergrad.title'),
      href: `/news/post/${n.id}`,
    })),
    ...board.noticesGraduate.map((n) => ({
      id: n.id,
      date: n.date,
      title: pick(n.title, locale),
      tag: tBoard('noticesGraduate.title'),
      href: `/news/post/${n.id}`,
    })),
  ].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));

  // 뉴스: 카드형/목록형 토글 지원 (이미지 포함)
  const newsItems: NewsCardItem[] = news.map((item) => ({
    id: item.slug,
    date: item.date,
    title: pick(item.title, locale),
    subtitle: pick(item.excerpt, locale),
    excerpt: pick(item.excerpt, locale),
    tag: tNews(`categories.${item.category}`),
    href: `/news/${item.slug}`,
    image: item.image,
  }));

  const eventRows: BoardRow[] = board.events.map((e) => ({
    id: e.id,
    date: e.date,
    title: pick(e.title, locale),
    tag: pick(e.dateLabel, locale),
    href: `/news/post/${e.id}`,
  }));

  const seminarRows: BoardRow[] = board.seminars.map((s) => ({
    id: s.id,
    date: s.date,
    title: pick(s.title, locale),
    subtitle: `${tBoard('seminars.hostLabel')}: ${pick(s.host, locale)}`,
    href: `/news/post/${s.id}`,
  }));

  const thesisRows: BoardRow[] = board.thesis.map((t) => ({
    id: t.id,
    date: t.date,
    title: pick(t.title, locale),
    href: `/news/post/${t.id}`,
  }));

  const careerRows: BoardRow[] = board.career.map((c) => ({
    id: c.id,
    date: c.date,
    title: pick(c.title, locale),
    href: `/news/post/${c.id}`,
  }));

  // 자료실: 학부 안에 이미 있는 실제 자료 페이지로 연결하는 바로가기 모음
  const resourceRows: BoardRow[] = [
    { id: 'res-1', title: tNews('resources.ugRequirements'), tag: tNews('resources.tagUg'), href: '/undergraduate#requirements' },
    { id: 'res-2', title: tNews('resources.curriculum'), tag: tNews('resources.tagUg'), href: '/undergraduate#curriculum' },
    { id: 'res-3', title: tNews('resources.courses'), tag: tNews('resources.tagUg'), href: '/undergraduate#courses' },
    { id: 'res-4', title: tNews('resources.gradRequirements'), tag: tNews('resources.tagGrad'), href: '/graduate#requirements' },
    { id: 'res-5', title: tNews('resources.labs'), tag: tNews('resources.tagResearch'), href: '/research#labs' },
    { id: 'res-6', title: tNews('resources.scholarship'), tag: tNews('resources.tagUg'), href: '/undergraduate#scholarship' },
  ];

  const tabs: TabItem[] = [
    { key: 'notices', label: tMenu('news.items.notices'), markdown: null, content: <BoardList items={notices} locale={locale} emptyLabel={tStub('body')} /> },
    {
      key: 'news',
      label: tMenu('news.items.news'),
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
    { key: 'thesis', label: tMenu('news.items.thesis'), markdown: null, content: <BoardList items={thesisRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'resources', label: tMenu('news.items.resources'), markdown: null, content: <BoardList items={resourceRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'career', label: tMenu('news.items.career'), markdown: null, content: <BoardList items={careerRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'events', label: tMenu('news.items.events'), markdown: null, content: <BoardList items={eventRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'seminars', label: tMenu('news.items.seminars'), markdown: null, content: <BoardList items={seminarRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'calendar', label: tMenu('news.items.calendar'), markdown: null, content: <CalendarStrip events={board.events} locale={locale} /> },
  ];

  return (
    <>
      <Hero
        title={tNews('hero.title')}
        subtitle={tNews('hero.subtitle')}
        breadcrumb={[{ label: tMenu('news.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('news.label')} />
    </>
  );
}
