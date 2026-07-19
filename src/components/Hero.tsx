import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { Container } from './Container';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { MeshCanvas } from './MeshCanvas';
import { SITE_URL } from '@/lib/site';

interface HeroCrumb {
  label: string;
  href?: string;
}

interface HeroProps {
  eyebrow?: string;
  title: string;
  /** @deprecated 더 이상 렌더하지 않는다(사용자 지시: 페이지 헤더 소개글 전체 삭제).
   *  호출부 호환을 위해 프롭만 남겨 둔다. */
  subtitle?: string;
  children?: ReactNode;
  /** 큰 랜딩용(홈)인지, 작은 페이지 헤더인지 */
  variant?: 'landing' | 'page';
  /** 배경 이미지 경로 (기본: 블루프린트 플레이스홀더) */
  image?: string;
  /** page variant에서 제목 위에 표시할 브레드크럼 (현재 페이지 항목만 전달) */
  breadcrumb?: HeroCrumb[];
}

/**
 * 풀블리드 히어로. 배경 이미지 + 네이비 오버레이 위에 큰 타이포.
 * 제목의 \n은 줄바꿈으로 렌더.
 */
export function Hero({
  eyebrow,
  title,
  children,
  variant = 'page',
  image = '/img/hero.svg',
  breadcrumb,
}: HeroProps) {
  const lines = title.split('\n');
  const isLanding = variant === 'landing';
  const tCrumb = useTranslations('breadcrumb');
  const locale = useLocale();
  const crumbs: HeroCrumb[] = breadcrumb ? [{ label: tCrumb('home'), href: '/' }, ...breadcrumb] : [];

  // 브레드크럼 구조화 데이터(JSON-LD) — 검색결과에 경로 표기를 유도.
  // 마지막(현재 페이지) 항목은 스펙상 item(URL) 생략 가능.
  const breadcrumbJsonLd =
    crumbs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.label,
            ...(c.href ? { item: `${SITE_URL}/${locale}${c.href === '/' ? '' : c.href}` } : {}),
          })),
        }
      : null;

  return (
    // 세부탭 히어로는 메인색 #003377 전환에서 제외(사용자 지시) — 기존 연세 네이비 #00285E 로 고정.
    <section
      className={cn(
        'relative isolate flex items-end overflow-hidden bg-[#00285E] text-white',
        isLanding
          ? 'min-h-[clamp(30rem,70vh,44rem)]'
          : 'min-h-[clamp(16rem,34vh,22rem)]',
      )}
    >
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          // 자체 생성 정적 데이터(메시지 파일 라벨) — XSS 벡터 없음
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      )}
      {isLanding ? (
        <>
          {/* 배경 이미지 (장식) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
          />
          {/* 가독성 확보용 그라디언트 오버레이 */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#00285E] via-[#00285E]/70 to-[#00285E]/30"
          />
        </>
      ) : (
        <>
          {/* 홈 히어로와 통일된 애니메이션 그라디언트 + 웨이브 배경 */}
          <div aria-hidden="true" className="anim-gradient-radial absolute inset-0 -z-20" />
          <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70 [mask-image:linear-gradient(to_bottom,transparent,black_35%)]" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#00285E] via-[#00285E]/40 to-transparent"
          />
        </>
      )}

      <Container className={cn('relative w-full', isLanding ? 'pb-16 pt-28 sm:pb-20' : 'pb-10 pt-24')}>
        {crumbs.length > 0 && (
          <ol className="anim-crumb mb-5 flex flex-wrap items-center gap-2 text-sm text-white/70">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-2">
                  {c.href && !isLast ? (
                    /* -m/p 상쇄: 시각 변화 없이 터치 타깃을 24px 이상으로 확장 (WCAG 2.5.8) */
                    <Link href={c.href} className="-m-1.5 p-1.5 transition-colors hover:text-white">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="font-medium text-white">
                      {c.label}
                    </span>
                  )}
                  {!isLast && (
                    <span aria-hidden="true" className="text-white/40">
                      ›
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div className={cn(isLanding ? 'max-w-4xl' : 'max-w-3xl')}>
          {/* 아이브로우 — 금색 배제(사용자 정책): 네이비 배경 위 화이트 톤 */}
          {eyebrow && (
            <p className="anim-hero-title mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/85">
              <span aria-hidden="true" className="h-px w-8 bg-white/50" />
              {eyebrow}
            </p>
          )}
          {/* 페이지 제목 서체 = 지마켓 산스(홈 히어로 제목과 통일, 사용자 지시).
              --font-hero 는 700 단일이라 font-bold(700)와 맞아 가짜 볼드 합성이 없다. */}
          <h1
            style={{ fontFamily: 'var(--font-hero), var(--font-sans), sans-serif' }}
            className={cn(
              'anim-hero-title font-bold tracking-tight',
              isLanding ? 'text-display-lg' : 'text-display',
            )}
          >
            {lines.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </h1>
          {/* 제목 아래 소개글(subtitle)은 렌더하지 않는다 — 사용자 지시로 전체 삭제. */}
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
      </Container>
    </section>
  );
}
