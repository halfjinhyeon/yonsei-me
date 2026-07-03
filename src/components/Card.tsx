import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** 지정 시 카드 전체가 링크가 됨 */
  href?: string;
  /** 링크 카드의 접근성 레이블 */
  ariaLabel?: string;
  /** 카드 상단 이미지 (배경 이미지 URL) */
  image?: string;
  /** 이미지 틴트 색 (currentColor 기반 플레이스홀더용) */
  imageColorClass?: string;
  /** 본문 패딩 제거 (직접 제어) */
  bare?: boolean;
}

/**
 * 재사용 카드. image가 있으면 상단 이미지 헤더가 붙는 이미지-탑 카드.
 * href가 있으면 hover 상승 효과가 있는 링크 카드로 렌더.
 */
export function Card({
  children,
  className,
  href,
  ariaLabel,
  image,
  imageColorClass,
  bare,
}: CardProps) {
  const base = cn(
    'group relative flex flex-col overflow-hidden rounded-card border border-surface-border bg-surface shadow-card transition-all duration-200 ease-out-expo',
    href && 'hover:-translate-y-1 hover:shadow-card-hover hover:border-yonsei-blue/40',
    className,
  );

  const inner = (
    <>
      {image && (
        <div
          aria-hidden="true"
          className={cn(
            'aspect-[16/10] w-full bg-cover bg-center',
            imageColorClass,
          )}
          style={{ backgroundImage: `url(${image})` }}
        />
      )}
      <div className={cn(!bare && 'p-6')}>{children}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={base}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}
