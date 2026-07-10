'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Link } from '@/i18n/navigation';

// ScrollTrigger·SplitText 모두 무료 public gsap 패키지에 포함.
gsap.registerPlugin(ScrollTrigger, SplitText);

// SSR 안전 layout effect — 페인트 전에 from-state 를 잡아 깜빡임 방지.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 컬러 스테이트먼트 — "스크롤 워드필".
 *
 * 문장이 14% 실루엣으로 깔려 있다가, 스크롤 진행에 맞춰(ScrollTrigger scrub)
 * 단어가 하나씩 차오르며 완성된다("움직이는" 모티프의 체화). 독수리 마스코트는
 * 우측에서 느린 패럴랙스로 떠오른다.
 *
 * UX 가드레일:
 * - 핀 없음(스크롤 재킹 금지), 텍스트는 세로 미세 상승만(가로 이동 금지 → 가독성).
 * - 시작 상태도 실루엣이 보여 섹션이 비어 보이지 않고, 뷰포트 중앙 도달 전 완성.
 * - reduced-motion / no-JS: 정적 완전 표시.
 * - 핵심어는 골드 "밑줄"로 강조 — 골드 글자는 이 배경 대비가 부족해 밑줄이 안전.
 */
export function StatementReveal() {
  const t = useTranslations('home');
  const rootRef = useRef<HTMLElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const eagleRef = useRef<HTMLDivElement | null>(null);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    const text = textRef.current;
    if (!root || !text) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // aria:'auto' → 분해 스팬은 aria-hidden, p 에 원문 aria-label(접근성 유지)
      const split = SplitText.create(text, { type: 'words', aria: 'auto' });
      gsap.fromTo(
        split.words,
        { opacity: 0.14, yPercent: 24 },
        {
          opacity: 1,
          yPercent: 0,
          ease: 'none',
          stagger: 0.08,
          scrollTrigger: {
            trigger: root,
            start: 'top 80%', // 섹션 상단이 뷰포트 80% 지점에 오면 시작
            end: 'top 35%', //   중앙 도달 전(35%)에 문장 완성
            scrub: 0.4,
          },
        },
      );

      // 독수리 패럴랙스 — 섹션 통과 동안 위로 천천히 드리프트.
      // ±8%(자기 높이 기준) = 섹션의 ~6.7% → 상하 8% 여백 안에 머물러 잘리지 않는다.
      if (eagleRef.current) {
        gsap.fromTo(
          eagleRef.current,
          { yPercent: 8 },
          {
            yPercent: -8,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        );
      }
    }, root);

    return () => ctx.revert();
  }, []);

  // 핵심어 강조 — 흰 글자 + 골드 밑줄 (배경 무관 AA 유지)
  const em = (chunks: React.ReactNode) => (
    <span className="underline decoration-yonsei-gold decoration-[0.045em] underline-offset-[0.14em]">
      {chunks}
    </span>
  );

  return (
    <section
      ref={rootRef}
      data-flow
      className="relative isolate overflow-hidden px-6 pb-20 pt-10 text-white sm:px-10 lg:px-16 lg:pb-28 lg:pt-14"
    >
      {/* 독수리 마스코트 — 우측 클린 배치 + 패럴랙스.
          높이를 섹션에 맞추고(상하 8% 여백) 패럴랙스 이동을 그 여백 안으로 제한해
          overflow-hidden 에도 어떤 화면비에서든 잘리지 않는다. */}
      <div
        ref={eagleRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-[8%] right-[-14%] -z-10 w-[60%] bg-contain bg-center bg-no-repeat opacity-[0.16] sm:right-0 sm:w-[42%] lg:right-[2%] lg:w-[36%] lg:opacity-25"
        style={{ backgroundImage: 'url(/img/eagle.png)' }}
      />

      <div className="mx-auto max-w-5xl">
        <p
          ref={textRef}
          className="max-w-4xl text-[clamp(2rem,5.5vw,4.75rem)] font-black leading-[1.16] tracking-tighter"
        >
          {t.rich('weAre.statement', {
            c1: em,
            c2: em,
            br: () => <br />,
          })}
        </p>
        <Link
          href="/about"
          className="mt-10 inline-flex items-center gap-2 border-b-2 border-white/70 pb-1 text-base font-semibold text-white transition-opacity hover:opacity-70"
        >
          {t('weAre.link')}
        </Link>
      </div>
    </section>
  );
}
