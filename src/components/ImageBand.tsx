import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

interface ImageBandProps {
  eyebrow?: string;
  title: string;
  body: string;
  image?: string;
  /** 이미지를 오른쪽에 둘지 (기본 왼쪽) */
  reverse?: boolean;
  cta?: { label: string; href: string };
}

/**
 * 풀블리드 2분할 밴드: 한쪽은 엣지-투-엣지 이미지, 한쪽은 텍스트.
 * 데스크톱에서 뷰포트 전체 폭을 채운다 (Cornell 스타일).
 */
export function ImageBand({
  eyebrow,
  title,
  body,
  image = '/img/feature-1.svg',
  reverse = false,
  cta,
}: ImageBandProps) {
  return (
    <section className="full-bleed grid items-stretch lg:grid-cols-2">
      {/* 이미지 면 */}
      <div
        role="img"
        aria-label=""
        className={cn(
          'min-h-[16rem] bg-cover bg-center lg:min-h-[30rem]',
          reverse && 'lg:order-2',
        )}
        style={{ backgroundImage: `url(${image})` }}
      />
      {/* 텍스트 면 */}
      <div
        className={cn(
          'flex items-center bg-surface px-6 py-14 sm:px-10 lg:px-16',
          reverse && 'lg:order-1',
        )}
      >
        <div className="mx-auto max-w-xl lg:mx-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="mt-3 text-headline font-bold text-content">{title}</h2>
          <p className="mt-4 text-base leading-relaxed text-content-soft sm:text-lg">{body}</p>
          {cta && (
            <Link href={cta.href} className="btn-primary mt-8">
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
