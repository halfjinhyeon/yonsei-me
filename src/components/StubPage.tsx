import { useTranslations } from 'next-intl';
import { Hero } from './Hero';
import { Section } from './Section';
import { Link } from '@/i18n/navigation';
import type { ReactNode } from 'react';

interface StubPageProps {
  title: string;
  subtitle?: string;
  /** 브레드크럼 현재 항목 라벨 */
  crumbLabel: string;
  /** 스텁 대신 실제 콘텐츠를 넣고 싶을 때 */
  children?: ReactNode;
}

/**
 * 아직 세부 콘텐츠가 채워지지 않은 페이지용 공통 레이아웃.
 * children이 있으면 스텁 안내 대신 그 내용을 렌더한다.
 */
export function StubPage({ title, subtitle, crumbLabel, children }: StubPageProps) {
  const t = useTranslations('stub');

  return (
    <>
      <Hero title={title} subtitle={subtitle} breadcrumb={[{ label: crumbLabel }]} />
      <Section>
        {children ?? (
          <div className="mx-auto flex max-w-prose flex-col items-center gap-4 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 place-items-center rounded-full bg-yonsei-navy/10 text-yonsei-navy"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path
                  d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-yonsei-navy/10 px-4 py-1.5 text-xs font-semibold text-yonsei-navy">
              {t('badge')}
            </span>
            <p className="text-base leading-relaxed text-content-soft">{t('body')}</p>
            <Link href="/" className="btn-secondary mt-2">
              ← {t('back')}
            </Link>
          </div>
        )}
      </Section>
    </>
  );
}
