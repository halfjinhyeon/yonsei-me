'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import { Link } from '@/i18n/navigation';
import styles from './ResearchGallery.module.css';

// Flip·ScrollTrigger·CustomEase 모두 무료 public gsap 패키지에 포함.
gsap.registerPlugin(Flip, ScrollTrigger, CustomEase);
let easeCreated = false;

/** 부모(page)에서 research-gallery.json + pick(locale) 후 넘겨주는 항목 */
export interface GalleryItem {
  /** 연구 분야 키(LabList FIELDS 와 동일) — /research?field=<field>#labs 로 연결 */
  field: string;
  title: string;
  description: string;
  image: string;
  images: string[]; // 상세 이미지 2장
}

/**
 * 연구 분야 캐러셀 → 오버레이 (GSAP Flip).
 *
 * 여섯 분야를 가로 스냅 캐러셀 카드(사진 + 번호·분야명)로 보여준다. 섹션에
 * 스크롤이 닿으면 카드들이 오른쪽에서 왼쪽으로 스태거 슬라이드 진입(ScrollTrigger,
 * 1회 재생). 카드 클릭 시 기존과 동일하게 타이틀·이미지가 GSAP Flip 으로 풀스크린
 * 오버레이(분야명 + 사진 + 설명 + "이 분야 연구실 보기" CTA)로 확대되고,
 * ESC/"목록으로" 로 복귀한다.
 *
 * Flip 은 DOM 노드를 이동(appendChild)하므로 React state 없이 마운트 후 useEffect
 * 에서 명령형 실행(root 스코프 셀렉터). 카드의 이미지 프레임(.cardMedia)은 고정
 * 크기라 이미지가 오버레이로 떠나도 카드 레이아웃이 무너지지 않는다.
 * reduced-motion 시 진입 애니메이션 생략 + Flip 없이 즉시 전환.
 */
export function ResearchGallery({ items }: { items: GalleryItem[] }) {
  const t = useTranslations('home.researchGallery');
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (!easeCreated) {
      CustomEase.create('rg-ease', '0.625, 0.05, 0, 1');
      easeCreated = true;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : 0.725;
    const ease = 'rg-ease';

    const all = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const header = root.querySelector<HTMLElement>(`.${styles.header}`);
    const track = root.querySelector<HTMLElement>('[data-rg="track"]');
    const cards = all(`.${styles.card}`);
    const cardBtns = all(`.${styles.cardButton}`);
    const overlayItems = all(`.${styles.overlayItem}`);
    const overlayNav = root.querySelector<HTMLElement>(`.${styles.overlayNav}`);
    const navItems = all('[data-rg="nav-item"]');
    const closeBtn = root.querySelector<HTMLElement>('[data-rg="close"]');
    const closeControls = all('[data-rg="close"]'); // 좌상단 "목록으로" + 우상단 X
    const closeX = root.querySelector<HTMLElement>(`.${styles.overlayClose}`);
    // 오버레이(.overlayWrap z-90)는 콘텐츠 래퍼(relative z-10)의 쌓임맥락 안이라 root 기준으로는
    // z-10 → 헤더(z-50)가 그 위에 그려져 상단 닫기 버튼이 가려진다. 오버레이가 열려 있는 동안
    // 사이트 헤더를 숨겨(autoAlpha=visibility:hidden) 가림·클릭 가로채기를 함께 없앤다.
    const siteHeader = document.querySelector<HTMLElement>('header');
    const arrows = root.querySelector<HTMLElement>('[data-rg="arrows"]');
    const prevBtn = root.querySelector<HTMLButtonElement>('[data-rg="prev"]');
    const nextBtn = root.querySelector<HTMLButtonElement>('[data-rg="next"]');

    let active: HTMLElement | null = null;

    const lockScroll = (on: boolean) => {
      document.body.style.overflow = on ? 'hidden' : '';
    };

    // ── 진입 — 헤더 페이드업 후 카드가 오른쪽에서 왼쪽으로 스태거 슬라이드(1회) ──
    // from() 대신 set + to: 트리거 전에 완성 상태가 먼저 보였다 사라지는 플래시 방지.
    let entrance: gsap.core.Timeline | null = null;
    if (!reduce && track && cards.length > 0) {
      // 이동 중인 카드가 스크롤 폭·스냅을 건드리지 않게 잠시 잠금 → 완료 후 캐러셀 활성화.
      // (mandatory 스냅은 카드 transform 변화에도 재스냅해 트랙이 저절로 밀리므로 함께 끈다)
      track.style.overflowX = 'hidden';
      track.style.scrollSnapType = 'none';
      if (header) gsap.set(header, { autoAlpha: 0, y: 24 });
      gsap.set(cards, { x: () => Math.min(window.innerWidth * 0.6, 640), autoAlpha: 0 });
      entrance = gsap.timeline({
        scrollTrigger: { id: 'rg-entrance', trigger: root, start: 'top 65%', once: true },
        onComplete: () => {
          track.scrollLeft = 0;
          track.style.overflowX = '';
          track.style.scrollSnapType = '';
          updateArrows();
        },
      });
      if (header) entrance.to(header, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' });
      entrance.to(
        cards,
        { x: 0, autoAlpha: 1, duration: 1.05, ease: 'power3.out', stagger: 0.09 },
        header ? '-=0.3' : 0,
      );
    }

    // ── 캐러셀 화살표(데스크톱) — 카드 1장 폭만큼 스냅 스크롤 ──
    const cardStep = () =>
      cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : (track?.clientWidth ?? 0);
    const updateArrows = () => {
      if (!track || !prevBtn || !nextBtn) return;
      prevBtn.disabled = track.scrollLeft <= 4;
      nextBtn.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
    };
    const onPrev = () => track?.scrollBy({ left: -cardStep(), behavior: reduce ? 'auto' : 'smooth' });
    const onNext = () => track?.scrollBy({ left: cardStep(), behavior: reduce ? 'auto' : 'smooth' });
    prevBtn?.addEventListener('click', onPrev);
    nextBtn?.addEventListener('click', onNext);
    track?.addEventListener('scroll', updateArrows, { passive: true });
    updateArrows();

    function openOverlay(index: number) {
      if (active) return;
      const card = cards[index];
      const title = card.querySelector<HTMLElement>(`.${styles.title}`);
      const image = card.querySelector<HTMLElement>(`.${styles.image}`);
      const overlayItem = overlayItems[index];
      if (!title || !image || !overlayItem) return;
      const bg = overlayItem.querySelector<HTMLElement>(`.${styles.overlayBg}`);
      const fades = Array.from(overlayItem.querySelectorAll<HTMLElement>('[data-rg="fade"]'));
      const textTarget = overlayItem.querySelector<HTMLElement>('[data-rg="text-target"]');
      const imgTarget = overlayItem.querySelector<HTMLElement>('[data-rg="img-target"]');
      if (!textTarget || !imgTarget) return;
      active = card;

      // 스크롤 잠금(스크롤바 제거 리플로우)을 Flip 측정 **이전**에 — 시작 좌표 어긋남 방지.
      lockScroll(true);
      if (siteHeader) gsap.to(siteHeader, { autoAlpha: 0, duration: reduce ? 0 : 0.3 }); // 헤더 가림 회피
      overlayItem.scrollTop = 0; // 재오픈 시 이전 스크롤 위치 리셋(안전망 스크롤)

      const titleState = reduce ? null : Flip.getState(title, { props: 'fontSize' });
      const imageState = reduce ? null : Flip.getState(image);

      gsap.set(overlayItem, { display: 'block', autoAlpha: 1 });
      if (bg) gsap.fromTo(bg, { autoAlpha: 0 }, { autoAlpha: 1, duration: reduce ? 0 : 0.4 });
      if (fades.length > 0) {
        gsap.fromTo(
          fades,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, delay: reduce ? 0 : 0.45, duration: reduce ? 0 : 0.55, stagger: reduce ? 0 : 0.07 },
        );
      }

      textTarget.appendChild(title);
      imgTarget.appendChild(image);

      if (!reduce) {
        if (titleState) Flip.from(titleState, { duration: dur, ease });
        if (imageState) Flip.from(imageState, { duration: dur, ease });
      }

      if (overlayNav) {
        gsap.set(overlayNav, { display: 'flex' });
        gsap.fromTo(navItems, { yPercent: 110 }, { yPercent: 0, stagger: reduce ? 0 : 0.1, duration: reduce ? 0 : 0.6, ease });
      }
      if (closeX) {
        gsap.set(closeX, { display: 'grid' });
        gsap.fromTo(closeX, { autoAlpha: 0 }, { autoAlpha: 1, duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.15 });
      }
      closeBtn?.focus({ preventScroll: true }); // 키보드 사용자를 오버레이 안으로

      // 카드·화살표 페이드 — 타이틀·이미지는 이미 오버레이로 옮겨진 뒤라 안전.
      // 클릭 카드는 빈 프레임이 남으므로 빠르게, 나머지는 가까운 순서대로.
      cards.forEach((c, i) => {
        gsap.to(c, {
          autoAlpha: 0,
          overwrite: 'auto',
          duration: reduce ? 0 : i === index ? 0.3 : 0.45,
          delay: reduce ? 0 : i === index ? 0 : Math.max(0, 0.2 - Math.abs(i - index) * 0.05),
        });
      });
      if (arrows) gsap.to(arrows, { autoAlpha: 0, duration: reduce ? 0 : 0.3 });
    }

    function closeOverlay() {
      if (!active) return;
      const index = cards.indexOf(active);
      const overlayItem = overlayItems[index];
      const title = overlayItem.querySelector<HTMLElement>(`[data-rg="text-target"] .${styles.title}`);
      const image = overlayItem.querySelector<HTMLElement>(`[data-rg="img-target"] .${styles.image}`);
      const bg = overlayItem.querySelector<HTMLElement>(`.${styles.overlayBg}`);
      const fades = Array.from(overlayItem.querySelectorAll<HTMLElement>('[data-rg="fade"]'));
      const meta = cards[index].querySelector<HTMLElement>('[data-rg="meta"]');
      const media = cards[index].querySelector<HTMLElement>(`.${styles.cardMedia}`);
      if (!title || !image || !meta || !media) return;

      // 캐러셀이 스크롤돼 있어도 복귀 카드가 화면 안에 오도록(즉시, Flip 측정 전)
      cards[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });

      const titleState = reduce ? null : Flip.getState(title, { props: 'fontSize' });
      const imageState = reduce ? null : Flip.getState(image);

      if (overlayNav) gsap.to(navItems, { yPercent: 110, duration: reduce ? 0 : 0.5, onComplete: () => { overlayNav.style.display = 'none'; } });
      if (closeX) gsap.to(closeX, { autoAlpha: 0, duration: reduce ? 0 : 0.3, onComplete: () => { closeX.style.display = 'none'; gsap.set(closeX, { autoAlpha: 1 }); } });
      if (fades.length > 0) gsap.to(fades, { autoAlpha: 0, duration: reduce ? 0 : 0.25 });
      if (bg) {
        // 백드롭이 걷히며 카드로 돌아가는 Flip 비행이 보인다
        gsap.to(bg, {
          autoAlpha: 0,
          duration: reduce ? 0 : 0.45,
          delay: reduce ? 0 : 0.05,
          onComplete: () => {
            overlayItem.style.display = 'none';
            gsap.set(bg, { autoAlpha: 1 }); // 다음 오픈 대비 리셋
          },
        });
      } else {
        overlayItem.style.display = 'none';
      }

      // 복귀 카드를 먼저 복구 — Flip 비행(오버레이 → 카드)이 보이도록
      meta.appendChild(title);
      media.appendChild(image);
      gsap.set(cards[index], { autoAlpha: 1, overwrite: 'auto' });

      if (!reduce) {
        if (titleState) Flip.from(titleState, { duration: dur, ease });
        if (imageState) Flip.from(imageState, { duration: dur, ease });
      }

      const activeBtn = active.querySelector<HTMLElement>(`.${styles.cardButton}`);
      active = null;
      lockScroll(false);
      if (siteHeader) gsap.to(siteHeader, { autoAlpha: 1, duration: reduce ? 0 : 0.3 }); // 헤더 복원
      activeBtn?.focus({ preventScroll: true }); // 포커스를 원래 카드로 복귀

      // 나머지 카드·화살표 복귀
      gsap.to(cards, { autoAlpha: 1, overwrite: 'auto', duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.3, stagger: reduce ? 0 : 0.05 });
      if (arrows) gsap.to(arrows, { autoAlpha: 1, duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.3 });
    }

    const cleanups: Array<() => void> = [];
    cardBtns.forEach((btn, index) => {
      const onClick = () => openOverlay(index);
      btn.addEventListener('click', onClick);
      cleanups.push(() => btn.removeEventListener('click', onClick));
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', onKey);
    const onClose = () => closeOverlay();
    // 좌상단 "목록으로" + 우상단 X — 둘 다 data-rg="close"
    closeControls.forEach((el) => {
      el.addEventListener('click', onClose);
      cleanups.push(() => el.removeEventListener('click', onClose));
    });
    // 배경(콘텐츠 밖) 클릭 닫기 — .overlayInner 안 클릭은 무시(영상 라이트박스와 동일)
    overlayItems.forEach((item) => {
      const inner = item.querySelector<HTMLElement>(`.${styles.overlayInner}`);
      const onBackdrop = (e: MouseEvent) => {
        if (!active) return;
        if (inner && inner.contains(e.target as Node)) return;
        closeOverlay();
      };
      item.addEventListener('click', onBackdrop);
      cleanups.push(() => item.removeEventListener('click', onBackdrop));
    });

    return () => {
      cleanups.forEach((fn) => fn());
      document.removeEventListener('keydown', onKey);
      if (siteHeader) gsap.set(siteHeader, { clearProps: 'opacity,visibility' }); // 언마운트 시 헤더 복원
      prevBtn?.removeEventListener('click', onPrev);
      nextBtn?.removeEventListener('click', onNext);
      track?.removeEventListener('scroll', updateArrows);
      ScrollTrigger.getById('rg-entrance')?.kill();
      entrance?.kill();
      document.body.style.overflow = '';
    };
    // items 는 마운트 시 고정 — 재실행 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section ref={rootRef} className={styles.gallery} aria-label={t('heading')}>
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>{t('eyebrow')}</p>
            <h2 className={styles.heading}>{t('heading')}</h2>
            <p className={styles.hint}>{t('hint')}</p>
          </div>
          {/* 캐러셀 화살표 — 모바일(터치 스와이프)에선 숨김 */}
          <div className={styles.arrows} data-rg="arrows">
            <button type="button" className={styles.arrowBtn} data-rg="prev" aria-label={t('prev')}>
              <span aria-hidden="true">←</span>
            </button>
            <button type="button" className={styles.arrowBtn} data-rg="next" aria-label={t('next')}>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* 캐러셀 트랙 — 스냅 가로 스크롤. 카드 전체가 버튼(사진 + 번호·분야명) */}
        <ul className={styles.track} data-rg="track">
          {items.map((it, i) => (
            <li key={it.field} className={styles.card}>
              <button type="button" className={styles.cardButton}>
                <span className={styles.cardMedia}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image} alt="" loading="lazy" className={styles.image} />
                </span>
                <span className={styles.cardMeta} data-rg="meta">
                  <span className={styles.cardNum} aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={styles.title}>{it.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.overlayWrap}>
          {items.map((it, i) => (
            <div key={it.field} className={styles.overlayItem}>
              {/* 백드롭 분리 — Flip 비행이 페이드되는 배경 위로 보인다 */}
              <div className={styles.overlayBg} aria-hidden="true" />
              <div className={styles.overlayInner}>
                <div data-rg="img-target" className={styles.overlayImgWrap} />
                <div className={styles.overlayBody}>
                  <p data-rg="fade" className={styles.overlayEyebrow}>
                    {String(i + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
                  </p>
                  <div data-rg="text-target" className={styles.overlayTitleWrap} />
                  <p data-rg="fade" className={styles.paragraph}>{it.description}</p>
                  <Link data-rg="fade" href={`/research?field=${it.field}#labs`} className={styles.cta}>
                    {t('cta')} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </div>
          ))}
          <div className={styles.overlayNav}>
            <button type="button" data-rg="close" className={styles.backBtn}>
              <span data-rg="nav-item" className={styles.backInner}>← {t('back')}</span>
            </button>
          </div>
          {/* 우측 상단 X — 배경 클릭·ESC 와 함께 닫기(영상 라이트박스와 동일 UX) */}
          <button type="button" data-rg="close" className={styles.overlayClose} aria-label={t('close')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
