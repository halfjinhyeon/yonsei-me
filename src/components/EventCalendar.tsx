'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

/**
 * 뉴스 페이지 '일정' 탭의 월간 캘린더.
 *
 * 데이터 소스는 별도 콘텐츠 파일이 아니라 기존 board.json 의 행사(events)·세미나(seminars)
 * 게시판이다. 관리자 콘솔(/ko/admin)이 이미 이 두 게시판을 편집하므로, 관리자가 행사·세미나
 * 글을 올리기만 하면 그 글의 date 필드가 이 캘린더에 자동으로 표시된다(별도 일정 관리 불필요).
 * 서버(news/page.tsx)에서 두 게시판을 CalendarEntry[] 로 가공해 넘긴다.
 */
export interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // 서버에서 pick() 완료된 문자열
  kind: 'event' | 'seminar';
  href: string; // /news/post/<id>
}

/** 로컬 기준 YYYY-MM-DD 문자열 (timezone 함정 회피 — 문자열 비교로만 날짜를 다룬다) */
function isoOf(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const KIND_STYLES: Record<
  CalendarEntry['kind'],
  { pill: string; dot: string; badge: string }
> = {
  event: {
    pill: 'bg-yonsei-navy/5 text-yonsei-navy hover:bg-yonsei-navy/15',
    dot: 'bg-yonsei-navy',
    badge: 'bg-yonsei-navy/5 text-yonsei-navy',
  },
  seminar: {
    pill: 'bg-yonsei-gold/15 text-yonsei-gold hover:bg-yonsei-gold/25',
    dot: 'bg-yonsei-gold',
    badge: 'bg-yonsei-gold/15 text-yonsei-gold',
  },
};

export function EventCalendar({
  entries,
  locale,
}: {
  entries: CalendarEntry[];
  locale: Locale;
}) {
  const ko = locale === 'ko';
  const intlLocale = ko ? 'ko-KR' : 'en-US';

  // 오늘 (로컬 기준) — 렌더 시점 고정, 서버/클라이언트 hydration 이후 클라이언트 값 사용
  const today = useMemo(() => new Date(), []);
  const todayIso = isoOf(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [selectedIso, setSelectedIso] = useState<string>(todayIso);

  // 일정 → 날짜별 그룹 (YYYY-MM-DD → entries), 각 날짜는 종류·제목순 안정 정렬
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === 'event' ? -1 : 1,
      );
    }
    return map;
  }, [entries]);

  // 연도 선택 범위: min(일정 최소 연도, 올해)−1 ~ max(일정 최대 연도, 올해)+1
  const yearOptions = useMemo(() => {
    const cur = today.getFullYear();
    let min = cur;
    let max = cur;
    for (const e of entries) {
      const y = Number(e.date.slice(0, 4));
      if (!Number.isNaN(y)) {
        if (y < min) min = y;
        if (y > max) max = y;
      }
    }
    min -= 1;
    max += 1;
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [entries, today]);

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { month: 'long' });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2020, m, 1)));
  }, [intlLocale]);

  // 요일 헤더 (일~토, locale short)
  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
    // 2024-01-07 = 일요일 기준으로 7일
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [intlLocale]);

  // 월간 그리드: 1일의 요일에 맞춘 앞 빈 칸 + 날짜 셀, 마지막 주 뒤 빈 칸 (7의 배수 맞춤)
  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0=일
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const list: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) list.push(d);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [viewYear, viewMonth]);

  const monthLabel = ko
    ? `${viewYear}년 ${viewMonth + 1}월`
    : `${monthNames[viewMonth]} ${viewYear}`;

  // 이 달에 일정이 하나라도 있는지 (빈 상태 안내용)
  const monthHasEntries = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-`;
    for (const date of byDate.keys()) if (date.startsWith(prefix)) return true;
    return false;
  }, [byDate, viewYear, viewMonth]);

  const selectedEntries = selectedIso ? byDate.get(selectedIso) ?? [] : [];

  function goToMonth(deltaMonths: number) {
    const base = new Date(viewYear, viewMonth + deltaMonths, 1);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  }

  const kindLabel = (kind: CalendarEntry['kind']) =>
    kind === 'event' ? (ko ? '행사' : 'Event') : ko ? '세미나' : 'Seminar';

  // 선택된 날짜의 표시용 라벨 (리스트 헤더)
  const selectedLabel = useMemo(() => {
    if (!selectedIso) return '';
    const [y, m, d] = selectedIso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric',
      month: ko ? 'long' : 'short',
      day: 'numeric',
      weekday: 'long',
    }).format(date);
  }, [selectedIso, intlLocale, ko]);

  const selectClass =
    'appearance-none rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm font-semibold text-content outline-none transition-colors hover:border-yonsei-blue focus:border-yonsei-blue';
  const navBtnClass =
    'grid h-8 w-8 place-items-center rounded-lg border border-surface-border text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-navy';

  return (
    <div>
      {/* 헤더: 이전/다음 달 + 년/월 선택 + 범례 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            className={navBtnClass}
            aria-label={ko ? '이전 달' : 'Previous month'}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className={navBtnClass}
            aria-label={ko ? '다음 달' : 'Next month'}
          >
            <span aria-hidden="true">›</span>
          </button>

          <div className="ml-1 flex items-center gap-2">
            <div className="relative">
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className={cn(selectClass, 'pr-7')}
                aria-label={ko ? '연도 선택' : 'Select year'}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {ko ? `${y}년` : y}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-content-faint"
              >
                ▾
              </span>
            </div>
            <div className="relative">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className={cn(selectClass, 'pr-7')}
                aria-label={ko ? '월 선택' : 'Select month'}
              >
                {monthNames.map((name, m) => (
                  <option key={m} value={m}>
                    {ko ? `${m + 1}월` : name}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-content-faint"
              >
                ▾
              </span>
            </div>
          </div>
        </div>

        {/* 범례 */}
        <ul className="flex items-center gap-4 text-xs text-content-soft">
          <li className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', KIND_STYLES.event.dot)} aria-hidden="true" />
            {ko ? '행사' : 'Events'}
          </li>
          <li className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', KIND_STYLES.seminar.dot)} aria-hidden="true" />
            {ko ? '세미나' : 'Seminars'}
          </li>
        </ul>
      </div>

      {/* 월간 그리드 */}
      <div className="mt-5 overflow-hidden rounded-lg border border-surface-border">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">{ko ? `${monthLabel} 일정` : `Schedule for ${monthLabel}`}</caption>
          <thead>
            <tr className="bg-surface-soft">
              {weekdayNames.map((name, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    'border-b border-surface-border py-2 text-center text-xs font-semibold',
                    i === 0 ? 'text-red-500/70' : i === 6 ? 'text-yonsei-blue' : 'text-content-soft',
                  )}
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: cells.length / 7 }, (_, week) => (
              <tr key={week}>
                {cells.slice(week * 7, week * 7 + 7).map((day, dow) => {
                  if (day === null) {
                    return (
                      <td
                        key={dow}
                        className="h-20 border-b border-r border-surface-border last:border-r-0 bg-surface-soft/40 align-top sm:h-28"
                      />
                    );
                  }
                  const iso = isoOf(viewYear, viewMonth, day);
                  const dayEntries = byDate.get(iso) ?? [];
                  const isToday = iso === todayIso;
                  const isSelected = iso === selectedIso;
                  const isSunday = dow === 0;
                  const isSaturday = dow === 6;
                  const extra = dayEntries.length - 2;
                  return (
                    <td
                      key={dow}
                      className={cn(
                        'h-20 border-b border-r border-surface-border p-0 align-top last:border-r-0 sm:h-28',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedIso(iso)}
                        aria-current={isToday ? 'date' : undefined}
                        aria-pressed={isSelected}
                        aria-label={
                          ko
                            ? `${viewMonth + 1}월 ${day}일, 일정 ${dayEntries.length}건`
                            : `${monthNames[viewMonth]} ${day}, ${dayEntries.length} event(s)`
                        }
                        className={cn(
                          'flex h-full w-full flex-col gap-1 p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yonsei-blue sm:p-2',
                          isSelected
                            ? 'ring-2 ring-inset ring-yonsei-blue'
                            : 'hover:bg-surface-soft',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-grid h-6 w-6 shrink-0 place-items-center text-xs font-semibold tabular-nums sm:text-sm',
                            isToday
                              ? 'rounded-full bg-yonsei-navy text-white'
                              : isSunday
                                ? 'text-red-500/70'
                                : isSaturday
                                  ? 'text-yonsei-blue'
                                  : 'text-content',
                          )}
                        >
                          {day}
                        </span>

                        {dayEntries.length > 0 && (
                          <>
                            {/* 모바일: 색 점만 */}
                            <span className="mt-0.5 flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                              {dayEntries.slice(0, 4).map((e) => (
                                <span
                                  key={e.id}
                                  className={cn('h-1.5 w-1.5 rounded-full', KIND_STYLES[e.kind].dot)}
                                />
                              ))}
                            </span>
                            {/* sm+: 파스텔 필 (최대 2개 + 초과분) */}
                            <span className="hidden min-w-0 flex-col gap-1 sm:flex" aria-hidden="true">
                              {dayEntries.slice(0, 2).map((e) => (
                                <span
                                  key={e.id}
                                  className={cn(
                                    'truncate rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium leading-snug',
                                    KIND_STYLES[e.kind].pill,
                                  )}
                                >
                                  {e.title}
                                </span>
                              ))}
                              {extra > 0 && (
                                <span className="px-1.5 text-[0.7rem] font-semibold text-content-faint">
                                  +{extra}
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 빈 상태 */}
      {!monthHasEntries && (
        <p className="mt-4 text-sm text-content-faint">
          {ko ? '이 달에는 등록된 일정이 없습니다.' : 'No scheduled events this month.'}
        </p>
      )}

      {/* 선택된 날짜의 일정 리스트 */}
      <div className="mt-6">
        <h3 className="text-sm font-bold tracking-tight text-content">{selectedLabel}</h3>
        {selectedEntries.length > 0 ? (
          <ul className="mt-3 divide-y divide-surface-border border-y border-surface-border">
            {selectedEntries.map((e) => (
              <li key={e.id}>
                <Link
                  href={e.href}
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-soft"
                >
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
                      KIND_STYLES[e.kind].badge,
                    )}
                  >
                    {kindLabel(e.kind)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                    {e.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-content-faint">{e.date}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-content-faint">
            {ko ? '선택한 날짜에 일정이 없습니다.' : 'No events on the selected date.'}
          </p>
        )}
      </div>
    </div>
  );
}
