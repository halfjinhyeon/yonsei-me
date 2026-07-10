'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { pick, type CalendarEntry } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

interface Day {
  iso: string;
  weekday: string;
  dayNum: number;
  isToday: boolean;
  entries: CalendarEntry[];
}

/** 카테고리 → 상세 라우트. 행사=뉴스 게시판 상세, 동문=동문 게시물 상세. */
function entryHref(entry: CalendarEntry): string {
  return entry.category === 'alumni' ? `/alumni/post/${entry.id}` : `/news/post/${entry.id}`;
}

/** 금주의 행사: 목요일부터 시작하는 7일 스트립 + 해당일 행사·동문 일정 표시.
 *  '오늘'은 클라이언트에서 계산 → 하이드레이션 불일치 방지를 위해 마운트 후 렌더.
 *  entries = 행사 게시판 전체 + 동문 소식·네트워크 중 '행사'로 표시된 항목(getCalendarEntries). */
export function WeeklyCalendar({ entries, locale }: { entries: CalendarEntry[]; locale: Locale }) {
  const t = useTranslations('board.weekly');
  const [days, setDays] = useState<Day[] | null>(null);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 이번 주 목요일(요일 인덱스 4)로 이동
    const offset = (today.getDay() - 4 + 7) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - offset);

    const fmtWeekday = new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
      weekday: 'short',
    });

    const result: Day[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        iso,
        weekday: fmtWeekday.format(d),
        dayNum: d.getDate(),
        isToday: d.getTime() === today.getTime(),
        entries: entries.filter((e) => e.date === iso),
      };
    });
    setDays(result);
  }, [entries, locale]);

  return (
    <section className="full-bleed bg-surface-soft" aria-labelledby="weekly-title">
      <div className="mx-auto max-w-[1360px] px-6 py-12 sm:px-10 lg:px-16">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="weekly-title" className="text-xl font-bold text-content sm:text-2xl">
            {t('title')}
          </h2>
          <div className="flex items-center gap-4">
            {/* 카테고리 범례 */}
            <ul className="hidden items-center gap-3 text-xs text-content-soft sm:flex">
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-yonsei-blue" aria-hidden="true" />
                {t('catEvent')}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-yonsei-gold" aria-hidden="true" />
                {t('catAlumni')}
              </li>
            </ul>
            <Link href="/news#calendar" className="-my-1 py-1 text-sm font-semibold text-yonsei-blue hover:underline">
              {t('more')} →
            </Link>
          </div>
        </div>

        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(days ?? Array.from({ length: 7 }, () => null)).map((day, i) => (
            <li
              key={day?.iso ?? i}
              className={cn(
                'flex min-h-[7.5rem] flex-col border p-3',
                day?.isToday
                  ? 'border-yonsei-blue bg-yonsei-navy text-white'
                  : 'border-surface-border bg-surface',
              )}
            >
              {day ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span
                      className={cn(
                        'text-xs font-bold uppercase',
                        day.isToday ? 'text-yonsei-gold' : 'text-content-faint',
                      )}
                    >
                      {day.weekday}
                    </span>
                    <span className="text-lg font-extrabold">{day.dayNum}</span>
                  </div>
                  <div className="mt-2 flex flex-1 flex-col gap-1">
                    {day.entries.length > 0 ? (
                      day.entries.map((e) => (
                        <Link
                          key={`${e.category}-${e.id}`}
                          href={entryHref(e)}
                          className={cn(
                            'px-2 py-1 text-[0.7rem] font-medium leading-snug transition-colors',
                            day.isToday
                              ? 'bg-white/15 text-white hover:bg-white/25'
                              : e.category === 'alumni'
                                ? 'bg-yonsei-gold/15 text-yonsei-navy hover:bg-yonsei-gold/25'
                                : 'bg-yonsei-navy/5 text-yonsei-navy hover:bg-yonsei-navy/15',
                          )}
                        >
                          <span className="flex items-center gap-1">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                                e.category === 'alumni' ? 'bg-yonsei-gold' : 'bg-yonsei-blue',
                                day.isToday && 'bg-white',
                              )}
                            />
                            <span className="text-[0.6rem] font-bold uppercase tracking-wide opacity-80">
                              {e.category === 'alumni' ? t('catAlumni') : t('catEvent')}
                            </span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block">{pick(e.title, locale)}</span>
                        </Link>
                      ))
                    ) : (
                      <span
                        className={cn(
                          'mt-auto text-[0.7rem]',
                          day.isToday ? 'text-white/50' : 'text-content-faint/60',
                        )}
                      >
                        {t('empty')}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <span className="sr-only">…</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
