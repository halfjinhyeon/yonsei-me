'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn, formatDate } from '@/lib/utils';
import { pick, type NewsItem, type NewsCategory } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

const categories: (NewsCategory | 'all')[] = ['all', 'notice', 'seminar', 'achievement'];

const categoryStyle: Record<NewsCategory, string> = {
  notice: 'bg-yonsei-navy/10 text-yonsei-navy',
  seminar: 'bg-yonsei-sky/15 text-yonsei-blue',
  achievement: 'bg-yonsei-gold/20 text-[#8a6d38]',
};

export function NewsList({ items, locale }: { items: NewsItem[]; locale: Locale }) {
  const t = useTranslations('news');
  const [active, setActive] = useState<NewsCategory | 'all'>('all');

  const filtered = useMemo(
    () => (active === 'all' ? items : items.filter((n) => n.category === active)),
    [items, active],
  );

  return (
    <>
      <div role="tablist" aria-label={t('hero.title')} className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const isActive = active === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(cat)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-yonsei-navy text-white'
                  : 'bg-surface-soft text-content-soft hover:text-yonsei-blue',
              )}
            >
              {t(`categories.${cat}`)}
            </button>
          );
        })}
      </div>

      <ul className="mt-10 divide-y divide-surface-border border-y border-surface-border">
        {filtered.map((item) => (
          <li key={item.slug}>
            <Link
              href={`/news/${item.slug}`}
              className="group flex flex-col gap-2 py-6 transition-colors hover:bg-surface-soft/60 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="flex items-center gap-3 sm:w-48 sm:shrink-0">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-semibold',
                    categoryStyle[item.category],
                  )}
                >
                  {t(`categories.${item.category}`)}
                </span>
                <time
                  dateTime={item.date}
                  className="text-sm text-content-faint"
                >
                  {formatDate(item.date, locale)}
                </time>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-content transition-colors group-hover:text-yonsei-blue">
                  {pick(item.title, locale)}
                </h3>
                <p className="mt-1 line-clamp-1 text-sm text-content-soft">
                  {pick(item.excerpt, locale)}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="hidden text-content-faint transition-transform group-hover:translate-x-1 group-hover:text-yonsei-blue sm:block"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
