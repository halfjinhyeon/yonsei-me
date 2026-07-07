'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LabDirectoryEntry } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/** 연구실별 이미지가 없을 때 순환 사용하는 더미 배경 3장. */
const FALLBACK_IMAGES = [
  '/img/research/energy-conversion.jpg',
  '/img/research/intelligent-robotics.jpg',
  '/img/research/precision-manufacturing.jpg',
];

/** 자동 흐름 속도(px/frame). 값이 클수록 빠르게 오른쪽으로 흐른다. */
const FLOW_SPEED = 0.5;
/** 사용자가 손으로 민 뒤 자동 흐름을 재개하기까지의 대기(ms). */
const RESUME_DELAY = 1600;

interface LabCardData extends LabDirectoryEntry {
  image: string;
}

/**
 * 연구실 카드 가로 캐러셀.
 * - 네이티브 overflow-x-auto 스크롤 컨테이너 → 터치/트랙패드 제스처가 자동으로 동작.
 * - requestAnimationFrame 으로 scrollLeft 를 조금씩 줄여 카드가 왼→오(오른쪽 방향)로 흐른다.
 * - 리스트를 2회 렌더하고 경계에서 scrollLeft 를 절반만큼 점프시켜 무한 루프.
 * - 호버·드래그·키보드 포커스·백그라운드 탭·prefers-reduced-motion 에서 일시정지.
 */
export function LabCarousel({
  labs,
  locale,
}: {
  labs: LabDirectoryEntry[];
  locale: Locale;
}) {
  const t = useTranslations('home.people');
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

  const cards: LabCardData[] = labs.map((lab, i) => ({
    ...lab,
    image: lab.image ?? FALLBACK_IMAGES[i % FALLBACK_IMAGES.length],
  }));

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
    <div
      role="group"
      aria-label={t('region')}
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
      <div
        ref={trackRef}
        className="no-scrollbar flex gap-5 overflow-x-auto overscroll-x-contain pb-2"
        onWheel={nudgeResume}
        onScroll={wrap}
      >
        {/* 리스트를 2회 렌더. 두 번째 세트는 접근성 트리에서 제외. */}
        {[false, true].map((isClone) =>
          cards.map((card, i) => (
            <LabCardView
              key={`${isClone ? 'clone' : 'orig'}-${i}`}
              card={card}
              locale={locale}
              professorLabel={t('professorLabel')}
              externalLabel={t('externalLabel')}
              ariaHidden={isClone}
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
          {manualPaused ? '▶' : '⏸'} {manualPaused ? t('play') : t('pause')}
        </button>
      </div>
    </div>
  );
}

function LabCardView({
  card,
  locale,
  professorLabel,
  externalLabel,
  ariaHidden,
}: {
  card: LabCardData;
  locale: Locale;
  professorLabel: string;
  externalLabel: string;
  ariaHidden: boolean;
}) {
  const name = locale === 'ko' ? card.nameKo : card.nameEn || card.nameKo;
  const professor = locale === 'ko' ? card.professorKo : card.professorEn;
  const hasLink = card.url.trim().length > 0;

  const inner = (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${card.image})` }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-yonsei-navy via-yonsei-navy/60 to-yonsei-navy/10"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5">
        <span className="line-clamp-2 text-base font-bold leading-snug text-white">{name}</span>
        <span className="text-xs font-medium text-white/85">
          {professorLabel}: {professor}
        </span>
        <span className="text-xs text-white/70">{card.location}</span>
        {hasLink && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-yonsei-gold opacity-0 transition-opacity group-hover:opacity-100">
            {externalLabel} ↗
          </span>
        )}
      </span>
    </>
  );

  const shellClass =
    'group relative block aspect-[7/8] w-[270px] shrink-0 overflow-hidden rounded-xl border border-white/10 sm:w-[290px]';

  if (hasLink) {
    return (
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-hidden={ariaHidden || undefined}
        tabIndex={ariaHidden ? -1 : undefined}
        className={cn(shellClass, 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-gold')}
      >
        {inner}
      </a>
    );
  }

  return (
    <div aria-hidden={ariaHidden || undefined} className={cn(shellClass, 'cursor-default')}>
      {inner}
    </div>
  );
}
