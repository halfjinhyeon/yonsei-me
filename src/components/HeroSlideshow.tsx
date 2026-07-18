'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
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

// 자동 전환 간격(ms) — 사용자가 '슬라이드쇼'임을 인지하도록 천천히 순환한다.
const AUTO_ADVANCE_MS = 5000;

// 타이틀 아래 회전 카피 교체 간격(ms)
const TAGLINE_MS = 4000;

// 등장 애니메이션 1회 재생 플래그(sessionStorage) — 같은 탭 방문 중에는 홈 재진입·
// 새로고침 시 등장을 건너뛰고 완성 상태를 즉시 보여준다. 탭을 닫고 새 방문이면 다시 재생.
const INTRO_SEEN_KEY = 'ym-hero-intro-v1';

// 로더 정착 열에서 화면 중앙에 멈추는 타일 위치(0-based). 원본(5장)의 '3번째=정중앙'을
// 6장에 이식한 값 — 열을 시작 슬라이드가 index 2 에 오도록 회전 배치하고, 짝수 열이라
// 정중앙이 없는 만큼 열 전체를 반 피치 밀어 시작 슬라이드를 화면 중앙에 세운다.
const CENTER_IDX = 2;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export type HeroSlide = {
  /** 연구 분야 키(research-gallery.json 과 동일) */
  field: string;
  /** 로케일 해석이 끝난 분야 라벨 */
  label: string;
  /** /img/hero/*.jpg 원본 경로(next/image 가 최적화 서빙) */
  image: string;
  /** '연구 분야 바로가기' 화살표 링크의 접근성 라벨(로케일 해석 완료) — 없으면 링크 미표시 */
  linkLabel?: string;
};

type Props = {
  slides: HeroSlide[];
  /** 히어로 제목(예: "연세대학교 기계공학부") */
  title: string;
  /** 분야 목록 nav 의 aria-label */
  navLabel: string;
  /** 제목 아래에서 주기 교체되는 카피(로케일 해석 완료) */
  taglines: string[];
};

/**
 * 홈 히어로 — Osmo 2종 조합 포팅.
 *
 * 등장(crisp-loading, 원본 구조 그대로):
 *   body 로 portal 된 풀스크린 로더(헤더까지 덮음) 안에서 2열 기차(dup 6 + main 6)가
 *   가로로 스윕 → main 열이 중앙 창(72em, 좌우 마스크 페이드)에 '정착' → 잠시 멈춤 →
 *   정착 열의 중앙 타일(=시작 슬라이드)이 그 자리에서 풀스크린으로 확대되고 이웃들은
 *   축소되며 밀려남 → 로더 페이드 → 뒤의 히어로 시작 슬라이드(동일 이미지)로 매끄럽게
 *   인계 → 제목 SplitText 리빌 → 분야 목록 stagger 등장.
 *   시작 슬라이드는 마운트 시 랜덤 추첨(startIdx), 로더 열은 시작 슬라이드가 중앙에
 *   오도록 회전 배치: 중앙에 멈추는 마지막 사진 = 첫 화면, 오른쪽에 남는 사진 =
 *   다음 슬라이드들(원본과 동일한 규칙).
 *
 * 슬라이드 전환(crisp-slideshow): CustomEase wipe + 패럴랙스(슬라이드 래퍼 overflow:hidden
 * 클리핑으로 왼쪽 끝부터 닦아내듯 리빌). 5초 자동 전환 + 분야 텍스트 클릭 이동
 * (호버/포커스 시 자동 전환 일시정지).
 * 분야 목록(gallery-to-overlay): :has() 호버로 호버 항목만 선명, 나머지 흐림(순수 CSS).
 *
 * 불변 조건: 부모 #sec-hero(fixed inset-0 -z-10, 그라디언트 배경)는 이미지 로드 전 폴백.
 * 등장은 세션당 1회(sessionStorage INTRO_SEEN_KEY) — 재방문·새로고침 시 건너뛰고
 * 완성 상태 즉시 노출(자동 전환은 바로 시작). reduced-motion / no-JS: 애니메이션 없이
 * 최종 상태(첫 슬라이드·제목·목록) 정적 노출.
 */
export function HeroSlideshow({ slides, title, navLabel, taglines }: Props) {
  const heroRef = useRef<HTMLElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const parallaxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const taglineRef = useRef<HTMLParagraphElement | null>(null);
  const navRef = useRef<HTMLUListElement | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const groupsRef = useRef<HTMLDivElement | null>(null);
  const scaleMediaRef = useRef<HTMLDivElement | null>(null);

  // 현재 슬라이드 인덱스 — nav 의 aria-current/블루 강조에만 쓰인다.
  // 슬라이드 .current 클래스(가시성)는 GSAP 와의 충돌을 피해 명령형으로만 토글한다.
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const animatingRef = useRef(false);
  const pausedRef = useRef(false); // nav 호버/포커스 시 자동 전환 일시정지
  const [entering, setEntering] = useState(false); // 등장 로더 오버레이 마운트 여부
  // 회전 카피 인덱스 — 4초마다 교체(등장 완료 후 시작, reduced-motion 시 고정)
  const [tagIdx, setTagIdx] = useState(0);
  // 시작 슬라이드 — 마운트 시 클라이언트에서 추첨(방문마다 다른 연구 분야로 시작).
  // SSR/첫 렌더는 0 으로 일치시키고 페인트 전 layout effect 에서 갱신 → 깜빡임·
  // hydration 불일치 없음. 6장 모두 어차피 로드되므로 추가 네트워크 비용도 없다.
  const [startIdx, setStartIdx] = useState(0);

  // 로더 열 순서 — 시작 슬라이드가 CENTER_IDX 에 오도록 회전(원본의 [4,5,1,2,3] 규칙:
  // 중앙에 마지막으로 멈추는 사진 = 첫 슬라이드, 오른쪽에 남는 사진 = 다음 슬라이드들).
  const loaderRow = slides.map(
    (_, i) => slides[(i - CENTER_IDX + startIdx + slides.length * 2) % slides.length],
  );

  // --- 슬라이드 전환(wipe + 패럴랙스), crisp navigate() 이식 ---
  const goTo = useCallback((target: number) => {
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
          // 들어오는 슬라이드를 최상단으로 → 전환 끝에서 나가는 슬라이드의 패럴랙스
          // 잔상이 opacity:0 로 툭 사라져 보이던 '끊김'을 항상 덮어 가린다.
          outSlide.style.zIndex = '1';
          inSlide.style.zIndex = '2';
          currentRef.current = target;
          setCurrent(target);
        },
        onComplete: () => {
          outSlide.classList.remove(styles.current);
          outSlide.style.zIndex = '';
          animatingRef.current = false;
        },
      })
      .to(outSlide, { xPercent: -direction * 100 }, 0)
      .to(outInner, { xPercent: direction * 75 }, 0)
      .fromTo(inSlide, { xPercent: direction * 100 }, { xPercent: 0 }, 0)
      .fromTo(inInner, { xPercent: -direction * 75 }, { xPercent: 0 }, 0);
  }, []);

  // --- 마운트: 시작 슬라이드 추첨 후 current 로. 모션 허용 + 미시청 시에만 등장 예약 ---
  useIsoLayoutEffect(() => {
    const k = Math.floor(Math.random() * slides.length);
    slideRefs.current[k]?.classList.add(styles.current);
    currentRef.current = k;
    setCurrent(k);
    setStartIdx(k);

    if (prefersReducedMotion()) return;

    // 세션 중 1회만 재생 — 재방문·새로고침이면 건너뛰고 완성 상태 즉시 노출.
    // (sessionStorage 접근은 사파리 프라이빗 모드 등에서 throw 할 수 있어 try 로 감싼다.
    //  실패 시 seen=false 로 두어 항상 재생하는 쪽으로 안전하게 후퇴.)
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
      if (!seen) window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      /* storage 불가 환경 — 매 방문 재생 */
    }
    if (seen) return;

    // 로더 오버레이 마운트 → 이어지는 effect(B)가 타임라인을 구성한다.
    // (startIdx 와 같은 커밋에 반영되므로 로더 열은 처음부터 올바르게 회전돼 렌더된다)
    animatingRef.current = true; // 등장 중 슬라이드 클릭 차단
    setEntering(true);
    // slides.length 는 정적 콘텐츠 파생 고정값 — 마운트 1회만 실행하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 등장 타임라인(entering 이 true 가 된 뒤 loader DOM 이 존재) ---
  useIsoLayoutEffect(() => {
    if (!entering) return;
    const titleEl = titleRef.current;
    const loaderEl = loaderRef.current;
    const groups = groupsRef.current;
    const scaleMedia = scaleMediaRef.current;
    if (!titleEl || !loaderEl || !groups || !scaleMedia) return;

    const singles = gsap.utils.toArray<HTMLElement>(loaderEl.querySelectorAll('[data-loader-single]'));
    const medias = gsap.utils.toArray<HTMLElement>(loaderEl.querySelectorAll('[data-loader-media]'));
    const sideImgs = gsap.utils.toArray<HTMLElement>(loaderEl.querySelectorAll('[data-side-img]'));
    const navInners = navRef.current
      ? gsap.utils.toArray<HTMLElement>(navRef.current.querySelectorAll('[data-nav-inner]'))
      : [];
    const n = loaderRow.length; // 6
    // 로더 em(px) — clamp(9px,1.4vw,15px)라 뷰포트에 따라 변하므로 쓰는 시점마다 재측정.
    const emPx = () => parseFloat(getComputedStyle(loaderEl).fontSize) || 15;
    // 타일 좌우 패딩(px) — CSS(.single 1.3em)를 런타임 측정해 스타일 변경에 자동 적응.
    const padPx = () =>
      singles[0] ? parseFloat(getComputedStyle(singles[0]).paddingLeft) || 0 : 1.3 * emPx();

    // 초기 상태를 '페인트 전 동기'로 잡아 첫 프레임 깜빡임을 없앤다.
    // singles xPercent +600 = 기차 전체가 중앙 창 오른쪽 바깥에서 대기(마스크로 은닉).
    gsap.set(singles, { xPercent: n * 100 });
    // 짝수(6장) 열 보정: 시작 슬라이드 타일(index 2)이 화면 정중앙에 서도록 열을
    // 반 피치(= 타일 10em/2 + 패딩) 이동.
    gsap.set(groups, { x: 5 * emPx() + padPx() });
    // 카피는 클립 아래에 숨겨 두었다가 마스크 라이즈로 등장(원본 부제 애니메이션)
    if (taglineRef.current) gsap.set(taglineRef.current, { yPercent: 115 });
    gsap.set(navInners, { yPercent: 150, autoAlpha: 0 });

    // 등장 동안 스크롤 잠금(원본과 동일) — 풀스크린 로더가 뷰포트를 완전히 덮는다.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let cancelled = false;
    let tl: gsap.core.Timeline | null = null;
    let split: SplitText | null = null;
    let timerId = 0;

    // 폰트 로드 후 SplitText 측정이 정확하다. 다만 폰트가 늦거나 실패해도 화면이
    // 잠긴 채 멈추지 않도록 타임아웃과 race 한다.
    const fontsReady =
      typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();
    const timeout = new Promise<void>((resolve) => {
      timerId = window.setTimeout(resolve, 2000);
    });

    Promise.race([fontsReady, timeout]).then(() => {
      if (cancelled) return;

      // 제목 분해 — 단어 단위 마스크 리빌(crisp 제목과 동일 방식)
      split = SplitText.create(titleEl, { type: 'words', mask: 'words', aria: 'none' });
      split.words.forEach((w) => (w as HTMLElement).classList.add('split-word'));
      gsap.set(split.words, { yPercent: 110 });

      tl = gsap.timeline({
        onComplete: () => {
          animatingRef.current = false;
          setEntering(false); // 로더 언마운트
        },
      });

      // 1) 스윕: 12타일 기차가 중앙 창을 가로지르고 main 열(6장)이 창에 정착.
      //    (dup 열은 xPercent -600 으로 창 왼쪽 바깥 → 마스크에 가려짐. 원본 트릭 그대로:
      //     main 열의 left:100% 오프셋과 xPercent -600 이 정확히 상쇄돼 창을 꽉 채운다.)
      tl.to(singles, { xPercent: -n * 100, duration: 2.5, ease: 'expo.inOut', stagger: 0.05 }, 0);
      // 스윕 완전 종료 ≈ 2.5 + 11×0.05 = 3.05s → 3.45s 확대 시작까지 ≈0.4s '정지'(원본의 멈춤).

      // 2) 이웃 타일 이미지 축소(가장자리부터) — 원본 isScaleDown
      tl.to(sideImgs, { scale: 0.5, duration: 2, stagger: { each: 0.05, from: 'edges', ease: 'none' } }, 2.95);

      // 3) 정착 열 전체가 100vw×100dvh 로 확대 — flex 중앙 정렬이 유지되므로 중앙 타일은
      //    제자리에서 커지고 이웃들은 양옆으로 밀려난다(원본 isScaleUp 그대로).
      tl.to(medias, { width: '100vw', height: '100dvh', duration: 2, ease: 'expo.inOut' }, 3.45);
      //    짝수 열 보정 오프셋도 같은 이징·구간으로 동기 확대(반 피치 = w/2 + 패딩):
      //    offset(t) = pitch(t)/2 가 전 구간에서 정확히 성립 → 중앙 타일이 항상 정중앙.
      //    (끝값은 트윈 시작 시점에 재평가 — 등장 중 리사이즈에도 안전)
      tl.to(
        groups,
        { x: () => window.innerWidth / 2 + padPx(), duration: 2, ease: 'expo.inOut' },
        3.45,
      );
      //    확대 타일 모서리 라운드 해제(원본 is--radius 제거의 트랜지션 등가)
      tl.to(scaleMedia, { borderRadius: 0, duration: 0.5, ease: 'power1.inOut' }, 3.45);

      // 4) 확대 완료 → 로더 페이드(뒤의 slide0 은 동일 이미지 풀스크린 cover = 픽셀 일치)
      tl.to(loaderEl, { autoAlpha: 0, duration: 0.35, ease: 'power1.inOut' }, 5.45);

      // 5) 제목 마스크 리빌 + 회전 카피 + 분야 목록 stagger 등장
      tl.to(split.words, { yPercent: 0, duration: 1, stagger: 0.075, ease: 'expo.out' }, 5.5);
      if (taglineRef.current) {
        tl.to(taglineRef.current, { yPercent: 0, duration: 0.9, ease: 'expo.out' }, 5.75);
      }
      tl.to(navInners, { yPercent: 0, autoAlpha: 1, duration: 1, stagger: 0.06, ease: 'expo.out' }, 5.6);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      tl?.kill();
      split?.revert();
      document.body.style.overflow = prevOverflow;
    };
    // loaderRow 는 slides 파생 고정값 — entering 토글 시에만 재구성하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entering]);

  // --- 자동 전환 — 등장 완료 후, 모션 허용 시 5초마다 다음 슬라이드로 ---
  useEffect(() => {
    if (entering || prefersReducedMotion() || slides.length <= 1) return;
    const id = window.setInterval(() => {
      if (pausedRef.current || animatingRef.current || document.hidden) return;
      goTo((currentRef.current + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [entering, goTo, slides.length]);

  // --- 회전 카피 — 4초마다 페이드아웃 → 교체(아래 layout effect 가 페이드인) ---
  useEffect(() => {
    if (entering || prefersReducedMotion() || taglines.length <= 1) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const el = taglineRef.current;
      if (!el) return;
      // 학과목표 섹션과 동일한 전환: 짧은 페이드아웃 → 교체(아래 effect 가 글자 타이핑 인).
      // 공백 시간을 최소화해 '글자 없는 구간'이 길어지지 않게 한다.
      gsap.to(el, {
        autoAlpha: 0,
        duration: 0.25,
        ease: 'power1.in',
        onComplete: () => setTagIdx((i) => (i + 1) % taglines.length),
      });
    }, TAGLINE_MS);
    return () => window.clearInterval(id);
  }, [entering, taglines.length]);

  // --- 교체된 카피 타이핑 인 — 학과목표 섹션과 동일(SplitText chars 마스크 라이즈,
  // 글자 하나씩 왼쪽부터). 인덱스 0 복귀를 포함한 모든 교체에 걸린다(이전 구현은
  // 0 복귀를 건너뛰어 한 사이클마다 빈 구간이 생기던 버그). 최초 마운트만 스킵
  // (초기 카피는 등장 타임라인 또는 정적 노출이 담당). p 는 key={tagIdx} 로 매 교체
  // 리마운트 — SplitText.revert 가 옛 텍스트 스냅샷으로 새 문구를 덮는 충돌 차단. ---
  const tagFirstRender = useRef(true);
  useIsoLayoutEffect(() => {
    if (tagFirstRender.current) {
      tagFirstRender.current = false;
      return;
    }
    const el = taglineRef.current;
    if (!el || prefersReducedMotion()) return;
    const split = SplitText.create(el, { type: 'chars', mask: 'chars', aria: 'none' });
    gsap.set(el, { autoAlpha: 1 });
    gsap.set(split.chars, { yPercent: 110 });
    const tween = gsap.to(split.chars, {
      yPercent: 0,
      duration: 0.5,
      stagger: 0.03,
      ease: 'power3.out',
    });
    return () => {
      tween.kill();
      split.revert();
    };
  }, [tagIdx]);

  // --- 언마운트 정리: 진행 중 트윈 kill(전역) ---
  useEffect(() => {
    const hero = heroRef.current;
    return () => {
      if (hero) gsap.killTweensOf(hero.querySelectorAll('*'));
    };
  }, []);

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

      {/* 타이틀 블록 — 레퍼런스(홍익 조형대)식 좌측 하단 배치: 대형 제목 + 회전 카피 */}
      <div className={styles.titleBlock}>
        <h1 ref={titleRef} className={styles.title}>
          {title}
        </h1>
        {/* 회전 카피 — hicoda 식 라인 마스크(클립 안에서 솟아오름/빠져나감).
            주기 교체는 SR 에 소음이라 aria-hidden, 전체 문구는 아래 sr-only 로 제공 */}
        <div className={styles.taglineClip} aria-hidden="true">
          <p key={tagIdx} ref={taglineRef} className={styles.tagline}>
            {taglines[tagIdx] ?? ''}
          </p>
        </div>
        <p className="sr-only">{taglines.join('. ')}</p>
      </div>

      {/* 우측 하단 분야 목록 — 항상 노출(모바일 포함, 크기만 축소).
          호버/포커스 동안 자동 전환을 멈춰 사용자의 선택을 방해하지 않는다. */}
      <nav
        className={styles.nav}
        aria-label={navLabel}
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
        onFocusCapture={() => (pausedRef.current = true)}
        onBlurCapture={() => (pausedRef.current = false)}
      >
        <ul ref={navRef} className={styles.list}>
          {slides.map((s, i) => (
            <li key={s.field} className={`${styles.item}${current === i ? ` ${styles.current}` : ''}`}>
              {/* inner: [바로가기 화살표(현재 분야만)] [분야명 버튼] — 화살표를 왼쪽에 두어
                  우측 정렬된 분야명 끝선이 흔들리지 않는다. 텍스트 클릭=슬라이드 전환(미리보기),
                  화살표 클릭=연구 페이지의 해당 분야 필터로 이동(구 갤러리 CTA 계승). */}
              <div data-nav-inner className={styles.inner}>
                {current === i && s.linkLabel && (
                  <Link
                    href={`/research?field=${s.field}#labs`}
                    className={styles.quick}
                    aria-label={s.linkLabel}
                    title={s.linkLabel}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.quickIcon}>
                      <path
                        d="M7 17 17 7M9 7h8v8"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                )}
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

      {/* 등장 로더(crisp-loading) — body 로 portal 해 헤더(z-50)까지 덮는다.
          모션 허용 시에만 마운트, 완료 후 언마운트.
          구조 = 원본 그대로: groups(중앙 창·마스크) > dup 열(absolute) + main 열(left:100%).
          main 열이 창에 정착하고 그중 CENTER_IDX 타일(slide0)이 풀스크린으로 확대된다. */}
      {entering &&
        typeof document !== 'undefined' &&
        createPortal(
          <div ref={loaderRef} className={styles.loader} aria-hidden="true">
            <div ref={groupsRef} className={styles.groups}>
              <div className={styles.groupDup}>
                {loaderRow.map((s) => (
                  <div key={`d-${s.field}`} data-loader-single className={styles.single}>
                    <div data-loader-media className={styles.media}>
                      <Image src={s.image} alt="" fill sizes="160px" className={styles.tileImg} draggable={false} />
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.groupMain}>
                {loaderRow.map((s, i) => (
                  <div key={`m-${s.field}`} data-loader-single className={styles.single}>
                    <div
                      ref={i === CENTER_IDX ? scaleMediaRef : undefined}
                      data-loader-media
                      className={styles.media}
                    >
                      {/* 중앙(확대) 타일 = 시작 슬라이드 이미지: sizes 100vw·priority →
                          뒤의 히어로 배경(동일 URL)과 캐시 공유 */}
                      <Image
                        src={s.image}
                        alt=""
                        fill
                        sizes={i === CENTER_IDX ? '100vw' : '160px'}
                        priority={i === CENTER_IDX}
                        className={styles.tileImg}
                        draggable={false}
                        {...(i !== CENTER_IDX ? { 'data-side-img': '' } : {})}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
