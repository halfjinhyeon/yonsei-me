import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { Container } from './Container';

interface SectionProps {
  children: ReactNode;
  /** 배경 톤 */
  tone?: 'default' | 'soft' | 'brand';
  /** 세로 패딩 크기 */
  size?: 'default' | 'sm';
  className?: string;
  containerClassName?: string;
  id?: string;
  'aria-labelledby'?: string;
}

const toneStyles: Record<NonNullable<SectionProps['tone']>, string> = {
  default: 'bg-surface text-content',
  soft: 'bg-surface-soft text-content',
  brand: 'bg-yonsei-navy text-white',
};

/** 페이지 섹션의 세로 리듬과 배경 톤을 통일하는 컴포넌트 */
export function Section({
  children,
  tone = 'default',
  size = 'default',
  className,
  containerClassName,
  id,
  'aria-labelledby': ariaLabelledby,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={cn(
        size === 'sm' ? 'py-section-sm' : 'py-section',
        toneStyles[tone],
        className,
      )}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

/** 섹션 상단의 eyebrow + 제목 + 부제 묶음 */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  id,
  invert = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  id?: string;
  invert?: boolean;
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && (
        <p className={cn('eyebrow', invert && 'text-yonsei-gold')}>{eyebrow}</p>
      )}
      <h2
        id={id}
        className={cn(
          'mt-3 text-headline font-bold',
          invert ? 'text-white' : 'text-content',
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            'mt-4 text-base leading-relaxed sm:text-lg',
            invert ? 'text-white/80' : 'text-content-soft',
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
