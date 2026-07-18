'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Prose } from '@/components/Prose';
import { Container } from '@/components/Container';
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
 * 동아리 상세 본문 — 흰 배경 에디토리얼 리디자인(사용자 지시).
 *
 * 구 풀스크린 다크 카드뉴스 덱(스크롤 스냅 + 고정 그라디언트 크로스페이드 + 도트
 * 인디케이터 + dark 반전)을 전부 걷어내고, 사이트 공통 문법으로 재구성했다:
 * - 흰 배경 + 자연 문서 흐름(스냅·고정 스크롤 없음)
 * - 섹션 헤더 = 네이비 박스(panel.label, 없으면 동아리명) + 반대편 헤어라인
 * - 본문 폰트 = 라이트 배경 기본 톤(Prose/text-content — 다크 트릭 제거)
 * - 사진 = 각진 모서리(라운드·섀도·링 제거, 헤어라인 보더만)
 * - 사진/본문 좌우 교대 배치는 유지(홀수 패널 사진 왼쪽, 짝수 오른쪽)
 */
export function ClubCardNews({ content, images, clubName }: ClubCardNewsProps) {
  const { panels, links } = content;

  return (
    <Container className="space-y-16 py-14 lg:space-y-24 lg:py-20">
      {panels.map((panel, i) => (
        <PanelSection
          key={i}
          panel={panel}
          // 사진을 순환 재탕하지 않고, 소진되면 데코(팀명 타이포) 패널로 대체
          image={images[i]}
          imageFirst={i % 2 === 0}
          clubName={clubName}
        />
      ))}

      {links.length > 0 && <LinksSection links={links} clubName={clubName} />}
    </Container>
  );
}

/** 한 섹션: [네이비 박스 헤더 + 헤어라인] → [사진/데코 | 본문] 2컬럼(좌우 교대) */
function PanelSection({
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
    <section>
      {/* 섹션 헤더 — 사이트 공통 네이비 박스 + 반대편으로 뻗는 헤어라인.
          사진이 왼쪽인 섹션은 박스도 왼쪽, 오른쪽인 섹션은 박스도 오른쪽(리듬 통일). */}
      <div className={cn('flex items-center gap-6', !imageFirst && 'flex-row-reverse')}>
        <h2 className="inline-block shrink-0 bg-yonsei-navy px-5 py-2.5 text-lg font-bold text-white">
          {panel.label ?? clubName}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />
      </div>

      {/* 사진 열 85% : 본문 열 115% — 사진을 줄인 만큼 글자 영역을 넓혀
          줄바꿈을 최소화한다(사용자 지시). 열 비율은 미디어가 놓이는 쪽을 따라간다. */}
      <div
        className={cn(
          'mt-8 grid items-center gap-8 lg:gap-14',
          imageFirst ? 'lg:grid-cols-[0.85fr_1.15fr]' : 'lg:grid-cols-[1.15fr_0.85fr]',
        )}
      >
        {/* 모바일: 미디어가 항상 위. 데스크톱: 홀수 패널은 미디어 먼저, 짝수는 본문 먼저 */}
        <div className={cn(imageFirst ? 'lg:order-1' : 'lg:order-2')}>{media}</div>
        <div className={cn(imageFirst ? 'lg:order-2' : 'lg:order-1')}>
          {panel.markdown && <Prose markdown={panel.markdown} className="club-prose" />}
        </div>
      </div>
    </section>
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

/** 서비스별 아이콘 색 — 다크 그라데이션 블록 위에서 인지 가능한 밝은 톤(금색 배제) */
const LINK_TINT: Record<LinkKind, string> = {
  youtube: 'text-red-400',
  instagram: 'text-pink-400',
  notion: 'text-white',
  mail: 'text-sky-300',
  web: 'text-blue-200',
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
 * links 섹션 — 마지막 "Connect" 피날레. 이 블록만 브랜드 그라데이션 + 흐름
 * 애니메이션(anim-gradient)을 유지한다(사용자 지시 — 나머지 본문은 흰 배경).
 * full-bleed 각진 다크 블록 안에 중앙 정렬 헤딩 + 글래스 톤 링크 카드.
 */
function LinksSection({ links, clubName }: { links: ClubLink[]; clubName: string }) {
  return (
    <section className="anim-gradient full-bleed px-6 py-16 text-center sm:px-10 lg:py-20">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/75">
        <span aria-hidden="true" className="h-px w-8 bg-white/50" />
        Connect
        <span aria-hidden="true" className="h-px w-8 bg-white/50" />
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {clubName}, 더 가까이에서 만나보세요
      </h2>
      <ul className="mt-10 flex flex-wrap justify-center gap-4">
        {links.map((link, i) => {
          const kind = linkKind(link);
          const sub = link.href ? hostOf(link.href) : link.value;
          const card = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-12 w-12 place-items-center bg-white/10 transition-transform group-hover:scale-110',
                  LINK_TINT[kind],
                )}
              >
                <LinkIcon kind={kind} />
              </span>
              <span className="font-semibold text-white">
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
            'group flex w-60 flex-col items-center gap-3 border border-white/15 bg-white/5 px-6 py-8 transition hover:-translate-y-1 hover:border-white/35 hover:bg-white/10';
          return (
            <li key={i}>
              {link.href ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    cardClass,
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
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
    </section>
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
      // 각진 모서리(사용자 지시) — 라운드·섀도·링 대신 헤어라인 보더만
      className="relative max-h-[28rem] w-full overflow-hidden border border-surface-border bg-surface-soft"
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

/** 사진이 없는 패널을 채우는 브랜드 데코 블록 (큰 팀명 타이포) — 각진 네이비. */
function PanelDeco({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="anim-gradient relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden p-8"
    >
      <span className="text-center text-3xl font-bold leading-tight tracking-tight text-white/90 sm:text-4xl">
        {label}
      </span>
    </div>
  );
}
