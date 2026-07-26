import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { type BoardRow } from '@/components/BoardList';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { EventCalendar, type CalendarEntry } from '@/components/EventCalendar';
import { pick } from '@/lib/content';
import { parseDateLabelRange } from '@/lib/calendar';
import { fetchNews, fetchBoardData, fetchCalendarPosts } from '@/lib/posts';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;

// CMS '일정 (캘린더)' 게시판의 분류 → 캘린더 kind. CMS 의 '행사'는 행사 게시판과 같은
// 'event' 로 접는다 — 학생에게는 둘 다 그냥 행사라 범례가 '행사'로 두 줄 나오면 안 된다.
// 모르는 값(분류가 늘어난 경우)은 학사일정으로 떨어뜨려 최소한 달력에는 뜨게 한다.
const CALENDAR_KIND: Record<string, CalendarEntry['kind']> = {
  academic: 'academic',
  event: 'event',
  recruit: 'recruit',
  exam: 'exam',
};

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'news' });
  return { title: t('hero.title'), description: t('hero.subtitle') };
}

export default async function NewsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tNews = await getTranslations({ locale, namespace: 'news' });
  const tBoard = await getTranslations({ locale, namespace: 'board' });
  const tStub = await getTranslations({ locale, namespace: 'stub' });

  // 게시판 데이터 — 소스(db/git)는 lib/posts 가 판별. 기존 매핑 코드를 그대로 쓰기 위해
  // 모듈 상수와 같은 이름(news/board)의 지역 변수로 받는다.
  const news = await fetchNews();
  const board = await fetchBoardData();

  // 공지사항: 학부/대학원/외부기관/장학생 4개 공지 게시판을 하나로 병합, 최신순
  // (클릭 → 상세). category 로 상단 필터 탭에서 구분한다.
  const noticeBoards = [
    { rows: board.noticesUndergrad, tagKey: 'noticesUndergrad.title', category: 'undergrad' },
    { rows: board.noticesGraduate, tagKey: 'noticesGraduate.title', category: 'graduate' },
    { rows: board.noticesExternal, tagKey: 'noticesExternal.title', category: 'external' },
    { rows: board.noticesScholarship, tagKey: 'noticesScholarship.title', category: 'scholarship' },
  ] as const;
  const notices: BoardRow[] = noticeBoards
    .flatMap(({ rows, tagKey, category }) =>
      rows.map((n) => ({
        id: n.id,
        date: n.date,
        title: pick(n.title, locale),
        subtitle: n.excerpt ? pick(n.excerpt, locale) : undefined,
        tag: tBoard(tagKey),
        href: `/news/post/${n.id}`,
        image: n.image,
        category,
      })),
    )
    .sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));

  // 공지 필터 탭(전체/학부/대학원/외부기관/장학생 선발)
  const noticeCategories = [
    { id: 'undergrad', label: tMenu('undergraduate.label') },
    { id: 'graduate', label: tMenu('graduate.label') },
    { id: 'external', label: tNews('noticeCats.external') },
    { id: 'scholarship', label: tNews('noticeCats.scholarship') },
  ];

  // 뉴스 — 다른 게시판과 동일한 에디토리얼 목록 (구 NewsBoard 카드/목록 토글 폐지)
  const newsItems: BoardRow[] = news.map((item) => ({
    id: item.slug,
    date: item.date,
    title: pick(item.title, locale),
    subtitle: pick(item.excerpt, locale),
    tag: tNews(`categories.${item.category}`),
    href: `/news/${item.slug}`,
    image: item.image || undefined,
  }));

  const eventRows: BoardRow[] = board.events.map((e) => ({
    id: e.id,
    date: e.date,
    title: pick(e.title, locale),
    subtitle: e.excerpt ? pick(e.excerpt, locale) : undefined,
    tag: pick(e.dateLabel, locale),
    href: `/news/post/${e.id}`,
    image: e.image,
  }));

  const seminarRows: BoardRow[] = board.seminars.map((s) => ({
    id: s.id,
    date: s.date,
    title: pick(s.title, locale),
    subtitle: `${tBoard('seminars.hostLabel')}: ${pick(s.host, locale)}`,
    href: `/news/post/${s.id}`,
    image: s.image,
  }));

  const thesisRows: BoardRow[] = board.thesis.map((t) => ({
    id: t.id,
    date: t.date,
    title: pick(t.title, locale),
    subtitle: t.excerpt ? pick(t.excerpt, locale) : undefined,
    href: `/news/post/${t.id}`,
    image: t.image,
  }));

  const careerRows: BoardRow[] = board.career.map((c) => ({
    id: c.id,
    date: c.date,
    title: pick(c.title, locale),
    subtitle: c.excerpt ? pick(c.excerpt, locale) : undefined,
    href: `/news/post/${c.id}`,
    image: c.image,
  }));

  // 캘린더('일정' 탭)는 행사·세미나 게시판 + CMS '일정 (캘린더)' 게시판을 함께 읽는다.
  // 앞의 둘은 글이 있는 일정이고, 뒤는 본문 없이 달력에만 올리는 학사일정·모집·시험이다
  // (홈 캘린더는 이미 셋을 합쳐 보여주는데 이 탭만 빠져 있었다).
  // 기간: 구조화된 endDate(DB end_date, CMS 시작–종료 피커)가 있으면 그것을 신뢰하고,
  // 없으면(구 데이터) 수동 dateLabel 을 파싱하던 기존 폴백을 유지한다.
  // 배열 리터럴의 spread 안에서 await 하지 않도록 미리 받아 둔다(홈 page.tsx 와 같은 관례).
  const calendarPosts = await fetchCalendarPosts();
  // pick 은 빈 문자열을 폴백하지 않는다(`??` 기반). 영문 제목을 비워 둔 글이 많아
  // 영어 화면 캘린더에 날짜만 있고 제목이 빈칸인 바가 뜨고 있었다 — 홈 page.tsx 의
  // orKo 와 같은 규칙으로 한국어에 떨어뜨린다.
  const orKo = (v: { ko: string; en: string }) => pick(v, locale).trim() || v.ko;
  const calendarEntries: CalendarEntry[] = [
    ...board.events.map((e) => {
      const r = e.endDate
        ? { start: e.date, end: e.endDate }
        : parseDateLabelRange(e.date, pick(e.dateLabel, locale).trim() || e.dateLabel.ko);
      return {
        id: e.id,
        date: r.start,
        endDate: r.end,
        title: orKo(e.title),
        kind: 'event' as const,
        href: `/news/post/${e.id}`,
      };
    }),
    ...board.seminars.map((s) => ({
      id: s.id,
      date: s.date,
      endDate: s.endDate ?? s.date, // 종료일 없으면 하루
      title: orKo(s.title),
      kind: 'seminar' as const,
      href: `/news/post/${s.id}`,
    })),
    ...calendarPosts.map((ev) => ({
      id: `cal-${ev.id}`, // 게시판 글과 id 공간이 겹치므로(둘 다 DB 연번) 접두사로 분리
      date: ev.start,
      endDate: ev.end ?? ev.start, // 종료일 없으면 하루
      title: orKo(ev.title),
      kind: CALENDAR_KIND[ev.category] ?? 'academic',
      // 링크가 없으면 키 자체를 빼서 EventCalendar 가 비링크 바로 그리게 한다
      ...(ev.href ? { href: ev.href } : {}),
    })),
  ];

  // 자료실: 공지사항과 동일한 게시판 구조 (클릭 → 상세, 검색·날짜 필터)
  const resourceRows: BoardRow[] = board.resources.map((r) => ({
    id: r.id,
    date: r.date,
    title: pick(r.title, locale),
    subtitle: r.excerpt ? pick(r.excerpt, locale) : undefined,
    href: `/news/post/${r.id}`,
    image: r.image,
  }));

  const tabs: TabItem[] = [
    { key: 'notices', label: tMenu('news.items.notices'), markdown: null, content: <FilterableBoardList items={notices} categories={noticeCategories} locale={locale} emptyLabel={tStub('empty')} /> },
    {
      key: 'news',
      label: tMenu('news.items.news'),
      markdown: null,
      content: <FilterableBoardList items={newsItems} locale={locale} emptyLabel={tStub('empty')} />,
    },
    { key: 'thesis', label: tMenu('news.items.thesis'), markdown: null, content: <FilterableBoardList items={thesisRows} locale={locale} emptyLabel={tStub('empty')} /> },
    { key: 'resources', label: tMenu('news.items.resources'), markdown: null, content: <FilterableBoardList items={resourceRows} locale={locale} emptyLabel={tStub('empty')} /> },
    { key: 'career', label: tMenu('news.items.career'), markdown: null, content: <FilterableBoardList items={careerRows} locale={locale} emptyLabel={tStub('empty')} /> },
    { key: 'events', label: tMenu('news.items.events'), markdown: null, content: <FilterableBoardList items={eventRows} locale={locale} emptyLabel={tStub('empty')} /> },
    { key: 'seminars', label: tMenu('news.items.seminars'), markdown: null, content: <FilterableBoardList items={seminarRows} locale={locale} emptyLabel={tStub('empty')} /> },
    { key: 'calendar', label: tMenu('news.items.calendar'), markdown: null, content: <EventCalendar entries={calendarEntries} locale={locale} /> },
  ];

  return (
    <>
      <Hero
        title={tNews('hero.title')}
        subtitle={tNews('hero.subtitle')}
        breadcrumb={[{ label: tMenu('news.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('empty')} navTitle={tMenu('news.label')} />
    </>
  );
}
