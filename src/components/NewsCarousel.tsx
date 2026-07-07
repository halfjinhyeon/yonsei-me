'use client';

// LabCarousel의 흐름 메커니즘을 뉴스 카드에 이식.
// - 네이티브 overflow-x-auto 트랙 → 터치/트랙패드 제스처 무료 지원
// - requestAnimationFrame 으로 scrollLeft 를 줄여 카드가 왼→오로 흐른다
// - 확장 세트를 2회 렌더하고 경계에서 절반만큼 점프시켜 무한 루프
// - 호버·드래그·키보드 포커스·백그라운드 탭·사용자 밀기·토글 버튼·prefers-reduced-motion 에서 일시정지

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MeshCanvas } from './MeshCanvas';
import { pick, type NewsItem } from '@/lib/content';
import { formatDate, cn } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

/** 자동 흐름 속도(px/frame). 값이 클수록 빠르게 오른쪽으로 흐른다. */
const FLOW_SPEED = 0.5;
/** 사용자가 손으로 민 뒤 자동 흐름을 재개하기까지의 대기(ms). */
const RESUME_DELAY = 1600;

export function NewsCarousel({ items, locale }: { items: NewsItem[]; locale: Locale }) {
  const t = useTranslations('home.newsPreview');
  const tNews = useTranslations('news');
  // pause/play 라벨은 home.newsPreview 에 없어 home.people 의 카드 흐름 라벨을 재사용.
  const tPeople = useTranslations('home.people');
  const trackRef = useRef<HTMLDivElement | null>(null);

  // 흐름 정지 사유들. 하나라도 true 면 자동 흐름을 멈춘다.
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const hiddenRef = useRef(false);
  const draggingRef = useRef(false);
  const reduceRef = useRef(false);
  // 사용자가 손으로 민 직후 잠깐 멈추는 타이머.
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedByUserRef = useRef(false);

  // 토글 버튼 상태(사용자가 명시적으로 멈춘 경우).
  const [manualPaused, setManualPaused] = useState(false);
  const manualPausedRef = useRef(false);
  manualPausedRef.current = manualPaused;

  // 뉴스가 몇 건 안 되면 세트 2회 렌더로는 트랙이 뷰포트보다 좁아 무한 루프가 깨진다.
  // 원본 세트를 반복해 최소 8장짜리 "확장 세트"를 만들고, 그 확장 세트를 2회 렌더한다.
  const repeat = Math.max(1, Math.ceil(8 / Math.max(1, items.length)));
  const expanded: { item: NewsItem; original: boolean }[] = [];
  for (let r = 0; r < repeat; r++) {
    for (const item of items) {
      // 원본 첫 세트만 접근성 트리에 노출, 나머지 반복분은 전부 aria-hidden.
      expanded.push({ item, original: r === 0 });
    }
  }

  // 경계에서 scrollLeft 를 절반만큼 되돌려 무한 루프를 만든다.
  const wrap = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    if (el.scrollLeft <= 0) {
      el.scrollLeft += half;
    } else if (el.scrollLeft >= half) {
      el.scrollLeft -= half;
    }
  }, []);

  // 자동 흐름 루프.
  useEffect(() => {
    reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = trackRef.current;
    if (!el) return;

    // 초기 위치를 절반 지점으로 두어 양방향 여유를 확보.
    el.scrollLeft = el.scrollWidth / 4;

    if (reduceRef.current) return; // 자동 흐름 없이 수동 스크롤만.

    let raf = 0;
    const step = () => {
      const node = trackRef.current;
      if (node) {
        const blocked =
          hoverRef.current ||
          focusRef.current ||
          hiddenRef.current ||
          draggingRef.current ||
          pausedByUserRef.current ||
          manualPausedRef.current;
        if (!blocked) {
          node.scrollLeft -= FLOW_SPEED; // 감소 = 콘텐츠가 오른쪽으로 흐름.
          wrap();
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [wrap]);

  // 백그라운드 탭 감지.
  useEffect(() => {
    const onVis = () => {
      hiddenRef.current = document.visibilityState === 'hidden';
    };
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 사용자가 손으로 민 뒤 잠깐 멈췄다가 재개.
  const nudgeResume = useCallback(() => {
    pausedByUserRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedByUserRef.current = false;
    }, RESUME_DELAY);
  }, []);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  return (
    // 위 연구실 섹션과 같은 네이비 배경으로 이어지므로 상단 패딩은 얕게.
    <section className="full-bleed relative isolate overflow-hidden bg-yonsei-navy pb-section-sm pt-4 text-white">
      <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-60" />

      {/* 헤더만 컨테이너 폭 제한, 트랙은 아래에서 풀폭으로 흐른다. */}
      <div className="mx-auto max-w-[1360px] px-6 sm:px-10 lg:px-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-headline font-bold">{t('title')}</h2>
          <Link href="/news#news" className="text-sm font-semibold text-yonsei-gold hover:underline">
            {t('viewAll')} →
          </Link>
        </div>
      </div>

      <div
        role="group"
        aria-label={t('title')}
        onPointerEnter={() => {
          hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
          draggingRef.current = false;
        }}
        onPointerDown={() => {
          draggingRef.current = true;
        }}
        onPointerUp={() => {
          draggingRef.current = false;
          nudgeResume();
        }}
        onFocusCapture={() => {
          focusRef.current = true;
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            focusRef.current = false;
          }
        }}
      >
        {/* 트랙에 좌우 패딩을 주면 scrollWidth/2 점프 오프셋이 콘텐츠 주기(세트폭)와
            어긋나 루프 경계마다 카드가 튀어 보인다 — LabCarousel처럼 패딩 없이 풀블리드. */}
        <div
          ref={trackRef}
          className="no-scrollbar flex gap-5 overflow-x-auto overscroll-x-contain pb-2"
          onWheel={nudgeResume}
          onScroll={wrap}
        >
          {/* 확장 세트를 2회 렌더. 두 번째 세트(클론)는 접근성 트리에서 제외. */}
          {[false, true].map((isClone) =>
            expanded.map(({ item, original }, i) => (
              <NewsCardView
                key={`${isClone ? 'clone' : 'orig'}-${i}`}
                item={item}
                locale={locale}
                categoryLabel={tNews(`categories.${item.category}`)}
                // 원본 첫 세트만 접근성 트리에 노출.
                ariaHidden={isClone || !original}
              />
            )),
          )}
        </div>

        <div className="mx-auto mt-6 max-w-[1360px] px-6 sm:px-10 lg:px-16">
          <button
            type="button"
            onClick={() => setManualPaused((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-black/30 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-black/50"
          >
            {manualPaused ? '▶' : '⏸'} {manualPaused ? tPeople('play') : tPeople('pause')}
          </button>
        </div>
      </div>
    </section>
  );
}

function NewsCardView({
  item,
  locale,
  categoryLabel,
  ariaHidden,
}: {
  item: NewsItem;
  locale: Locale;
  categoryLabel: string;
  ariaHidden: boolean;
}) {
  return (
    <Link
      href={`/news/${item.slug}`}
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : undefined}
      className={cn(
        'group relative block aspect-[7/8] w-[270px] shrink-0 overflow-hidden rounded-xl border border-white/10 sm:w-[290px]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-gold',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${item.image})` }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-yonsei-navy via-yonsei-navy/60 to-yonsei-navy/10"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-5">
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-yonsei-gold">
          {categoryLabel}
        </span>
        <span className="line-clamp-3 text-base font-bold leading-snug text-white">
          {pick(item.title, locale)}
        </span>
        <time dateTime={item.date} className="text-xs text-white/70">
          {formatDate(item.date, locale)}
        </time>
      </span>
    </Link>
  );
}
