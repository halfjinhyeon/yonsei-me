'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * 전역 부드러운 스크롤(Lenis) — 레퍼런스(이화여대 140주년) 설정 이식.
 *  - lerp: 0.1 — 매 프레임 목표까지 남은 거리의 10%만 따라가 관성 감속을 만든다.
 *  - smoothWheel: 마우스 휠 입력을 부드럽게 보간, wheelMultiplier 1, 세로 방향.
 *  - easing: 지수 감속 곡선 (t)=>Math.min(1, 1.001 - 2^(-10t)) (Lenis 기본과 동일).
 *
 * GSAP 연동: 이 사이트는 ScrollTrigger 로 섹션 등장을 제어하므로 반드시 동기화해야 한다.
 * Lenis 스크롤마다 ScrollTrigger.update 를 호출하고, Lenis 의 rAF 루프를 GSAP 티커로
 * 구동한다(rAF 중복 방지 + 스무딩된 위치 기준으로 트리거가 정확히 발화). lagSmoothing(0)
 * 으로 프레임 지연 보정을 꺼 Lenis 와 리듬을 맞춘다.
 *
 * 접근성: prefers-reduced-motion 이면 초기화하지 않아 네이티브 스크롤을 그대로 둔다.
 *
 * 레이아웃 호환: Lenis 는 트랜스폼이 아니라 '네이티브 윈도우 스크롤'을 스무딩하므로,
 * 홈의 고정 히어로(position:fixed inset-0)와 sticky(탭 바·STEP 목차 등)가 그대로 동작한다.
 * 전역 인스턴스는 레퍼런스와 동일하게 window.lenis 로 노출한다(디버그/프로그램 스크롤용).
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      orientation: 'vertical',
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    (window as unknown as { lenis?: Lenis }).lenis = lenis;

    lenis.on('scroll', ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.off('scroll', ScrollTrigger.update);
      lenis.destroy();
      delete (window as unknown as { lenis?: Lenis }).lenis;
    };
  }, []);

  return null;
}
