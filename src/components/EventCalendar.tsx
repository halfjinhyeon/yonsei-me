'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { civilFromDays, daysFromCivil, daysInMonth, isoToDays, toIso } from '@/lib/calendar';
import { KIND_LABELS, KIND_ORDER, KIND_STYLES, kindRank } from '@/lib/calendar-kinds';
import type { CalendarEntry } from '@/lib/calendar-kinds';
import type { Locale } from '@/i18n/routing';

/**
 * 뉴스 페이지 '일정' 탭의 월간 캘린더 (POSTECH 학사일정 스타일).
 *
 * 데이터 소스는 두 갈래이고 서버(news/page.tsx)에서 CalendarEntry[] 로 합쳐 넘긴다.
 *  1) 게시판 글 — 행사(events)·세미나(seminars). 행사는 구조화된 endDate 가 없으면
 *     dateLabel(사람이 적은 실제 기간)을 parseDateLabelRange 로 파싱한 범위를 쓴다.
 *  2) CMS '일정 (캘린더)' 게시판 — 본문 없는 학사일정/모집·신청/시험. 분류가 그대로
 *     kind 가 되고(단, CMS 의 '행사'는 행사 게시판과 같은 event 로 접는다 — 학생에겐
 *     둘 다 그냥 행사다), 링크가 없을 수 있어 href 는 선택이다.
 *
 * 레이아웃: 좌측 월간 그리드(멀티데이 이어진 바) + 우측 월간 일정 패널(실질 접근성 목록).
 * 그리드의 날짜 셀은 더 이상 버튼이 아니며, href 가 있는 이벤트 바만 <Link> 다.
 */
/** 엔트리가 해당 날짜를 포함하는가 — 멀티데이는 시작~종료 사이 모든 날에 참(ISO 사전순 비교) */
const coversDay = (e: CalendarEntry, iso: string) => e.date <= iso && iso <= e.endDate;

/** 한 주 안에 배치되는 이벤트 바 세그먼트(레인 패킹 완료 후) */
interface Segment {
  entry: CalendarEntry;
  colStart: number; // 0..6 (주 내 시작 열, 0=일요일)
  span: number; // 1..7 (열 개수)
  isStart: boolean; // 실제 행사 시작일이 이 세그먼트에 포함되는가(좌측 액센트 표시)
  lane: number; // 0-based 레인(그리드 행)
}

interface WeekRow {
  cells: { iso: string; day: number; inMonth: boolean }[]; // 항상 7개(일→토)
  segments: Segment[];
  laneCount: number;
}

/** "2026-07-01" → "2026.07.01" (점 구분, 타임존 무관 문자열 치환) */
const dotDate = (iso: string) => iso.split('-').join('.');

export function EventCalendar({
  entries,
  locale,
}: {
  entries: CalendarEntry[];
  locale: Locale;
}) {
  const ko = locale === 'ko';
  const intlLocale = ko ? 'ko-KR' : 'en-US';

  // 오늘(로컬) — 로컬 getter 로 읽어 ISO 파싱 UTC 버그를 피한다.
  const today = useMemo(() => new Date(), []);
  const todayIso = toIso(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  // 선택한 날짜 — 그리드 아래 '그날 일정' 목록의 기준(초기값 오늘). 멀티데이 행사는
  // 기간 중 어느 날을 골라도 목록에 잡힌다(coversDay — 구버전의 시작일 매칭보다 개선).
  const [selectedIso, setSelectedIso] = useState<string>(todayIso);

  // 연도 선택 범위: 일정 min/max 연도(시작·종료 모두 고려) ±1, 올해 포함.
  const yearOptions = useMemo(() => {
    const cur = today.getFullYear();
    let min = cur;
    let max = cur;
    for (const e of entries) {
      for (const iso of [e.date, e.endDate]) {
        const y = Number(iso.slice(0, 4));
        if (!Number.isNaN(y)) {
          if (y < min) min = y;
          if (y > max) max = y;
        }
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

  // 요일 헤더 (일~토, locale short) — 2024-01-07 이 일요일
  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [intlLocale]);

  const monthLabel = ko
    ? `${viewYear}년 ${viewMonth + 1}월`
    : `${monthNames[viewMonth]} ${viewYear}`;

  // ── 월 경계(일련번호) — 그리드/세그먼트 클램프의 기준 ──
  const monthFirstOrd = daysFromCivil(viewYear, viewMonth + 1, 1);
  const monthDayCount = daysInMonth(viewYear, viewMonth + 1);
  const monthLastOrd = monthFirstOrd + monthDayCount - 1;
  const monthFirstIso = toIso(viewYear, viewMonth + 1, 1);
  const monthLastIso = toIso(viewYear, viewMonth + 1, monthDayCount);

  // ── 주 행 구성 + 주별 세그먼트 계산 + greedy 레인 패킹 ──
  // 바는 view 월 범위로 클램프한다(이전/다음 달로 넘어가는 부분은 이 달 1일/말일에서 끊김).
  const weeks = useMemo<WeekRow[]>(() => {
    // 그리드 첫 칸 = 그 달 1일이 속한 주의 일요일. (일련번호 0=1970-01-01=목요일 기준 산술 요일)
    const firstDow = ((monthFirstOrd + 4) % 7 + 7) % 7; // 0=일 … 6=토
    const gridStartOrd = monthFirstOrd - firstDow;
    const weekCount = Math.ceil((firstDow + monthDayCount) / 7);

    // 이 달과 겹치는 엔트리를 월 범위로 클램프한 [startOrd, endOrd] 로 사전 계산.
    // trueStart 는 클램프 전 실제 시작일(세그먼트의 좌측 액센트 판정용).
    const clamped = entries
      .map((e) => {
        const rawStart = isoToDays(e.date);
        const rawEnd = isoToDays(e.endDate);
        if (Number.isNaN(rawStart) || Number.isNaN(rawEnd)) return null;
        const s = Math.max(rawStart, monthFirstOrd);
        const en = Math.min(Math.max(rawEnd, rawStart), monthLastOrd);
        if (s > en) return null; // 이 달에 걸치지 않음
        return { entry: e, startOrd: s, endOrd: en, trueStart: rawStart, totalSpan: en - s + 1 };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const rows: WeekRow[] = [];
    for (let w = 0; w < weekCount; w += 1) {
      const weekStartOrd = gridStartOrd + w * 7;
      const weekEndOrd = weekStartOrd + 6;
      // 이 주에서 바가 그려질 수 있는 범위(월 내부로 클램프)
      const renderStart = Math.max(weekStartOrd, monthFirstOrd);
      const renderEnd = Math.min(weekEndOrd, monthLastOrd);

      const cells = Array.from({ length: 7 }, (_, i) => {
        const ord = weekStartOrd + i;
        const { y, m, d } = civilFromDays(ord);
        return {
          iso: toIso(y, m, d),
          day: d,
          inMonth: ord >= monthFirstOrd && ord <= monthLastOrd,
        };
      });

      // 이 주에 걸치는 세그먼트: [start..end] ∩ [이 주의 렌더 가능 날짜들]
      const segs: (Omit<Segment, 'lane'> & { totalSpan: number })[] = [];
      if (renderStart <= renderEnd) {
        for (const c of clamped) {
          const segStart = Math.max(c.startOrd, renderStart);
          const segEnd = Math.min(c.endOrd, renderEnd);
          if (segStart > segEnd) continue;
          segs.push({
            entry: c.entry,
            colStart: segStart - weekStartOrd,
            span: segEnd - segStart + 1,
            isStart: segStart === c.trueStart,
            totalSpan: c.totalSpan,
          });
        }
      }

      // 정렬: 전체 span 내림차순 → 시작 열 오름차순 → id (안정). 긴 이벤트가 낮은 레인을
      // 차지해 여러 주에 걸쳐도 대체로 같은 높이로 이어져 보이게 한다.
      segs.sort(
        (a, b) =>
          b.totalSpan - a.totalSpan ||
          a.colStart - b.colStart ||
          a.entry.id.localeCompare(b.entry.id),
      );

      // greedy 레인 패킹: 각 세그먼트를 겹치지 않는 가장 낮은 레인에 배치(레인 수 제한 없음).
      const laneEnds: number[] = []; // laneEnds[lane] = 그 레인 마지막 세그먼트의 colEnd
      const placed: Segment[] = [];
      for (const s of segs) {
        const colEnd = s.colStart + s.span - 1;
        let lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] >= s.colStart) lane += 1;
        laneEnds[lane] = colEnd;
        placed.push({ entry: s.entry, colStart: s.colStart, span: s.span, isStart: s.isStart, lane });
      }
      rows.push({ cells, segments: placed, laneCount: laneEnds.length });
    }
    return rows;
  }, [entries, monthFirstOrd, monthLastOrd, monthDayCount]);

  // 우측 패널 목록: 이 달과 겹치는(start<=월말 && end>=월초) 엔트리를 시작일 오름차순.
  // ISO(YYYY-MM-DD) 는 사전순 == 시간순이라 문자열 비교로 안전.
  const monthEntries = useMemo(
    () =>
      entries
        .filter((e) => e.date <= monthLastIso && e.endDate >= monthFirstIso)
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title))),
    [entries, monthFirstIso, monthLastIso],
  );

  // 선택 날짜의 일정 — 기간 포함 매칭, 종류순(행사 우선) → 제목순(구버전 정렬 관례 유지)
  const selectedEntries = useMemo(
    () =>
      entries
        .filter((e) => coversDay(e, selectedIso))
        .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.title.localeCompare(b.title)),
    [entries, selectedIso],
  );

  // 선택 날짜 표시 라벨(목록 헤더) — 로컬 생성자 사용(ISO 문자열 파싱의 UTC 함정 없음)
  const selectedLabel = useMemo(() => {
    const [y, m, d] = selectedIso.split('-').map(Number);
    return new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric',
      month: ko ? 'long' : 'short',
      day: 'numeric',
      weekday: 'long',
    }).format(new Date(y, m - 1, d));
  }, [selectedIso, intlLocale, ko]);

  function goToMonth(deltaMonths: number) {
    const base = new Date(viewYear, viewMonth + deltaMonths, 1);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  }
  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  const kindLabel = (kind: CalendarEntry['kind']) =>
    ko ? KIND_LABELS[kind].ko : KIND_LABELS[kind].en;

  const periodText = (e: CalendarEntry) =>
    e.date === e.endDate ? dotDate(e.date) : `${dotDate(e.date)} ~ ${dotDate(e.endDate)}`;

  const barAria = (e: CalendarEntry) => `${e.title}, ${periodText(e)}, ${kindLabel(e.kind)}`;

  const selectClass =
    'appearance-none rounded-none border border-surface-border bg-surface px-3 py-1.5 text-sm font-semibold text-content outline-none transition-colors hover:border-yonsei-blue focus:border-yonsei-blue';
  const navBtnClass =
    'grid h-8 w-8 place-items-center rounded-none border border-surface-border text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-navy';

  return (
    <div>
      {/* 헤더: 이전/다음 달 + 오늘 + 년/월 선택 + 범례 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={goToToday}
            className="rounded-none border border-yonsei-navy px-3 py-1.5 text-sm font-semibold text-yonsei-navy transition-colors hover:bg-yonsei-navy hover:text-white"
          >
            {ko ? '오늘' : 'Today'}
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

        {/* 범례 — 종류 5종의 점 + 라벨. 좁은 폭에서는 줄바꿈(5개가 한 줄에 안 들어간다) */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-content-soft">
          {KIND_ORDER.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', KIND_STYLES[k].dot)} aria-hidden="true" />
              {ko ? KIND_LABELS[k].ko : KIND_LABELS[k].enPlural}
            </li>
          ))}
        </ul>
      </div>

      {/* 본문: 좌 캘린더 그리드 / 우 월간 일정 패널 (모바일·태블릿은 세로 스택) */}
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        {/* ── 좌: 월간 그리드 ── */}
        <div className="min-w-0">
          <h3 className="sr-only">{ko ? `${monthLabel} 일정` : `${monthLabel} schedule`}</h3>

          {/* 그리드 프레임: 좌·상 테두리는 컨테이너가, 우·하 hairline 은 각 셀이 그린다.
              바 높이(--cal-bar-h)는 브레이크포인트별로 달라 인라인 grid-template-rows 에서 참조. */}
          <div className="border-l border-t border-surface-border [--cal-bar-h:0.375rem] sm:[--cal-bar-h:1.5rem]">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7" aria-hidden="true">
              {weekdayNames.map((name, i) => (
                <div
                  key={i}
                  className={cn(
                    'border-b border-r border-surface-border py-2 text-center text-xs font-semibold',
                    i === 0 ? 'text-red-500/70' : i === 6 ? 'text-yonsei-blue' : 'text-content-soft',
                  )}
                >
                  {name}
                </div>
              ))}
            </div>

            {/* 주 행 — 각 주는 하나의 CSS 그리드: row1=날짜 숫자, row2+=레인, 마지막=여백 필러.
                열 배경 셀은 1/-1 전체 높이를 차지해 테두리·월외 음영을 그린다. */}
            {weeks.map((week, wi) => (
              <div
                key={wi}
                className="relative grid min-h-14 sm:min-h-24 lg:min-h-28"
                style={{
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gridTemplateRows:
                    week.laneCount > 0
                      ? `auto repeat(${week.laneCount}, var(--cal-bar-h)) 1fr`
                      : 'auto 1fr',
                  rowGap: '2px',
                }}
              >
                {/* 열 배경 셀(전체 높이) — 테두리 + 월외 음영 + 날짜 선택 버튼.
                    클릭하면 그리드 아래 '그날 일정' 목록이 그 날짜로 바뀐다(선택=파란 인셋 링).
                    이벤트 바(z-10 Link)는 이 버튼 위에 떠 있어 바 클릭은 게시물로 간다. */}
                {week.cells.map((c, i) => {
                  const isSelected = c.iso === selectedIso;
                  const count = entries.filter((e) => coversDay(e, c.iso)).length;
                  const [, mm, dd] = c.iso.split('-').map(Number);
                  return (
                    <button
                      key={`bg-${i}`}
                      type="button"
                      onClick={() => setSelectedIso(c.iso)}
                      aria-pressed={isSelected}
                      aria-label={
                        ko ? `${mm}월 ${dd}일, 일정 ${count}건` : `${mm}/${dd}, ${count} event(s)`
                      }
                      className={cn(
                        'border-b border-r border-surface-border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yonsei-blue',
                        !c.inMonth && 'bg-surface-soft/40',
                        isSelected ? 'ring-2 ring-inset ring-yonsei-blue' : 'hover:bg-surface-soft/60',
                      )}
                      style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
                    />
                  );
                })}

                {/* 날짜 숫자(row 1) — 오늘=네이비 원형 배지, 일=빨강/토=파랑, 월외=옅게.
                    pointer-events-none: 숫자 레이어가 아래 날짜 선택 버튼의 클릭을 막지 않게. */}
                {week.cells.map((c, i) => {
                  const isToday = c.iso === todayIso;
                  return (
                    <div
                      key={`num-${i}`}
                      aria-hidden="true"
                      className="pointer-events-none px-1 pt-1 sm:px-1.5 sm:pt-1.5"
                      style={{ gridColumn: i + 1, gridRow: 1 }}
                    >
                      <span
                        className={cn(
                          'inline-grid h-6 w-6 place-items-center text-xs font-semibold tabular-nums sm:text-sm',
                          isToday
                            ? 'rounded-full bg-yonsei-navy text-white'
                            : !c.inMonth
                              ? 'text-content-faint'
                              : i === 0
                                ? 'text-red-500/70'
                                : i === 6
                                  ? 'text-yonsei-blue'
                                  : 'text-content',
                        )}
                      >
                        {c.day}
                      </span>
                    </div>
                  );
                })}

                {/* 이벤트 바 — 주 세그먼트를 7열 grid overlay 에 grid-column 스팬으로 배치.
                    모바일(sm 미만)은 텍스트를 숨긴 얇은 스트립, sm+ 는 제목 표시. */}
                {week.segments.map((seg) => {
                  const style = {
                    gridColumn: `${seg.colStart + 1} / span ${seg.span}`,
                    gridRow: seg.lane + 2,
                  };
                  const barClass = cn(
                    'z-10 mx-[3px] flex items-center overflow-hidden rounded-none leading-none',
                    KIND_STYLES[seg.entry.kind].bar,
                    seg.isStart && cn('border-l-2', KIND_STYLES[seg.entry.kind].accent),
                  );
                  const label = (
                    <span className="hidden truncate px-1.5 text-[0.72rem] font-medium sm:block">
                      {seg.entry.title}
                    </span>
                  );
                  // 상세가 없는 일정(캘린더 전용)은 <div> 로 그린다. pointer-events-none 을 주는
                  // 이유: 바가 날짜 선택 버튼 위에 떠 있어서, 링크가 아닌데도 클릭을 가로채면
                  // 그 날은 아예 선택할 수 없게 된다. 통과시켜 날짜 선택을 살린다.
                  return seg.entry.href ? (
                    <Link
                      key={`${seg.entry.id}-${seg.colStart}`}
                      href={seg.entry.href}
                      aria-label={barAria(seg.entry)}
                      title={seg.entry.title}
                      className={cn(
                        barClass,
                        'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yonsei-blue',
                        KIND_STYLES[seg.entry.kind].barHover,
                      )}
                      style={style}
                    >
                      {label}
                    </Link>
                  ) : (
                    <div
                      key={`${seg.entry.id}-${seg.colStart}`}
                      className={cn(barClass, 'pointer-events-none')}
                      style={style}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 선택 날짜의 일정 — 날짜 셀 클릭으로 갱신(구버전 기능 복원). 멀티데이 행사는
              기간 중 어느 날짜를 선택해도 나타나고, 우측 기간 표기로 전체 일정을 보인다. */}
          <div className="mt-6" aria-live="polite">
            <h4 className="text-sm font-bold tracking-tight text-content">{selectedLabel}</h4>
            {selectedEntries.length > 0 ? (
              <ul className="mt-3 divide-y divide-surface-border border-y border-surface-border">
                {selectedEntries.map((e) => {
                  // 배지·제목·기간 배치는 링크 여부와 무관하게 같다. 상세가 없는 일정만
                  // hover 강조 없는 <div> 가 된다(누를 곳이 없는데 눌릴 것처럼 보이면 안 된다).
                  const row = (
                    <>
                      <span
                        className={cn(
                          'shrink-0 whitespace-nowrap px-2.5 py-1 text-xs font-bold',
                          KIND_STYLES[e.kind].badge,
                        )}
                      >
                        {kindLabel(e.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                        {e.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-content-faint">
                        {periodText(e)}
                      </span>
                    </>
                  );
                  return (
                    <li key={e.id}>
                      {e.href ? (
                        <Link
                          href={e.href}
                          className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-soft"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 py-3">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-content-faint">
                {ko ? '선택한 날짜에 일정이 없습니다.' : 'No events on the selected date.'}
              </p>
            )}
          </div>
        </div>

        {/* ── 우: 월간 일정 패널(실질 접근성 목록) ── */}
        <aside className="mt-8 lg:mt-0">
          <div className="border border-surface-border p-6 lg:sticky lg:top-36">
            <h3 className="inline-block bg-yonsei-navy px-3.5 py-1.5 text-sm font-bold text-white">
              {ko ? `${viewYear}년 ${viewMonth + 1}월 일정` : `${monthNames[viewMonth]} ${viewYear} Schedule`}
            </h3>

            {monthEntries.length > 0 ? (
              <ul className="mt-5 space-y-4">
                {monthEntries.map((e) => (
                  <li key={e.id} className="flex gap-2.5">
                    <span
                      className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_STYLES[e.kind].dot)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      {/* 상세가 없는 캘린더 전용 일정은 링크 색·hover 없이 제목만 */}
                      {e.href ? (
                        <Link
                          href={e.href}
                          className="block text-sm font-semibold leading-snug text-content transition-colors hover:text-yonsei-blue"
                        >
                          {e.title}
                        </Link>
                      ) : (
                        <span className="block text-sm font-semibold leading-snug text-content">
                          {e.title}
                        </span>
                      )}
                      <p className="mt-0.5 text-xs tabular-nums text-content-faint">{periodText(e)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-content-faint">
                {ko ? '이 달에는 등록된 일정이 없습니다.' : 'No scheduled events this month.'}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
