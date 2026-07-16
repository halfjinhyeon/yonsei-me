'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { pick } from '@/lib/content';
import type { EditorialItem } from '@/components/EditorialTab';
import type { Locale } from '@/i18n/routing';

// ScrollTrigger 는 무료 public gsap 패키지에 포함.
gsap.registerPlugin(ScrollTrigger);

// SSR 안전 layout effect — 페인트 전에 from-state 를 잡아 깜빡임 방지.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 에디토리얼 항목 "쇼케이스" 변형 — 홍익대 hicoda '교육방침' 섹션 리버스엔지니어링.
 * 원본: 항목마다 초대형 영문 키워드 h3(data-aos="fade-right") + 설명 p(fade-up)가
 * 세로로 쭉 쌓이는 구성(AOS, ease-in-out-sine). 여기선 GSAP ScrollTrigger 로 재현:
 *  - 영문 키워드: 왼쪽에서 슬라이드인(x:-48 → 0) — 항목이 뷰포트 85% 지점에 닿을 때 1회
 *  - 한글 제목·설명: 아래에서 페이드업(y:24 → 0), 키워드보다 반 박자 늦게
 * 번호(01…)는 골드 아이브로우로 사이트 기존 번호 문법을 유지한다.
 * reduced-motion: 애니메이션 없이 정적 표시.
 */
export function EditorialShowcaseItems({
  items,
  locale,
}: {
  items: EditorialItem[];
  locale: Locale;
}) {
  const rootRef = useRef<HTMLOListElement | null>(null);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // 항목별 개별 트리거 — 스크롤로 하나씩 "크게 크게" 등장(레퍼런스와 동일한 리듬)
      root.querySelectorAll<HTMLElement>('[data-goal]').forEach((item) => {
        const keyword = item.querySelector<HTMLElement>('[data-goal-keyword]');
        const texts = item.querySelectorAll<HTMLElement>('[data-goal-text]');
        const tl = gsap.timeline({
          scrollTrigger: { trigger: item, start: 'top 85%', once: true },
        });
        if (keyword) {
          tl.from(keyword, { x: -48, autoAlpha: 0, duration: 0.7, ease: 'sine.out' });
        }
        if (texts.length) {
          tl.from(
            texts,
            { y: 24, autoAlpha: 0, duration: 0.6, stagger: 0.1, ease: 'sine.out' },
            '-=0.35',
          );
        }
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <ol ref={rootRef} className="mt-16">
      {items.map((item, i) => (
        <li
          key={i}
          data-goal
          className="border-t border-surface-border py-12 first:border-t-2 first:border-t-yonsei-navy sm:py-14"
        >
          {/* 번호 — 검정 아이브로우(금색 배제 — 사용자 지시) */}
          <span
            data-goal-text
            aria-hidden="true"
            className="block text-sm font-bold tracking-[0.25em] text-content"
          >
            {String(i + 1).padStart(2, '0')}
          </span>

          {/* 초대형 영문 키워드 — 레퍼런스의 Fundamental/Flexible/… 위치.
              en 제목이 그 역할(Design & Practice 등). 왼쪽에서 슬라이드인.
              (금색 마침표 삭제 — 금색 배제) */}
          <h4
            data-goal-keyword
            className="mt-3 text-[clamp(2rem,5.5vw,4.25rem)] font-black leading-[1.05] tracking-tight text-yonsei-navy"
          >
            {item.title.en}
          </h4>

          {/* 한글 제목 + 설명 — 페이드업. ko 로케일에선 한글 제목이 부제 역할,
              en 로케일에선 키워드와 중복이므로 생략하고 설명만. */}
          {locale === 'ko' && (
            <p data-goal-text className="mt-4 text-xl font-bold text-content">
              {item.title.ko}
            </p>
          )}
          <p
            data-goal-text
            className="mt-3 max-w-2xl text-base leading-[1.85] text-content-soft sm:text-lg"
          >
            {pick(item.body, locale)}
          </p>
        </li>
      ))}
    </ol>
  );
}
