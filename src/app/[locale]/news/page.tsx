import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { type BoardRow } from '@/components/BoardList';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { NewsBoard, type NewsCardItem } from '@/components/NewsBoard';
import { EventCalendar, type CalendarEntry } from '@/components/EventCalendar';
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

  // 공지사항: 학부 + 대학원 공지를 하나의 게시판으로 병합, 최신순 (클릭 → 상세).
  // category(undergrad/graduate)로 상단 필터 탭에서 구분한다.
  const notices: BoardRow[] = [
    ...board.noticesUndergrad.map((n) => ({
      id: n.id,
      date: n.date,
      title: pick(n.title, locale),
      tag: tBoard('noticesUndergrad.title'),
      href: `/news/post/${n.id}`,
      category: 'undergrad',
    })),
    ...board.noticesGraduate.map((n) => ({
      id: n.id,
      date: n.date,
      title: pick(n.title, locale),
      tag: tBoard('noticesGraduate.title'),
      href: `/news/post/${n.id}`,
      category: 'graduate',
    })),
  ].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));

  // 공지 필터 탭(전체/학부/대학원) — 짧은 메뉴 라벨 재사용
  const noticeCategories = [
    { id: 'undergrad', label: tMenu('undergraduate.label') },
    { id: 'graduate', label: tMenu('graduate.label') },
  ];

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

  // 캘린더('일정' 탭)는 행사·세미나 게시판을 그대로 읽는다 — 관리자가 두 게시판에 글을
  // 등록하면 그 date 필드가 월간 캘린더에 자동 반영된다(별도 일정 데이터 불필요).
  const calendarEntries: CalendarEntry[] = [
    ...board.events.map((e) => ({
      id: e.id,
      date: e.date,
      title: pick(e.title, locale),
      kind: 'event' as const,
      href: `/news/post/${e.id}`,
    })),
    ...board.seminars.map((s) => ({
      id: s.id,
      date: s.date,
      title: pick(s.title, locale),
      kind: 'seminar' as const,
      href: `/news/post/${s.id}`,
    })),
  ];

  // 자료실: 공지사항과 동일한 게시판 구조 (클릭 → 상세, 검색·날짜 필터)
  const resourceRows: BoardRow[] = board.resources.map((r) => ({
    id: r.id,
    date: r.date,
    title: pick(r.title, locale),
    href: `/news/post/${r.id}`,
  }));

  const tabs: TabItem[] = [
    { key: 'notices', label: tMenu('news.items.notices'), markdown: null, content: <FilterableBoardList items={notices} categories={noticeCategories} locale={locale} emptyLabel={tStub('body')} /> },
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
    { key: 'thesis', label: tMenu('news.items.thesis'), markdown: null, content: <FilterableBoardList items={thesisRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'resources', label: tMenu('news.items.resources'), markdown: null, content: <FilterableBoardList items={resourceRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'career', label: tMenu('news.items.career'), markdown: null, content: <FilterableBoardList items={careerRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'events', label: tMenu('news.items.events'), markdown: null, content: <FilterableBoardList items={eventRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'seminars', label: tMenu('news.items.seminars'), markdown: null, content: <FilterableBoardList items={seminarRows} locale={locale} emptyLabel={tStub('body')} /> },
    { key: 'calendar', label: tMenu('news.items.calendar'), markdown: null, content: <EventCalendar entries={calendarEntries} locale={locale} /> },
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
