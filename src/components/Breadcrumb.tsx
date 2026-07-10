import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Container } from './Container';

export interface Crumb {
  label: string;
  href?: string;
}

/** 접근성 있는 브레드크럼. 현재 페이지는 링크 없이 aria-current로 표시. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const t = useTranslations('breadcrumb');

  const all: Crumb[] = [{ label: t('home'), href: '/' }, ...items];

  return (
    <nav aria-label="breadcrumb" className="border-b border-surface-border bg-surface-soft">
      <Container>
        <ol className="flex flex-wrap items-center gap-2 py-3 text-sm text-content-soft">
          {all.map((item, i) => {
            const isLast = i === all.length - 1;
            return (
              <li key={i} className="flex items-center gap-2">
                {item.href && !isLast ? (
                  /* -m/p 상쇄: 시각 변화 없이 터치 타깃을 24px 이상으로 확장 (WCAG 2.5.8) */
                  <Link
                    href={item.href}
                    className="-m-1.5 p-1.5 transition-colors hover:text-yonsei-blue"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-content">
                    {item.label}
                  </span>
                )}
                {!isLast && (
                  <span aria-hidden="true" className="text-content-faint">
                    ›
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Container>
    </nav>
  );
}
