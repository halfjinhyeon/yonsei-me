'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Prose } from '@/components/Prose';
import { cn } from '@/lib/utils';
import type { ClubContent, ClubPanel } from '@/lib/pages';

interface ClubCardNewsProps {
  content: ClubContent;
  /** 좌우 교대로 배치할 사진들 (public/img/club-photos/) */
  images: string[];
  /** 데코 패널의 큰 타이포에 쓰는 동아리명 */
  clubName: string;
}

/**
 * 동아리 상세 본문을 "카드뉴스" 스크롤 리빌로 렌더한다.
 * - 데스크톱(lg↑): 2컬럼 그리드, 홀수 패널 사진-왼쪽/본문-오른쪽, 짝수 패널 본문-왼쪽/사진-오른쪽
 * - 모바일: 세로 스택 (사진 위, 본문 아래)
 * - GSAP + ScrollTrigger 리빌 (lg 미만·reduced-motion 은 생략, 콘텐츠는 항상 보임)
 * - 사진이 부족한 패널은 브랜드 그라데이션 데코 패널(큰 팀명 타이포)로 대체
 */
export function ClubCardNews({ content, images, clubName }: ClubCardNewsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { panels, links } = content;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 1024) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const ctx = gsap.context(() => {
        const els = gsap.utils.toArray<HTMLElement>('[data-reveal]');
        els.forEach((el) => {
          const dir = el.dataset.reveal; // 'up' | 'left' | 'right'
          const fromVars: gsap.TweenVars = { opacity: 0, duration: 3, ease: 'power2.out' };
          if (dir === 'left') fromVars.x = -50;
          else if (dir === 'right') fromVars.x = 50;
          else fromVars.y = 100;
          gsap.from(el, {
            ...fromVars,
            scrollTrigger: {
              trigger: el,
              start: 'top bottom',
              end: 'top 70%',
              scrub: 2,
              once: true,
            },
          });
        });
      }, root);

      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener('resize', refresh);
      // 이미지 로드 후 레이아웃이 바뀌면 트리거 위치 재계산
      root.querySelectorAll('img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', refresh, { once: true });
      });

      cleanup = () => {
        window.removeEventListener('resize', refresh);
        ctx.revert();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [panels.length]);

  return (
    <div ref={rootRef} className="space-y-16 sm:space-y-24">
      {panels.map((panel, i) => {
        const imageFirst = i % 2 === 0; // 홀수 패널(0-based even) = 사진 왼쪽
        const image = images.length > 0 ? images[i % images.length] : undefined;
        // 사진이 있으면 미디어 패널, 없으면 데코 패널
        const media = image ? (
          <PanelPhoto src={image} alt={panel.label ?? clubName} side={imageFirst ? 'left' : 'right'} />
        ) : (
          <PanelDeco label={panel.label ?? clubName} side={imageFirst ? 'left' : 'right'} />
        );

        return (
          <div
            key={i}
            className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
          >
            {/* 모바일: 미디어가 항상 위. 데스크톱: 홀수는 미디어 먼저, 짝수는 본문 먼저 */}
            <div className={cn(imageFirst ? 'lg:order-1' : 'lg:order-2')}>{media}</div>
            <div className={cn(imageFirst ? 'lg:order-2' : 'lg:order-1')}>
              <PanelText panel={panel} />
            </div>
          </div>
        );
      })}

      {links.length > 0 && (
        <div data-reveal="up" className="border-t border-surface-border pt-10">
          <p className="eyebrow mb-4">Links</p>
          <ul className="flex flex-wrap gap-3">
            {links.map((link, i) =>
              link.href ? (
                <li key={i}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                  >
                    {link.label}
                  </a>
                </li>
              ) : (
                <li
                  key={i}
                  className="btn-secondary cursor-default select-text"
                  aria-label={`${link.label}: ${link.value}`}
                >
                  {link.label}: {link.value}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function PanelText({ panel }: { panel: ClubPanel }) {
  return (
    <div data-reveal="up">
      {panel.label && (
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-content sm:text-3xl">
          <span className="text-yonsei-blue">{panel.label}</span>
        </h2>
      )}
      {panel.markdown && <Prose markdown={panel.markdown} />}
    </div>
  );
}

function PanelPhoto({
  src,
  alt,
  side,
}: {
  src: string;
  alt: string;
  side: 'left' | 'right';
}) {
  return (
    <div
      data-reveal={side}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-yonsei-navy shadow-xl ring-1 ring-black/5"
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1024px) 45vw, 100vw"
        className="object-cover"
      />
    </div>
  );
}

/** 사진이 없는 패널을 채우는 브랜드 그라데이션 데코 패널 (큰 팀명 타이포) */
function PanelDeco({ label, side }: { label: string; side: 'left' | 'right' }) {
  return (
    <div
      data-reveal={side}
      aria-hidden="true"
      className="anim-gradient relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl p-8 shadow-xl"
    >
      <span className="text-center text-3xl font-bold leading-tight tracking-tight text-white/90 sm:text-4xl">
        {label}
      </span>
    </div>
  );
}
