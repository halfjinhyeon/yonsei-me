'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MeshCanvas } from './MeshCanvas';
import { cn } from '@/lib/utils';

const SLIDE_KEYS = ['0', '1', '2', '3'] as const;
const INTERVAL = 4200;

/**
 * 풀뷰포트 애니메이션 히어로.
 * - 네이비 애니메이션 그라디언트 + 캔버스 웨이브 배경
 * - 로테이팅 헤드라인 슬라이드 (슬라이드-인)
 * - 일시정지 버튼 + prefers-reduced-motion 존중
 */
export function AnimatedHero() {
  const t = useTranslations('home.animHero');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceRef = useRef(false);

  useEffect(() => {
    reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceRef.current) setPaused(true);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setActive((v) => (v + 1) % SLIDE_KEYS.length);
    }, INTERVAL);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <section
      className="anim-gradient relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden text-white"
      aria-roledescription="carousel"
      aria-label={t('region')}
    >
      {/* 캔버스 웨이브 배경 */}
      <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full [mask-image:linear-gradient(to_top,transparent,black_22%)]" />

      <div className="mx-auto flex w-full max-w-[1360px] items-center px-6 sm:px-10 lg:px-16">
        <div className="relative w-full">
          {SLIDE_KEYS.map((key, i) => {
            const isActive = i === active;
            return (
              <div
                key={key}
                aria-hidden={!isActive}
                className={cn(
                  'transition-opacity duration-700',
                  isActive
                    ? 'relative opacity-100'
                    : 'pointer-events-none absolute inset-0 opacity-0',
                )}
              >
                <h1
                  className={cn(
                    'text-[clamp(3rem,8vw,7rem)] font-black leading-[1.02] tracking-tight text-white/20',
                    isActive && !reduceRef.current && 'slide-enter',
                  )}
                >
                  <span className="block">{t(`slides.${key}.lead`)}</span>
                  <span className="block">{t(`slides.${key}.lead2`)}</span>
                </h1>
                <p
                  className={cn(
                    'mt-6 text-[clamp(1.6rem,4.5vw,3.5rem)] font-black leading-[1.06] tracking-tight text-white/85',
                    isActive && !reduceRef.current && 'slide-enter',
                  )}
                  style={isActive && !reduceRef.current ? { animationDelay: '0.15s' } : undefined}
                >
                  <span className="block font-display italic font-normal text-yonsei-gold">
                    {t(`slides.${key}.sub1`)}
                  </span>
                  <span className="block">{t(`slides.${key}.sub2`)}</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="absolute inset-x-0 bottom-6 z-10 mx-auto flex max-w-[1360px] items-center justify-between px-6 sm:px-10 lg:px-16">
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-black/30 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-black/50"
        >
          {paused ? '▶' : '⏸'} {paused ? t('play') : t('pause')}
        </button>

        {/* 슬라이드 인디케이터 */}
        <div className="flex items-center gap-2">
          {SLIDE_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${i + 1}`}
              aria-current={i === active}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === active ? 'w-6 bg-yonsei-gold' : 'w-2.5 bg-white/40 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
