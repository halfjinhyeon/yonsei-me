'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// ScrollTrigger 도 무료 public gsap 패키지에 포함(Club 멤버십/토큰 불필요).
gsap.registerPlugin(ScrollTrigger);

/**
 * 홈 상단(히어로·갤러리) 전용 "다크 그라디언트 배경" 레이어 — 성능 개편판.
 *
 * 이전 구현은 레이어 한 장의 그라디언트 색을 스크롤마다 CSS 변수로 보간했는데,
 * 그라디언트 변경은 매 프레임 풀스크린 "리페인트"라 스크롤 트윈(섹션 페이징) 중
 * 프레임이 툭툭 끊기는 주범이었다. 지금은 정거장(BG_SCENES)마다 미리 그려진
 * 고정 레이어를 겹쳐 두고 opacity 만 스크럽한다 — opacity 는 컴포지터(GPU) 합성이라
 * 리페인트가 없다(fullPage 류 사이트가 부드러운 것과 같은 원리).
 *
 * 동작은 이전과 동일:
 *  - `[data-flow]` 섹션 진행에 따라 다음 정거장 레이어가 위로 크로스페이드.
 *  - `[data-flow-end]`(프로그램 섹션)이 올라오면 래퍼 전체가 흰 배경으로 디졸브.
 *  - reduced-motion: 중간 정거장 한 장만 고정 표시(스크럽 없음).
 */

// data-flow 섹션 순서대로 [상단색, 하단색]. 색만 바꾸면 되니 자유롭게 커스터마이즈.
const BG_SCENES: [string, string][] = [
  ['#3f7ad2', '#1d4a92'], // 0 히어로 (밝은 블루)
  ['#3670c4', '#193f80'], // 1 연구 갤러리
  ['#2d61b0', '#143570'], // 2 (여분 — data-flow 섹션이 늘면 자동 사용)
];

export function BgFlow() {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const layers = Array.from(wrap.children) as HTMLElement[];

    // 모션 최소화 선호 → 중간 정거장 한 장만 고정(색 연결 유지, 애니메이션 정지)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const mid = Math.floor(layers.length / 2);
      layers.forEach((l, i) => {
        l.style.opacity = i === mid ? '1' : '0';
      });
      return;
    }

    const sections = gsap.utils.toArray<HTMLElement>('[data-flow]');
    const ctx = gsap.context(() => {
      // 상단 구간: 섹션 i 를 지나는 동안 정거장 i 레이어가 위로 페이드인(크로스페이드).
      // 인덱스는 이전 구현과 동일하게 클램프 — 섹션 수가 정거장 수와 달라도 안전.
      sections.forEach((sec, i) => {
        if (i === 0) return; // 0번 섹션은 초기 레이어 그대로
        const layer = layers[Math.min(i, layers.length - 1)];
        if (!layer) return;
        gsap.fromTo(
          layer,
          { opacity: 0 },
          {
            opacity: 1,
            ease: 'none',
            scrollTrigger: { trigger: sec, start: 'top center', end: 'bottom center', scrub: true },
          },
        );
      });

      // 디졸브: 프로그램 섹션이 올라오면 래퍼 전체를 걷어 흰 배경으로 전환.
      // (opacity 스크럽 — 이것도 컴포지터 합성이라 리페인트 없음)
      const endMarker = document.querySelector<HTMLElement>('[data-flow-end]');
      if (endMarker) {
        gsap.fromTo(
          wrap,
          { autoAlpha: 1 },
          {
            autoAlpha: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: endMarker,
              start: 'top bottom', // 프로그램 섹션 상단이 뷰포트 하단에 닿을 때 시작
              end: 'top center', //   화면 중앙에 오면 완전히 흰색
              scrub: true,
            },
          },
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div ref={wrapRef} aria-hidden="true" className="fixed inset-0 -z-10">
      {BG_SCENES.map(([a, b], i) => (
        <div
          key={i}
          className="absolute inset-0"
          // 각 정거장을 정적 그라디언트로 "미리" 그려 두고 opacity 만 움직인다.
          style={{ background: `linear-gradient(160deg, ${a}, ${b})`, opacity: i === 0 ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
