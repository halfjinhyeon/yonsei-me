'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import styles from './HeroSlideshow.module.css';

// SplitText·CustomEase 는 이제 무료 public gsap 패키지에 포함(Club 토큰 불필요).
gsap.registerPlugin(SplitText, CustomEase);
// crisp 슬라이드쇼의 wipe 이징 그대로 이식.
CustomEase.create('hero-wipe', '0.625, 0.05, 0, 1');

// SSR 안전 layout effect — 클라이언트에선 페인트 전에 초기 상태를 잡아 깜빡임을 막고,
// 서버 렌더 시 useLayoutEffect 경고를 피한다.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type HeroSlide = {
  /** 연구 분야 키(research-gallery.json 과 동일) */
  field: string;
  /** 로케일 해석이 끝난 분야 라벨 */
  label: string;
  /** /img/hero/*.jpg 원본 경로(next/image 가 최적화 서빙) */
  image: string;
};

type Props = {
  slides: HeroSlide[];
  /** 히어로 중앙 제목(예: "연세대학교 기계공학부") */
  title: string;
  /** 분야 목록 nav 의 aria-label */
  navLabel: string;
};

/**
 * 홈 히어로 — Osmo 2종 조합 포팅.
 *
 * 등장(crisp-loading): 작은 이미지들이 가로로 질주 → 중앙 이미지가 풀스크린으로 확대되며
 * 첫 슬라이드 배경이 됨 → 제목 SplitText 리빌 → 우측 하단 분야 목록 stagger 등장.
 * 슬라이드 전환(crisp-slideshow): CustomEase wipe + 패럴랙스. 트리거는 분야 텍스트 목록 클릭.
 * 분야 목록(gallery-to-overlay): :has() 호버로 호버 항목만 선명, 나머지 흐림(순수 CSS).
 *
 * 불변 조건: 부모 #sec-hero(fixed inset-0 -z-10, 그라디언트 배경)는 이미지 로드 전 폴백.
 * reduced-motion / no-JS: 애니메이션 없이 최종 상태(첫 슬라이드·제목·목록) 정적 노출.
 */
export function HeroSlideshow({ slides, title, navLabel }: Props) {
  const heroRef = useRef<HTMLElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const parallaxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const navRef = useRef<HTMLUListElement | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loaderRowRef = useRef<HTMLDivElement | null>(null);
  const scaleTileRef = useRef<HTMLDivElement | null>(null);

  // 현재 슬라이드 인덱스 — nav 의 aria-current/골드 강조에만 쓰인다.
  // 슬라이드 .current 클래스(가시성)는 GSAP 와의 충돌을 피해 명령형으로만 토글한다.
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const animatingRef = useRef(false);
  const [entering, setEntering] = useState(false); // 등장 로더 오버레이 마운트 여부

  // --- 마운트: 첫 슬라이드를 current 로. 모션 허용 시 로더 등장 시퀀스 예약 ---
  useIsoLayoutEffect(() => {
    const first = slideRefs.current[0];
    first?.classList.add(styles.current);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 로더 오버레이 마운트 → 이어지는 effect(B)가 타임라인을 구성한다.
    animatingRef.current = true; // 등장 중 슬라이드 클릭 차단
    setEntering(true);
  }, []);

  // --- 등장 타임라인(entering 이 true 가 된 뒤 loader DOM 이 존재) ---
  useIsoLayoutEffect(() => {
    if (!entering) return;
    let cancelled = false;
    let tl: gsap.core.Timeline | null = null;
    let split: SplitText | null = null;

    const fontsReady =
      typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();

    fontsReady.then(() => {
      if (cancelled) return;
      const titleEl = titleRef.current;
      const loaderEl = loaderRef.current;
      const row = loaderRowRef.current;
      const scaleTile = scaleTileRef.current;
      if (!titleEl || !loaderEl || !row || !scaleTile) return;

      const tiles = gsap.utils.toArray<HTMLElement>(row.children);
      const navInners = navRef.current
        ? gsap.utils.toArray<HTMLElement>(navRef.current.querySelectorAll('[data-nav-inner]'))
        : [];

      // 제목 분해 — 단어 단위 마스크 리빌(crisp 제목과 동일 방식)
      split = SplitText.create(titleEl, { type: 'words', mask: 'words', aria: 'none' });
      split.words.forEach((w) => (w as HTMLElement).classList.add('split-word'));

      // 초기(리빌 전) 상태 — 로더가 화면을 덮는 동안 뒤에서 대기
      gsap.set(split.words, { yPercent: 110 });
      gsap.set(navInners, { yPercent: 150, autoAlpha: 0 });
      gsap.set(tiles, { xPercent: 500 });
      gsap.set(scaleTile, { width: '10em', height: '10em' });

      tl = gsap.timeline({
        defaults: { ease: 'expo.inOut' },
        onComplete: () => {
          animatingRef.current = false;
          setEntering(false); // 로더 언마운트
        },
      });

      // 1) 작은 이미지 가로 질주
      tl.to(tiles, { xPercent: -500, duration: 2.5, stagger: 0.05 });
      // 2) 주변 타일 축소(가장자리부터)
      tl.to(
        tiles,
        { scale: 0.5, duration: 2, stagger: { each: 0.05, from: 'edges', ease: 'none' } },
        '-=0.1',
      );
      // 3) 중앙 타일 → 풀스크린(확대 후 slide0 배경과 동일 이미지라 매끄럽게 인계)
      tl.to(scaleTile, { width: '100vw', height: '100dvh', duration: 2 }, '<0.5');
      // 4) 로더 페이드아웃 → 아래의 slide0 노출
      tl.to(loaderEl, { autoAlpha: 0, duration: 0.4, ease: 'power1.inOut' }, '-=0.2');
      // 5) 제목 리빌(마스크 아래에서 솟아오름)
      tl.to(split.words, { yPercent: 0, duration: 1, stagger: 0.075, ease: 'expo.out' }, '-=0.15');
      // 6) 분야 목록 stagger 등장
      tl.to(navInners, { yPercent: 0, autoAlpha: 1, duration: 1, stagger: 0.05, ease: 'expo.out' }, '<0.1');
    });

    return () => {
      cancelled = true;
      tl?.kill();
      split?.revert();
    };
  }, [entering]);

  // --- 언마운트 정리: 진행 중 트윈 kill(전역) ---
  useEffect(() => {
    const hero = heroRef.current;
    return () => {
      if (hero) gsap.killTweensOf(hero.querySelectorAll('*'));
    };
  }, []);

  // --- 슬라이드 전환(wipe + 패럴랙스), crisp navigate() 이식 ---
  function goTo(target: number) {
    const prev = currentRef.current;
    if (animatingRef.current || target === prev) return;
    const direction = target > prev ? 1 : -1;

    const outSlide = slideRefs.current[prev];
    const outInner = parallaxRefs.current[prev];
    const inSlide = slideRefs.current[target];
    const inInner = parallaxRefs.current[target];
    if (!outSlide || !outInner || !inSlide || !inInner) return;

    animatingRef.current = true;
    gsap
      .timeline({
        defaults: { duration: 1.5, ease: 'hero-wipe' },
        onStart: () => {
          inSlide.classList.add(styles.current);
          currentRef.current = target;
          setCurrent(target);
        },
        onComplete: () => {
          outSlide.classList.remove(styles.current);
          animatingRef.current = false;
        },
      })
      .to(outSlide, { xPercent: -direction * 100 }, 0)
      .to(outInner, { xPercent: direction * 75 }, 0)
      .fromTo(inSlide, { xPercent: direction * 100 }, { xPercent: 0 }, 0)
      .fromTo(inInner, { xPercent: -direction * 75 }, { xPercent: 0 }, 0);
  }

  return (
    <section ref={heroRef} className={styles.hero} aria-roledescription="carousel">
      {/* 슬라이드 스택 — 트랜스폼은 래퍼 div 에만, next/image 엔 걸지 않는다 */}
      <div className={styles.slides}>
        {slides.map((s, i) => (
          <div
            key={s.field}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            className={styles.slide}
            role="group"
            aria-roledescription="slide"
            aria-label={s.label}
            aria-hidden={current !== i}
          >
            <div
              ref={(el) => {
                parallaxRefs.current[i] = el;
              }}
              className={styles.parallax}
            >
              <Image
                src={s.image}
                alt=""
                fill
                sizes="100vw"
                priority={i === 0}
                className={styles.image}
                draggable={false}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 가독성 스크림(그림자 금지 → 균일 다크 + 하단 그라디언트) */}
      <div className={styles.scrim} aria-hidden="true" />

      {/* 중앙 제목 */}
      <div className={styles.center}>
        <h1 ref={titleRef} className={styles.title}>
          {title}
        </h1>
      </div>

      {/* 우측 하단 분야 목록 — 항상 노출(모바일 포함, 크기만 축소) */}
      <nav className={styles.nav} aria-label={navLabel}>
        <ul ref={navRef} className={styles.list}>
          {slides.map((s, i) => (
            <li key={s.field} className={`${styles.item}${current === i ? ` ${styles.current}` : ''}`}>
              <div data-nav-inner>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => goTo(i)}
                  aria-current={current === i ? 'true' : undefined}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <span>{s.label}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </nav>

      {/* 등장 로더(crisp-loading) — 모션 허용 시에만 마운트, 완료 후 언마운트 */}
      {entering && (
        <div ref={loaderRef} className={styles.loader} aria-hidden="true">
          <div ref={loaderRowRef} className={styles.loaderRow}>
            {slides.map((s) => (
              <div key={s.field} className={styles.tile}>
                <Image src={s.image} alt="" fill sizes="160px" className={styles.tileImg} draggable={false} />
              </div>
            ))}
          </div>
          {/* 중앙 확대 타일 = slide0 이미지(sizes 100vw·priority → slide0 배경과 캐시 공유) */}
          <div ref={scaleTileRef} className={styles.scaleTile}>
            <Image
              src={slides[0].image}
              alt=""
              fill
              sizes="100vw"
              priority
              className={styles.tileImg}
              draggable={false}
            />
          </div>
        </div>
      )}
    </section>
  );
}
