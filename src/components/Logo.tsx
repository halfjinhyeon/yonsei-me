import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { WORDMARK } from './logo-wordmark';

/**
 * 학부 로고 락업 — 엠블럼 | 헤어라인 | 연세체 워드마크 (Cornell식 시그니처 구성).
 *
 * - 엠블럼: public/logo.svg (자체 네이비 원판 + 흰 디테일이라 밝/어두운 배경 모두 대응)
 * - 워드마크: 연세체 Bold 를 SVG 패스로 변환(tools/generate-wordmark.mjs)해
 *   fill=currentColor 로 렌더 — 배경에 따라 CSS 만으로 흰색↔네이비 전환.
 *   폰트 파일은 배포에 포함되지 않는다.
 * - 로케일: ko "연세대학교 기계공학부" / en "Mechanical Engineering"
 */
export function Logo({
  className,
  onLight = false,
}: {
  className?: string;
  /** 밝은(흰) 배경 위에 놓이는가 — true면 네이비 워드마크 (다크모드에선 흰색 유지) */
  onLight?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('meta');
  const wm = WORDMARK[locale === 'en' ? 'en' : 'ko'];

  return (
    <span
      className={cn(
        'flex select-none items-center gap-3 transition-colors sm:gap-3.5',
        onLight ? 'text-yonsei-navy dark:text-white' : 'text-white',
        className,
      )}
    >
      <Image
        src="/logo.svg"
        alt=""
        width={40}
        height={40}
        priority
        className="h-9 w-9 shrink-0 lg:h-10 lg:w-10"
      />
      {/* 헤어라인 — 엠블럼과 워드마크 사이 세로 실선 (Cornell 레퍼런스) */}
      <span
        aria-hidden="true"
        className={cn(
          'h-8 w-px shrink-0 transition-colors lg:h-9',
          onLight ? 'bg-yonsei-navy/30 dark:bg-white/40' : 'bg-white/50',
        )}
      />
      <svg
        viewBox={wm.viewBox}
        role="img"
        aria-label={t('siteName')}
        fill="currentColor"
        className={cn('w-auto shrink-0', locale === 'en' ? 'h-[13px] lg:h-[15px]' : 'h-[15px] lg:h-[17px]')}
      >
        <path d={wm.d} />
      </svg>
    </span>
  );
}
