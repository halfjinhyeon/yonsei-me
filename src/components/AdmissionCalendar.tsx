'use client';

import { useMemo, useState } from 'react';
import guide from '@content/admission-guide.json';
import { pick } from '@/lib/content';
import { useLandingAnimation } from '@/components/LandingScope';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

/** content/admission-guide.json 의 calendar 블록 형태 */
interface Localized {
  ko: string;
  en: string;
}
interface CalendarEvent {
  /** ISO(YYYY-MM-DD). 월·일·요일은 여기서 파생시킨다(중복 저장하지 않는다) */
  date: string;
  /** tracks 의 키 — 'susi' | 'overseas' */
  track: string;
  /** types[].key */
  type: string;
  title: Localized;
  lines: Localized[];
}
interface CalendarData {
  year: string;
  title: Localized;
  intro: Localized;
  disclaimer: Localized;
  tracks: Record<string, Localized>;
  types: { key: string; label: Localized }[];
  events: CalendarEvent[];
}

const calendar = (guide as { calendar: CalendarData }).calendar;

/** 대형 숫자(연도·월·D-day)는 Paperlogy — 사이트 공통 서브헤드 글꼴 지정 방식 */
const SUBHEAD_FONT = { fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' };

/** 전형 색상 코딩 (연세 팔레트 + 보조색). 골드는 디자인 언어에서 배제되어 쓰지 않는다 */
const TYPE_COLOR: Record<string, string> = {
  common: '#003377',
  comprehensive: '#0057A8',
  subject: '#2E86D6',
  essay: '#8A6D3B',
  talent: 'oklch(0.5 0.09 310)',
  overseas: '#6E6E6E',
};
const typeColor = (type: string) => TYPE_COLOR[type] ?? '#003377';

const MONTH_ENG = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];
const MONTH_ABBR = MONTH_ENG.map((m) => m.slice(0, 3));
const MONTH_ABBR_CAP = MONTH_ABBR.map((m) => m[0] + m.slice(1).toLowerCase());
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MS_PER_DAY = 86_400_000;

/**
 * 'YYYY-MM-DD' → 로컬 자정 Date.
 * new Date('2026-02-03') 은 UTC 자정으로 파싱되어 KST 밖(UTC-)에서는 요일이 하루 밀린다.
 * 요일·D-day 계산이 모두 이 함수를 거치게 해서 그 함정을 막는다.
 */
function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 빈 달 목록을 연속 구간으로 축약 — ko '1월, 3~8월' / en 'Jan, Mar–Aug' */
function compressMonths(months: number[], ko: boolean): string {
  const runs: [number, number][] = [];
  for (const m of months) {
    const last = runs[runs.length - 1];
    if (last && last[1] === m - 1) last[1] = m;
    else runs.push([m, m]);
  }
  const one = (m: number) => (ko ? `${m}월` : MONTH_ABBR_CAP[m - 1]);
  return runs
    .map(([a, b]) => {
      if (a === b) return one(a);
      return ko ? `${a}~${b}월` : `${MONTH_ABBR_CAP[a - 1]}–${MONTH_ABBR_CAP[b - 1]}`;
    })
    .join(', ');
}

/**
 * 소개 › 입학 안내 탭의 3번 섹션 — 2026학년도 입학 캘린더.
 *
 * 구성: 섹션 헤더(번호 + 네이비 룰, GuideSections 와 동일 문법) → 좌 대형 연도 / 우 안내문
 * + '다음 일정' 카드 → 전형 필터 칩 → 연간 12개월 스트립(클릭 시 해당 월로 스크롤) →
 * 월별 타임라인. 일정 데이터는 content/admission-guide.json 의 calendar 블록이 공급한다.
 *
 * 필터 매칭 규칙: '전체'=모두, '재외국민'=track 매칭(재외국민 일정은 type 이 '공통'이라
 * type 으로는 잡히지 않는다), 그 외는 type 매칭.
 *
 * 랜딩 애니메이션은 1·2번 섹션(GuideSections)과 같은 어휘로 정적인 헤더 영역에만 건다 —
 * 룰 wipe → 제목·본문 rise → 연도 wipe(아래에서) → 카드 rise → 칩·스트립 fade.
 * 월별 타임라인은 제외: 필터로 마운트/언마운트가 일어나는 영역이라, 마운트 1회짜리
 * 초기 숨김(gsap.set)과 ScrollTrigger 위치가 재렌더와 어긋나 숨김 잔여물이 남을 수 있다.
 */
export function AdmissionCalendar({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  const landRef = useLandingAnimation<HTMLElement>('admission-calendar');
  // 오늘 자정 — D-day 는 날짜 단위 비교라 시각을 떨어뜨린다
  const today = useMemo(() => new Date(), []);
  const startOfToday = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
    [today],
  );

  const [filter, setFilter] = useState('all');

  /** 날짜 오름차순 정렬(같은 날짜는 JSON 기재 순서 유지) */
  const sorted = useMemo(
    () => calendar.events.map((ev, i) => ({ ev, i })).sort((a, b) => (a.ev.date < b.ev.date ? -1 : a.ev.date > b.ev.date ? 1 : a.i - b.i)).map((x) => x.ev),
    [],
  );

  /** 다음 일정 — 필터와 무관하게 전체 일정 기준(카드는 항상 같은 것을 가리켜야 한다) */
  const next = useMemo(
    () => sorted.find((ev) => parseIsoLocal(ev.date).getTime() >= startOfToday),
    [sorted, startOfToday],
  );
  const nextDiff = next
    ? Math.round((parseIsoLocal(next.date).getTime() - startOfToday) / MS_PER_DAY)
    : 0;
  const ddayLabel = nextDiff === 0 ? 'D-DAY' : `D-${nextDiff}`;

  const visible = useMemo(
    () =>
      sorted.filter((ev) => {
        if (filter === 'all') return true;
        if (filter === 'overseas') return ev.track === 'overseas';
        return ev.type === filter;
      }),
    [sorted, filter],
  );

  /** 월(1~12) → 필터 통과 일정. 스트립 건수·활성 월도 이 결과를 따른다 */
  const byMonth = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const ev of visible) {
      const m = Number(ev.date.slice(5, 7));
      const bucket = map.get(m);
      if (bucket) bucket.push(ev);
      else map.set(m, [ev]);
    }
    return map;
  }, [visible]);

  const emptyMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !byMonth.has(m)),
    [byMonth],
  );

  const typeLabel = (key: string) => {
    const t = calendar.types.find((x) => x.key === key);
    return t ? pick(t.label, locale) : key;
  };
  const trackLabel = (key: string) => {
    const t = calendar.tracks[key];
    return t ? pick(t, locale) : key;
  };

  /** '2026. 9. 7.(월)' / 'Sep 7 (Mon), 2026' */
  const whenLabel = (iso: string) => {
    const d = parseIsoLocal(iso);
    const [y, m, day] = iso.split('-').map(Number);
    return ko
      ? `${y}. ${m}. ${day}.(${WEEKDAY_KO[d.getDay()]})`
      : `${MONTH_ABBR_CAP[m - 1]} ${day} (${WEEKDAY_EN[d.getDay()]}), ${y}`;
  };

  /** 월 스트립 클릭 → 해당 월 블록으로. 상단 고정 헤더/탭바를 감안해 140px 위에서 멈춘다 */
  const scrollToMonth = (m: number) => {
    const el = document.getElementById(`cal-m${m}`);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 140,
      behavior: 'smooth',
    });
  };

  const chips = [{ key: 'all', label: { ko: '전체', en: 'All' } }, ...calendar.types];

  return (
    <section ref={landRef} aria-label={pick(calendar.title, locale)}>
      {/* 번호 + 전폭 네이비 룰 — 1·2번 섹션(GuideSections)과 같은 문법으로 이어 붙는다 */}
      <div
        data-land="wipe"
        data-land-order={0}
        className="border-b-2 border-yonsei-navy pb-2 text-sm font-bold text-content"
      >
        3
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
        {/* 좌: 대형 제목 + 연도 */}
        <div>
          <h3
            data-land="rise"
            data-land-order={1}
            className="text-3xl font-black tracking-tight text-content sm:text-4xl"
          >
            {pick(calendar.title, locale)}
          </h3>
          {/* 연도 숫자 — 1·2번 섹션의 엠블럼과 같은 자리·같은 등장(아래에서 차오름) */}
          <div
            aria-hidden="true"
            data-land="wipe"
            data-land-from="bottom"
            data-land-order={3}
            className="mt-10 text-[55px] font-bold leading-none tracking-[-0.03em] text-yonsei-navy"
            style={SUBHEAD_FONT}
          >
            {calendar.year}
          </div>
        </div>

        {/* 우: 안내문 + 유의사항 + 다음 일정 카드 */}
        <div>
          <p
            data-land="rise"
            data-land-order={2}
            className="text-base leading-[1.9] text-content sm:text-lg"
          >
            {pick(calendar.intro, locale)}
          </p>
          <p
            data-land="rise"
            data-land-order={3}
            className="mt-8 text-[15px] leading-relaxed text-content-faint"
          >
            {pick(calendar.disclaimer, locale)}
          </p>

          {next && (
            <div
              data-land="rise"
              data-land-order={4}
              className="mt-8 flex items-center gap-5 border border-surface-border bg-surface-soft px-6 py-5"
            >
              <div className="shrink-0 text-center">
                <div
                  className="text-[28px] font-bold leading-none text-yonsei-navy"
                  style={SUBHEAD_FONT}
                >
                  {ddayLabel}
                </div>
                <div className="mt-1 text-[11px] font-extrabold tracking-[0.14em] text-yonsei-blue">
                  NEXT
                </div>
              </div>
              <div aria-hidden="true" className="w-px shrink-0 self-stretch bg-surface-border" />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-content-faint">
                  {ko ? '다음 일정' : 'Next up'}
                </p>
                <p className="mt-1 text-[16px] font-bold text-content">
                  {pick(next.title, locale)}
                </p>
                <p className="mt-0.5 text-[14px] text-content-faint">
                  {`${whenLabel(next.date)} · ${trackLabel(next.track)} · ${typeLabel(next.type)}`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 전형 필터 칩 — 전체 + 전형 6종 */}
      <div
        role="group"
        aria-label={ko ? '전형 필터' : 'Admission track filter'}
        className="mt-14 flex flex-wrap gap-2.5"
      >
        {chips.map((chip) => {
          const active = filter === chip.key;
          // '전체' 칩의 점: 활성 시 네이비 배경 위라 흰색으로 뒤집는다(원안의 골드는 금지색)
          const dot =
            chip.key === 'all' ? (active ? '#ffffff' : '#003377') : typeColor(chip.key);
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(chip.key)}
              // 클릭 대상이라 이동 없이 페이드만 — 누르려는 순간 움직이면 미스클릭이 난다
              data-land="fade"
              data-land-order={5}
              className={cn(
                'inline-flex items-center gap-2 border px-4 py-[9px] text-[13px] font-bold transition-colors',
                active
                  ? 'border-yonsei-navy bg-yonsei-navy text-white'
                  : 'border-surface-border bg-white text-content hover:border-yonsei-navy',
              )}
            >
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2"
                style={{ background: dot }}
              />
              {pick(chip.label, locale)}
            </button>
          );
        })}
      </div>

      {/* 연간 스트립 — 필터 적용 후 건수. 좁은 폭에서는 6열 2줄로 접힌다 */}
      <div
        role="group"
        aria-label={ko ? '연간 일정 분포' : 'Yearly schedule distribution'}
        // 12개 셀을 개별 스태거하면 꼬리가 길어져 컨테이너 통째로 한 번만 페이드
        data-land="fade"
        data-land-order={6}
        className="mt-6 grid grid-cols-6 border border-surface-border sm:grid-cols-12"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const count = byMonth.get(m)?.length ?? 0;
          const has = count > 0;
          return (
            <button
              key={m}
              type="button"
              disabled={!has}
              onClick={() => scrollToMonth(m)}
              aria-label={
                ko
                  ? `${m}월 일정 ${count}건`
                  : `${MONTH_ABBR_CAP[m - 1]}, ${count} event(s)`
              }
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-[3px] border-l border-surface-border transition-colors',
                // 좁은 폭에서 6열 2줄로 접힐 때 줄 사이 구분선 (12열에서는 불필요)
                m > 6 && 'border-t sm:border-t-0',
                has
                  ? 'cursor-pointer bg-yonsei-navy text-white'
                  : 'cursor-default bg-white text-[#B8C0CC]',
              )}
            >
              <span aria-hidden="true" className="text-sm font-bold tabular-nums">
                {ko ? `${m}월` : MONTH_ABBR[m - 1]}
              </span>
              <span
                aria-hidden="true"
                className={cn('text-[11px] font-semibold', has ? 'text-white/65' : 'text-transparent')}
              >
                {has ? (ko ? `${count}건` : `${count}`) : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* 월별 타임라인 — 일정이 있는 달만, 오름차순 */}
      <div className="mt-2">
        {visible.length === 0 ? (
          <div className="mt-12 border border-surface-border bg-surface-soft px-6 py-16 text-center">
            <p className="text-[15px] text-content-faint">
              {ko ? '선택한 전형의 일정이 없습니다.' : 'No events for the selected track.'}
            </p>
          </div>
        ) : (
          Array.from(byMonth.keys())
            .sort((a, b) => a - b)
            .map((m) => (
              <div
                key={m}
                id={`cal-m${m}`}
                className="grid scroll-mt-[150px] grid-cols-1 gap-6 pb-2 pt-12 sm:grid-cols-[150px_1fr] sm:gap-12"
              >
                <div>
                  <div
                    className="text-[56px] font-bold leading-none text-yonsei-navy"
                    style={SUBHEAD_FONT}
                  >
                    {String(m).padStart(2, '0')}
                  </div>
                  <div className="mt-2 text-[11px] font-extrabold tracking-[0.18em] text-content-faint">
                    {MONTH_ENG[m - 1]}
                  </div>
                </div>

                <div className="min-w-0 border-t-2 border-yonsei-navy">
                  {(byMonth.get(m) ?? []).map((ev, i) => {
                    const d = parseIsoLocal(ev.date);
                    const isNext = next === ev;
                    const c = typeColor(ev.type);
                    return (
                      <div
                        key={`${ev.date}-${i}`}
                        className={cn(
                          'grid grid-cols-[56px_1fr] gap-4 border-b border-surface-border py-[22px] sm:grid-cols-[72px_1fr] sm:gap-6',
                          isNext && 'px-3',
                        )}
                        style={
                          isNext
                            ? { background: 'color-mix(in srgb, #003377 6%, white)' }
                            : undefined
                        }
                      >
                        <div>
                          <div className="text-[22px] font-extrabold leading-[1.1] tabular-nums text-content">
                            {d.getDate()}
                          </div>
                          <div className="mt-0.5 text-[12px] font-semibold text-content-faint">
                            ({ko ? WEEKDAY_KO[d.getDay()] : WEEKDAY_EN[d.getDay()]})
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12px] font-bold text-content-faint">
                              {trackLabel(ev.track)}
                            </span>
                            <span
                              className="inline-flex items-center border px-[9px] py-[3px] text-[11px] font-extrabold tracking-[0.02em]"
                              style={{
                                color: c,
                                background: `color-mix(in srgb, ${c} 7%, white)`,
                                borderColor: `color-mix(in srgb, ${c} 35%, white)`,
                              }}
                            >
                              {typeLabel(ev.type)}
                            </span>
                            {isNext && (
                              <span className="inline-flex items-center bg-yonsei-navy px-[9px] py-[3px] text-[11px] font-extrabold tracking-[0.04em] text-white">
                                {ko ? `다음 일정 ${ddayLabel}` : `Next · ${ddayLabel}`}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-[16px] font-bold leading-[1.5] text-content">
                            {pick(ev.title, locale)}
                          </p>
                          {ev.lines.map((line, li) => (
                            <p
                              key={li}
                              className="mt-1 text-[14px] leading-[1.7] text-content-faint"
                            >
                              {pick(line, locale)}
                            </p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
        )}
      </div>

      {/* 표시하지 않은 달 — 연속 구간은 '3~8월'처럼 묶는다. 빈 달이 없으면 문단 자체를 숨긴다 */}
      {emptyMonths.length > 0 && (
        <p className="mt-10 text-[13px] text-content-faint">
          {ko
            ? `일정이 없는 달(${compressMonths(emptyMonths, true)})은 표시하지 않았습니다.`
            : `Months with no events (${compressMonths(emptyMonths, false)}) are hidden.`}
        </p>
      )}
    </section>
  );
}
