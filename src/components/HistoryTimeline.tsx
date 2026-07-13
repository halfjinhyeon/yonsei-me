'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryEvent } from '@/lib/content';
import { pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * "스크롤 스파인" 연혁 타임라인.
 * - 스크롤 진행에 따라 중앙 스파인의 골드 진행선이 scaleY로 채워진다.
 * - 각 항목/연대 헤더는 뷰포트 진입 시 개별적으로 리빌된다.
 * - reduced-motion: 즉시 표시, 진행선 없이 기준선만.
 */

// ---- 날짜/연대 포매터 ----
const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "1958-12" → 월 라벨: ko "12월" / en "Dec" (연도는 투톤 대형 표기로 별도 렌더) */
function monthLabel(date: string, locale: Locale): string {
  const month = date.split('-')[1];
  const m = Number(month);
  if (locale === 'en') return EN_MONTHS[m - 1] ?? month;
  return `${m}월`;
}

/** 연대 라벨: ko "1960년대" / en "1960s" */
function decadeLabel(decade: number, locale: Locale): string {
  return locale === 'en' ? `${decade}s` : `${decade}년대`;
}

// ---- 그룹핑 ----
interface DecadeGroup {
  decade: number;
  events: HistoryEvent[];
}

function groupByDecade(events: HistoryEvent[]): DecadeGroup[] {
  const map = new Map<number, HistoryEvent[]>();
  for (const ev of events) {
    const year = Number(ev.date.slice(0, 4));
    const decade = Math.floor(year / 10) * 10;
    const bucket = map.get(decade);
    if (bucket) bucket.push(ev);
    else map.set(decade, [ev]);
  }
  // 최근 연대 → 과거 연대. 연대 안의 항목은 입력 순서(=최근→과거)를 그대로 따른다.
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([decade, evs]) => ({ decade, events: evs }));
}

// ---- 리빌 훅 (Reveal.tsx 패턴을 항목별로 적용) ----
function useReveal<T extends HTMLElement>(reducedMotion: boolean) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reducedMotion]);

  return { ref, visible };
}

export function HistoryTimeline({
  events,
  locale,
}: {
  events: HistoryEvent[];
  locale: Locale;
}) {
  const groups = useMemo(() => groupByDecade(events), [events]);

  // reduced-motion 감지 (마운트 시 1회 + 변경 구독)
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ---- 스파인 진행률 ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const rafPending = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      // 정적 완전 채움 없이 기준선만 → 진행선을 0으로 두고 정지 (기준선 회색만 보임)
      if (fillRef.current) fillRef.current.style.transform = 'scaleY(0)';
      return;
    }

    const update = () => {
      rafPending.current = false;
      const container = containerRef.current;
      const fill = fillRef.current;
      if (!container || !fill) return;
      // read: getBoundingClientRect 1회
      const rect = container.getBoundingClientRect();
      // 뷰포트 중앙보다 약간 아래(60%)를 기준선으로 삼는다.
      const line = window.innerHeight * 0.6;
      const total = rect.height;
      const progress = total > 0 ? (line - rect.top) / total : 0;
      const clamped = Math.max(0, Math.min(1, progress));
      // write: transform만
      fill.style.transform = `scaleY(${clamped})`;
    };

    const onScroll = () => {
      if (rafPending.current) return;
      rafPending.current = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reducedMotion]);

  // 전역 항목 인덱스(좌우 교차 배치용)
  let itemIndex = -1;

  return (
    <div ref={containerRef} className="relative mx-auto max-w-4xl">
      {/* 스파인: 회색 기준선 + 골드 진행선 (모바일 좌측 / 데스크톱 중앙) */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[11px] w-px -translate-x-1/2 bg-surface-border lg:left-1/2"
      >
        <div
          ref={fillRef}
          className="absolute inset-x-0 top-0 h-full origin-top bg-yonsei-blue"
          style={{ transform: 'scaleY(0)' }}
        />
      </div>

      <div className="space-y-20">
        {groups.map((group) => (
          <DecadeSection
            key={group.decade}
            group={group}
            locale={locale}
            reducedMotion={reducedMotion}
            nextIndex={() => (itemIndex += 1)}
          />
        ))}
      </div>
    </div>
  );
}

function DecadeSection({
  group,
  locale,
  reducedMotion,
  nextIndex,
}: {
  group: DecadeGroup;
  locale: Locale;
  reducedMotion: boolean;
  nextIndex: () => number;
}) {
  const header = useReveal<HTMLHeadingElement>(reducedMotion);

  return (
    <section>
      {/* 연대 헤더 — 스파인 위 중앙(데스크톱), 좌측 들여쓰기(모바일) */}
      <h3
        ref={header.ref}
        className={cn(
          // 연대 라벨 — 볼드 유지, 크기는 한 단계 축소(항목 연도 타이포에 주역을 양보)
          'relative mb-10 pl-10 font-display text-2xl font-bold text-yonsei-navy transition-all duration-700 ease-out-expo motion-reduce:transition-none sm:text-3xl lg:pl-0 lg:text-center',
          header.visible ? 'translate-y-0 opacity-100' : 'translate-y-7 opacity-0',
        )}
      >
        {/* bg-surface 로 뒤의 스파인을 가려 선이 글자를 뚫고 지나가지 않게 한다 */}
        <span className="relative z-10 inline-block bg-surface pr-3 lg:px-5">
          {decadeLabel(group.decade, locale)}
          <span className="text-yonsei-gold"></span>
        </span>
      </h3>

      <ol className="space-y-12">
        {group.events.map((ev) => (
          <TimelineItem
            key={ev.date + ev.title.en}
            event={ev}
            locale={locale}
            reducedMotion={reducedMotion}
            index={nextIndex()}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineItem({
  event,
  locale,
  reducedMotion,
  index,
}: {
  event: HistoryEvent;
  locale: Locale;
  reducedMotion: boolean;
  index: number;
}) {
  const { ref, visible } = useReveal<HTMLLIElement>(reducedMotion);
  const isLeft = index % 2 === 0;

  return (
    <li
      ref={ref}
      className={cn(
        'relative pl-10 transition-all duration-700 ease-out-expo motion-reduce:transition-none',
        'lg:grid lg:grid-cols-2 lg:gap-x-12 lg:pl-0',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-7 opacity-0',
      )}
    >
      {/* 마름모 마커 — 스파인 위 (모바일 좌측 11px / 데스크톱 중앙). 커진 연도
          타이포의 첫 줄 시각 중심에 맞춰 살짝 내린다 */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[15px] left-[11px] z-10 h-2 w-2 -translate-x-1/2 rotate-45 border transition-colors duration-500 motion-reduce:transition-none',
          'lg:left-1/2',
          visible
            ? 'border-yonsei-blue bg-yonsei-blue'
            : 'border-surface-border bg-surface',
        )}
      />

      {/* 콘텐츠 셀 — 좌우 교차 배치 */}
      <div
        className={cn(
          isLeft
            ? 'lg:col-start-1 lg:pr-10 lg:text-right'
            : 'lg:col-start-2 lg:pl-10 lg:text-left',
        )}
      >
        {/* 연도 — 홍익대 레퍼런스의 투톤 표기: 세기(19/20)는 옅게, 뒤 두 자리는
            진하게. 월은 작은 보조 표기로 뒤에 붙인다 */}
        <time
          dateTime={event.date}
          className="block text-2xl font-bold leading-none tracking-tight sm:text-3xl"
        >
          <span className="text-content-faint">{event.date.slice(0, 2)}</span>
          <span className="text-yonsei-navy">{event.date.slice(2, 4)}</span>
          <span className="ml-2 align-middle text-sm font-semibold tracking-normal text-content-faint">
            {monthLabel(event.date, locale)}
          </span>
        </time>
        <p className="mt-3 text-lg leading-relaxed text-content">
          {pick(event.title, locale)}
        </p>
      </div>
    </li>
  );
}
