'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Prose } from '@/components/Prose';
import { Container } from '@/components/Container';
import { MeshCanvas } from '@/components/MeshCanvas';
import { cn } from '@/lib/utils';
import type { ClubContent, ClubPanel, ClubLink } from '@/lib/pages';

interface ClubCardNewsProps {
  content: ClubContent;
  /** 좌우 교대로 배치할 사진들 (public/img/club-photos/) */
  images: string[];
  /** 데코 패널의 큰 타이포에 쓰는 동아리명 */
  clubName: string;
}

/**
 * 동아리 상세 본문을 스크롤 스냅 "풀스크린 덱" 형식의 카드뉴스로 렌더한다.
 *
 * 설계 의도:
 * - 전 화면 폭: <html.club-snap> 로 y축 mandatory 스냅을 걸어 패널을 한 장씩 넘긴다
 *   (뷰포트보다 긴 패널은 CSS 스냅 스펙상 영역 내 자유 스크롤이 허용돼 갇히지 않음).
 *   각 패널은 min-h 100svh 풀블리드 다크 카드. IntersectionObserver(threshold 0.5)가
 *   현재 패널을 추적해 (1) 배경 그라디언트 레이어를 크로스페이드하고
 *   (2) 진입 애니메이션용 data-active 를 붙이며(한 번 붙으면 유지)
 *   (3) 우측 도트 인디케이터의 활성 상태를 갱신한다.
 *   각 배경 레이어는 히어로(AnimatedHero)와 동일한 흐름 애니메이션(anim-gradient-flow,
 *   globals.css의 gradientShift 키프레임)으로 배경 위치가 천천히 움직인다.
 * - 모바일(<lg): 스냅은 동일하게 걸리되 fixed 크로스페이드 레이어 없이 각 패널 섹션에
 *   흐르는 그라디언트를 직접 적용해 풀블리드 다크 카드뉴스 아이덴티티를 유지 (하드 컷).
 * - 진입 애니메이션은 GSAP 대신 CSS 키프레임(globals.css의 heroTitleIn/panelFadeUp/navItemUp)
 *   재사용. js-anim 게이트로 no-JS/SEO/reduced-motion 에서는 콘텐츠가 항상 보인다.
 *
 * .dark 트릭: 각 패널 내용 래퍼에 `dark` 클래스를 얹어 CSS 변수(--content 등)를 뒤집으면
 * Prose(prose-content)·text-content·border-surface-border 가 자동으로 다크 배경용 밝은 톤이 된다.
 */

/** 패널 인덱스 % 4 로 순환하는 배경 그라디언트 팔레트 (전부 135deg, 히어로 톤 유지)
 *  — 데스크톱 fixed 크로스페이드 레이어 전용 (시간축 전환이라 팔레트가 달라도 부드럽다) */
const PANEL_GRADIENTS = [
  'linear-gradient(135deg, #00285e 0%, #0f3d7a 50%, #1b3a6b 100%)',
  'linear-gradient(135deg, #0b3268 0%, #0057a8 50%, #0f3d7a 100%)',
  'linear-gradient(135deg, #1b3a6b 0%, #2e86d6 45%, #00285e 100%)',
  'linear-gradient(135deg, #00285e 0%, #3a4f7d 50%, #8a774f 100%)',
];

/** 모바일 패널 배경 "체인" 색 — 패널 i는 CHAIN[i]→CHAIN[i+1] 세로 그라디언트라
 *  패널 경계에서 이전 패널의 끝 색과 다음 패널의 시작 색이 정확히 일치한다.
 *  (패널마다 다른 135deg 팔레트를 깔던 기존 방식은 스냅 경계에서 색이 뚝 끊겼음) */
const MOBILE_CHAIN = ['#00285e', '#123a7c', '#0057a8', '#1b3a6b', '#3a4f7d'];
const mobilePanelBg = (index: number) =>
  `linear-gradient(180deg, ${MOBILE_CHAIN[index % MOBILE_CHAIN.length]} 0%, ${
    MOBILE_CHAIN[(index + 1) % MOBILE_CHAIN.length]
  } 100%)`;

export function ClubCardNews({ content, images, clubName }: ClubCardNewsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { panels, links } = content;

  // 스냅/도트/배경이 대상으로 삼는 패널 총 수 (본문 패널 + links 패널)
  const hasLinks = links.length > 0;
  const panelCount = panels.length + (hasLinks ? 1 : 0);

  // 현재 활성(50% 이상 보이는) 패널 인덱스 — 배경 크로스페이드 + 도트 활성 추적용
  const [activeIndex, setActiveIndex] = useState(0);

  /**
   * mount 시 <html>에 club-snap 부여(스냅 활성화), 데스크톱+모션허용이면 루트에 js-anim 부여.
   * unmount 시 원복. 스냅은 CSS 미디어쿼리가 lg 이상에서만 적용하므로 resize 리스너 불필요.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    document.documentElement.classList.add('club-snap');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDesktop = window.innerWidth >= 1024;
    if (!reduce && isDesktop) root.classList.add('js-anim');

    return () => {
      document.documentElement.classList.remove('club-snap');
    };
  }, []);

  /**
   * 패널 가시성 추적 IO.
   * - 50% 이상 보이면: data-active 부여(한 번 붙으면 유지 → Cornell once 동작) + activeIndex 갱신.
   * - activeIndex 는 배경 레이어 크로스페이드와 도트 인디케이터가 함께 참조한다(계속 갱신).
   * 데스크톱에서만 의미가 크지만, 모바일에서도 activeIndex 갱신은 무해하므로 항상 관찰한다.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const els = Array.from(root.querySelectorAll<HTMLElement>('.club-panel'));
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.setAttribute('data-active', 'true'); // 진입 애니메이션 트리거 (유지)
          const idx = Number(el.dataset.panelIndex);
          if (!Number.isNaN(idx)) setActiveIndex(idx);
        }
      },
      { threshold: 0.5 },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [panelCount]);

  /** 도트 클릭 시 해당 패널로 스크롤 (reduced-motion 이면 즉시 이동) */
  const scrollToPanel = (idx: number) => {
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-panel-index="${idx}"]`);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef} className="club-deck relative">
      {/* 데스크톱 전용: 고정 배경 그라디언트 레이어 4장 크로스페이드.
          활성 패널의 팔레트 레이어만 opacity-100, 나머지는 0. (배경 자체 transition보다 부드럽고 저렴) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden lg:block">
        {PANEL_GRADIENTS.map((bg, i) => (
          <div
            key={i}
            className={cn(
              'anim-gradient-flow absolute inset-0 transition-opacity duration-700',
              activeIndex % PANEL_GRADIENTS.length === i ? 'opacity-100' : 'opacity-0',
            )}
            style={{ backgroundImage: bg }}
          />
        ))}
        {/* 히어로(AnimatedHero)와 동일한 흐르는 웨이브 라인. 배경이 fixed 크로스페이드
            구조라 캔버스 1장(rAF 1개)으로 전 패널을 커버한다. 본문 텍스트 가독성을 위해
            Hero.tsx처럼 opacity를 낮추고, 하단 위주로 보이게 동일한 마스크를 쓴다.
            모바일은 패널별 배경(하드 컷)이라 캔버스 다중 생성 비용 대비 효과가 작아 제외. */}
        <MeshCanvas className="absolute inset-0 h-full w-full opacity-70 [mask-image:linear-gradient(to_top,transparent,black_22%)]" />
      </div>

      {/* 우측 도트 인디케이터 (데스크톱 전용) */}
      {panelCount > 1 && (
        <nav
          aria-label="카드뉴스 패널"
          className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex"
        >
          {Array.from({ length: panelCount }).map((_, i) => {
            const active = activeIndex === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => scrollToPanel(i)}
                aria-label={`패널 ${i + 1}`}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-all',
                  active
                    ? 'scale-125 bg-yonsei-gold'
                    : 'bg-white/40 hover:bg-white/70',
                )}
              />
            );
          })}
        </nav>
      )}

      {panels.map((panel, i) => (
        <PanelSection key={i} index={i}>
          <PanelBody
            panel={panel}
            // 사진을 순환 재탕하지 않고, 소진되면 데코(팀명 타이포) 패널로 대체
            image={images[i]}
            imageFirst={i % 2 === 0}
            clubName={clubName}
          />
        </PanelSection>
      ))}

      {hasLinks && (
        <PanelSection index={panels.length}>
          <LinksBody links={links} clubName={clubName} />
        </PanelSection>
      )}
    </div>
  );
}

/**
 * 하나의 풀스크린 스냅 패널. full-bleed 다크 카드.
 * - 데스크톱: 배경은 상위 fixed 레이어가 담당하므로 투명, min-h 100svh + 수직 중앙.
 * - 모바일: 상위 fixed 레이어가 없으므로 이 섹션에 "체인" 세로 그라디언트를 직접 적용
 *   — 이전 패널의 끝 색과 시작 색이 일치해 스냅 경계에서 색이 끊기지 않는다.
 */
function PanelSection({ index, children }: { index: number; children: React.ReactNode }) {
  const mobileBg = mobilePanelBg(index);
  return (
    <section
      data-panel-index={index}
      className="club-panel full-bleed relative flex min-h-[100svh] items-center py-16 lg:py-0"
    >
      {/* 모바일 전용 배경(체인 그라디언트). 흐름 애니메이션(anim-gradient-flow)은
          배경 위치를 움직여 경계색을 다시 어긋나게 하므로 모바일에서는 쓰지 않는다.
          데스크톱은 상위 fixed 크로스페이드 레이어가 담당하므로 lg:hidden. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 lg:hidden"
        style={{ backgroundImage: mobileBg }}
      />
      {/* 내용 래퍼에 dark 클래스 → Prose/text-content/border 가 자동 반전 (다크 배경용 밝은 톤) */}
      <Container className="dark relative w-full">{children}</Container>
    </section>
  );
}

/** 사진/데코 + 본문 2컬럼 그리드 (좌우 교대) */
function PanelBody({
  panel,
  image,
  imageFirst,
  clubName,
}: {
  panel: ClubPanel;
  image: string | undefined;
  imageFirst: boolean;
  clubName: string;
}) {
  const media = image ? (
    <PanelPhoto src={image} alt={panel.label ?? clubName} />
  ) : (
    <PanelDeco label={panel.label ?? clubName} />
  );

  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      {/* 모바일: 미디어가 항상 위. 데스크톱: 홀수 패널은 미디어 먼저, 짝수는 본문 먼저 */}
      <div data-deck-anim="media" className={cn(imageFirst ? 'lg:order-1' : 'lg:order-2')}>
        {media}
      </div>
      <div className={cn(imageFirst ? 'lg:order-2' : 'lg:order-1')}>
        <PanelText panel={panel} clubName={clubName} />
      </div>
    </div>
  );
}

function PanelText({ panel, clubName }: { panel: ClubPanel; clubName: string }) {
  return (
    <div>
      {/* 히어로 패턴: eyebrow(골드 바 + 동아리명)는 라벨 유무와 무관하게 항상,
          큰 제목(팀명)은 라벨이 있을 때만 (roboin/mecar 처럼 마커 없는 md 대응) */}
      <div data-deck-anim="title" className="mb-5">
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-yonsei-gold">
          <span aria-hidden="true" className="h-px w-8 bg-yonsei-gold" />
          {clubName}
        </p>
        {panel.label && (
          /* text-content 는 dark 반전으로 흰색 계열이 된다 */
          <h2 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">
            {panel.label}
          </h2>
        )}
      </div>
      {panel.markdown && (
        <div data-deck-anim="text">
          <Prose markdown={panel.markdown} />
        </div>
      )}
    </div>
  );
}

/** 링크 종류 감지 — 라벨·URL 키워드로 아이콘/색을 고른다 (콘텐츠는 비개발자가 md로 관리하므로
    새 링크가 추가돼도 코드 수정 없이 자동 분류되도록 키워드 기반으로 느슨하게 매칭) */
type LinkKind = 'youtube' | 'instagram' | 'notion' | 'mail' | 'web';

function linkKind(link: ClubLink): LinkKind {
  const hay = `${link.label} ${link.href ?? ''} ${link.value ?? ''}`.toLowerCase();
  if (hay.includes('youtube') || hay.includes('youtu.be') || hay.includes('유튜브')) return 'youtube';
  if (hay.includes('instagram') || hay.includes('인스타')) return 'instagram';
  if (hay.includes('notion') || hay.includes('노션')) return 'notion';
  if (hay.includes('mail') || hay.includes('메일') || hay.includes('@')) return 'mail';
  return 'web';
}

/** 서비스별 아이콘 색 — 다크 네이비 배경 위에서 인지 가능한 밝은 톤으로 조정 */
const LINK_TINT: Record<LinkKind, string> = {
  youtube: 'text-red-400',
  instagram: 'text-pink-400',
  notion: 'text-white',
  mail: 'text-yonsei-gold',
  web: 'text-sky-300',
};

/** 사이트 다른 아이콘들과 톤을 맞춘 스트로크 기반 인라인 SVG (외부 의존성 없음) */
function LinkIcon({ kind }: { kind: LinkKind }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'youtube':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
          <path d="M10 9.3v5.4L14.8 12z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'notion':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 4.5h9.5L18 7v12.5H6z" />
          <path d="M9.5 15.5v-6l5 6v-6" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.5 2.3 2.5 14.7 0 17-2.5-2.3-2.5-14.7 0-17z" />
        </svg>
      );
  }
}

/** href의 도메인(www. 제거)을 카드 보조 텍스트로 — 파싱 실패 시 생략 */
function hostOf(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * links 섹션을 "피날레(CTA)" 패널로 렌더.
 * 풀스크린 패널에 작은 칩 몇 개만 놓으면 휑하므로, 중앙 정렬 헤딩 + 서비스 아이콘이 든
 * 큰 링크 카드(글래스 톤)로 마지막 장다운 밀도를 준다. 카드 수가 2~4개로 유동적이라
 * grid 대신 flex justify-center + 고정폭 카드로 어떤 개수든 중앙 균형을 유지한다.
 */
function LinksBody({ links, clubName }: { links: ClubLink[]; clubName: string }) {
  return (
    <div className="text-center">
      <div data-deck-anim="title">
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-yonsei-gold">
          <span aria-hidden="true" className="h-px w-8 bg-yonsei-gold" />
          Connect
          <span aria-hidden="true" className="h-px w-8 bg-yonsei-gold" />
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">
          {clubName}, 더 가까이에서 만나보세요
        </h2>
      </div>
      <ul data-deck-anim="text" className="mt-10 flex flex-wrap justify-center gap-4">
        {links.map((link, i) => {
          const kind = linkKind(link);
          const sub = link.href ? hostOf(link.href) : link.value;
          const card = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-12 w-12 place-items-center rounded-full bg-white/10 transition-transform group-hover:scale-110',
                  LINK_TINT[kind],
                )}
              >
                <LinkIcon kind={kind} />
              </span>
              <span className="font-semibold text-content">
                {link.label}
                {link.href && (
                  <span aria-hidden="true" className="ml-1 text-xs text-white/50">
                    ↗
                  </span>
                )}
              </span>
              {sub && <span className="break-all text-xs text-white/55">{sub}</span>}
            </>
          );
          const cardClass =
            'group flex w-60 flex-col items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-6 py-8 transition hover:-translate-y-1 hover:border-white/35 hover:bg-white/10';
          return (
            <li key={i}>
              {link.href ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    cardClass,
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-gold',
                  )}
                >
                  {card}
                </a>
              ) : (
                <div className={cn(cardClass, 'cursor-default select-text')} aria-label={`${link.label}: ${link.value}`}>
                  {card}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 사진 비율 허용 범위 — 이 안에 들면 원본 비율 그대로(잘림 없음), 벗어나면 경계값으로
    클램프해 극단적 파노라마/세로 사진만 최소한으로 잘린다. */
const PHOTO_RATIO_MIN = 4 / 5; // 세로 사진 하한
const PHOTO_RATIO_MAX = 16 / 9; // 가로 사진 상한

function PanelPhoto({ src, alt }: { src: string; alt: string }) {
  // 로드 전에는 4:3으로 시작해 레이아웃 점프를 줄이고, 로드 후 원본 비율로 맞춘다
  const [ratio, setRatio] = useState(4 / 3);
  return (
    <div
      style={{ aspectRatio: ratio }}
      className="relative max-h-[72svh] w-full overflow-hidden rounded-lg bg-yonsei-navy shadow-xl ring-1 ring-white/20"
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1024px) 45vw, 100vw"
        className="object-cover"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (!img.naturalWidth || !img.naturalHeight) return;
          const natural = img.naturalWidth / img.naturalHeight;
          setRatio(Math.min(PHOTO_RATIO_MAX, Math.max(PHOTO_RATIO_MIN, natural)));
        }}
      />
    </div>
  );
}

/** 사진이 없는 패널을 채우는 브랜드 그라데이션 데코 패널 (큰 팀명 타이포).
    배경과 겹치므로 ring 으로 경계를 보강한다. */
function PanelDeco({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="anim-gradient relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg p-8 shadow-xl ring-1 ring-white/20"
    >
      <span className="text-center text-3xl font-bold leading-tight tracking-tight text-white/90 sm:text-4xl">
        {label}
      </span>
    </div>
  );
}
