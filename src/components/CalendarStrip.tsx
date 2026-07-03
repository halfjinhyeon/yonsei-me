'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { pick, type EventItem } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

interface Day {
  iso: string;
  weekday: string;
  dayNum: number;
  isToday: boolean;
  events: EventItem[];
}

/**
 * 금주의 행사 7일 스트립(그리드만). WeeklyCalendar(홈, 풀블리드 섹션)와 로직은
 * 같지만 컨테이너 폭에 맞춰 끼워 넣을 수 있도록 래퍼 없이 그리드만 렌더한다.
 */
export function CalendarStrip({ events, locale }: { events: EventItem[]; locale: Locale }) {
  const t = useTranslations('board.weekly');
  const [days, setDays] = useState<Day[] | null>(null);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
        events: events.filter((e) => e.date === iso),
      };
    });
    setDays(result);
  }, [events, locale]);

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {(days ?? Array.from({ length: 7 }, () => null)).map((day, i) => (
        <li
          key={day?.iso ?? i}
          className={cn(
            'flex min-h-[7.5rem] flex-col rounded-xl border p-3',
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
                {day.events.length > 0 ? (
                  day.events.map((e) => (
                    <Link
                      key={e.id}
                      href={`/news/post/${e.id}`}
                      className={cn(
                        'line-clamp-3 rounded-md px-2 py-1 text-[0.7rem] font-medium leading-snug transition-colors',
                        day.isToday
                          ? 'bg-white/15 text-white hover:bg-white/25'
                          : 'bg-yonsei-navy/5 text-yonsei-navy hover:bg-yonsei-navy/15',
                      )}
                    >
                      {pick(e.title, locale)}
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
  );
}
