import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { EventCalendar } from '@/components/EventCalendar';
import { NewsListPage, newsListMetadata } from '../_shared/NewsListPage';
import { buildCalendarEntries } from '../_shared/list-data';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return newsListMetadata(params.locale, 'calendar');
}

/**
 * 일정 — 게시판이 아니라 월간 달력이다(상세 라우트가 없다).
 * 행사·세미나 게시판 + CMS '일정 (캘린더)' 게시판 3소스를 합쳐 그린다.
 */
export default async function CalendarPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const entries = await buildCalendarEntries(locale);

  return (
    <NewsListPage locale={params.locale} seg="calendar">
      <EventCalendar entries={entries} locale={locale} />
    </NewsListPage>
  );
}
