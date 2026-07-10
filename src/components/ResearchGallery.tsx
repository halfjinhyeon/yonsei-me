'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { CustomEase } from 'gsap/CustomEase';
import { Link } from '@/i18n/navigation';
import styles from './ResearchGallery.module.css';

// Flip·CustomEase 도 무료 public gsap 패키지에 포함.
gsap.registerPlugin(Flip, CustomEase);
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
 * 연구 분야 갤러리 → 오버레이 (Osmo "gallery-to-overlay-transition" GSAP Flip 이식).
 * 좌: 분야 이미지 스택 / 우: 분야 타이틀 리스트. 타이틀 호버 시 매칭 이미지, 클릭 시
 * 타이틀·이미지가 GSAP Flip 으로 풀스크린 오버레이(대형 타이틀 + 히어로 이미지 + 상세
 * 이미지 2장 + 설명 + "이 분야 연구실 보기" CTA)로 확대. ESC/"목록으로" 로 복귀.
 *
 * 원본은 순수 DOM 조작(노드 이동)이라 React state 없이 마운트 후 useEffect 에서 명령형
 * 실행(root 스코프 셀렉터). reduced-motion 시 Flip 없이 즉시 전환.
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
    const listItems = all(`.${styles.titleItem}`);
    const imageItems = all(`.${styles.imgItem}`);
    const overlayItems = all(`.${styles.overlayItem}`);
    const overlayNav = root.querySelector<HTMLElement>(`.${styles.overlayNav}`);
    const navItems = all('[data-rg="nav-item"]');
    const closeBtn = root.querySelector<HTMLElement>('[data-rg="close"]');
    const headings = all(`.${styles.title}`);
    const nums = all('[data-rg="num"]');
    const caption = root.querySelector<HTMLElement>(`.${styles.imgCaption}`);
    const capNum = root.querySelector<HTMLElement>('[data-rg="cap-num"]');
    const capTitle = root.querySelector<HTMLElement>('[data-rg="cap-title"]');

    let active: HTMLElement | null = null;

    // 현재 분야 표시(캡션 + 타이틀 마커) 동기화
    const setActiveField = (i: number) => {
      listItems.forEach((li, j) => { li.dataset.active = j === i ? 'true' : 'false'; });
      if (capNum) capNum.textContent = String(i + 1).padStart(2, '0');
      if (capTitle) capTitle.textContent = items[i]?.title ?? '';
    };

    // 초기: 첫 이미지만 노출
    gsap.set(imageItems, { autoAlpha: 0 });
    if (imageItems[0]) gsap.set(imageItems[0], { autoAlpha: 1 });

    const lockScroll = (on: boolean) => {
      document.body.style.overflow = on ? 'hidden' : '';
    };

    function openOverlay(index: number) {
      if (active) return;
      setActiveField(index); // 터치 등 호버 없는 진입에서도 캡션·마커 동기화
      active = listItems[index];
      const title = listItems[index].querySelector<HTMLElement>(`.${styles.title}`);
      const image = imageItems[index].querySelector<HTMLElement>(`.${styles.image}`);
      const overlayItem = overlayItems[index];
      if (!title || !image || !overlayItem) return;
      const bg = overlayItem.querySelector<HTMLElement>(`.${styles.overlayBg}`);
      const fades = Array.from(overlayItem.querySelectorAll<HTMLElement>('[data-rg="fade"]'));
      const textTarget = overlayItem.querySelector<HTMLElement>('[data-rg="text-target"]');
      const imgTarget = overlayItem.querySelector<HTMLElement>('[data-rg="img-target"]');
      if (!textTarget || !imgTarget) return;

      // 스크롤 잠금(스크롤바 제거 리플로우)을 Flip 측정 **이전**에 — 시작 좌표 어긋남 방지.
      lockScroll(true);
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
      closeBtn?.focus({ preventScroll: true }); // 키보드 사용자를 오버레이 안으로
      gsap.set(imageItems, { autoAlpha: 0 });
      if (caption) gsap.to(caption, { autoAlpha: 0, duration: reduce ? 0 : 0.4 });
      gsap.to(nums, { autoAlpha: 0, duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.15 });
      listItems.forEach((li, i) => {
        if (i !== index) {
          const other = li.querySelector<HTMLElement>(`.${styles.title}`);
          if (other) gsap.to(other, { yPercent: 100, autoAlpha: 0, duration: reduce ? 0 : 0.45, delay: reduce ? 0 : Math.max(0, 0.2 - i * 0.05) });
        }
      });
    }

    function closeOverlay() {
      if (!active) return;
      const index = listItems.indexOf(active);
      const overlayItem = overlayItems[index];
      const title = overlayItem.querySelector<HTMLElement>(`[data-rg="text-target"] .${styles.title}`);
      const image = overlayItem.querySelector<HTMLElement>(`[data-rg="img-target"] .${styles.image}`);
      const bg = overlayItem.querySelector<HTMLElement>(`.${styles.overlayBg}`);
      const fades = Array.from(overlayItem.querySelectorAll<HTMLElement>('[data-rg="fade"]'));
      if (!title || !image) return;

      const titleState = reduce ? null : Flip.getState(title, { props: 'fontSize' });
      const imageState = reduce ? null : Flip.getState(image);

      if (overlayNav) gsap.to(navItems, { yPercent: 110, duration: reduce ? 0 : 0.5, onComplete: () => { overlayNav.style.display = 'none'; } });
      if (fades.length > 0) gsap.to(fades, { autoAlpha: 0, duration: reduce ? 0 : 0.25 });
      if (bg) {
        // 백드롭이 걷히며 리스트로 돌아가는 Flip 비행이 보인다
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

      const button = listItems[index].querySelector(`.${styles.button}`);
      button?.appendChild(title);
      imageItems[index].appendChild(image);
      gsap.set(imageItems[index], { autoAlpha: 1 });

      if (!reduce) {
        if (titleState) Flip.from(titleState, { duration: dur, ease });
        if (imageState) Flip.from(imageState, { duration: dur, ease });
      }

      const activeBtn = active.querySelector<HTMLElement>(`.${styles.button}`);
      active = null;
      lockScroll(false);
      activeBtn?.focus({ preventScroll: true }); // 포커스를 원래 항목으로 복귀
      gsap.to(headings, { yPercent: 0, autoAlpha: 1, duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.3, stagger: 0.05 });
      gsap.to(nums, { autoAlpha: 1, duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.3, stagger: 0.05 });
      if (caption) gsap.to(caption, { autoAlpha: 1, duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.3 });
    }

    const cleanups: Array<() => void> = [];
    listItems.forEach((li, index) => {
      const onClick = () => openOverlay(index);
      const onEnter = () => {
        gsap.set(imageItems, { autoAlpha: 0 });
        gsap.set(imageItems[index], { autoAlpha: 1 });
        setActiveField(index);
      };
      li.addEventListener('click', onClick);
      li.addEventListener('mouseenter', onEnter);
      cleanups.push(() => { li.removeEventListener('click', onClick); li.removeEventListener('mouseenter', onEnter); });
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', onKey);
    const onClose = () => closeOverlay();
    closeBtn?.addEventListener('click', onClose);

    return () => {
      cleanups.forEach((fn) => fn());
      document.removeEventListener('keydown', onKey);
      closeBtn?.removeEventListener('click', onClose);
      document.body.style.overflow = '';
    };
    // items 는 마운트 시 고정 — 재실행 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section ref={rootRef} className={styles.gallery} aria-label={t('heading')}>
      <div className={styles.page}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h2 className={styles.heading}>{t('heading')}</h2>
          <p className={styles.hint}>{t('hint')}</p>
        </div>

        <div className={styles.main}>
          <div className={`${styles.mainCol} ${styles.colMedia}`}>
            <div className={styles.imgList}>
              {items.map((it) => (
                <div key={it.field} className={styles.imgItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image} alt="" loading="lazy" className={styles.image} />
                </div>
              ))}
            </div>
            {/* 현재 분야 캡션 — 호버에 따라 JS 로 갱신(이미지 ↔ 타이틀 연결 라벨) */}
            <div className={styles.imgCaption} aria-hidden="true">
              <span data-rg="cap-num" className={styles.capNum}>01</span>
              <span data-rg="cap-title" className={styles.capTitle}>{items[0]?.title}</span>
            </div>
          </div>
          <div className={styles.mainCol}>
            <ul className={styles.titleList}>
              {items.map((it, i) => (
                <li key={it.field} className={styles.titleItem} data-active={i === 0 ? 'true' : 'false'}>
                  <button type="button" className={styles.button}>
                    <span className={styles.titleNum} data-rg="num" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={styles.title}>{it.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

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
        </div>
      </div>
    </section>
  );
}
