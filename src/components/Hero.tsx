import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { Container } from './Container';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { MeshCanvas } from './MeshCanvas';

interface HeroCrumb {
  label: string;
  href?: string;
}

interface HeroProps {
  eyebrow?: string;
  title: string;
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
  subtitle,
  children,
  variant = 'page',
  image = '/img/hero.svg',
  breadcrumb,
}: HeroProps) {
  const lines = title.split('\n');
  const isLanding = variant === 'landing';
  const tCrumb = useTranslations('breadcrumb');
  const crumbs: HeroCrumb[] = breadcrumb ? [{ label: tCrumb('home'), href: '/' }, ...breadcrumb] : [];

  return (
    <section
      className={cn(
        'relative isolate flex items-end overflow-hidden bg-yonsei-navy text-white',
        isLanding
          ? 'min-h-[clamp(30rem,70vh,44rem)]'
          : 'min-h-[clamp(16rem,34vh,22rem)]',
      )}
    >
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
            className="absolute inset-0 -z-10 bg-gradient-to-t from-yonsei-navy via-yonsei-navy/70 to-yonsei-navy/30"
          />
        </>
      ) : (
        <>
          {/* 홈 히어로와 통일된 애니메이션 그라디언트 + 웨이브 배경 */}
          <div aria-hidden="true" className="anim-gradient-radial absolute inset-0 -z-20" />
          <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70 [mask-image:linear-gradient(to_bottom,transparent,black_35%)]" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-yonsei-navy via-yonsei-navy/40 to-transparent"
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
                    <Link href={c.href} className="transition-colors hover:text-white">
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
          {eyebrow && (
            <p className="anim-hero-title mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-yonsei-gold">
              <span aria-hidden="true" className="h-px w-8 bg-yonsei-gold" />
              {eyebrow}
            </p>
          )}
          <h1
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
          {subtitle && (
            <p
              className={cn(
                'anim-hero-subtitle mt-6 max-w-2xl leading-relaxed text-white/85',
                isLanding ? 'text-lg sm:text-xl' : 'text-base sm:text-lg',
              )}
            >
              {subtitle}
            </p>
          )}
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
      </Container>
    </section>
  );
}
