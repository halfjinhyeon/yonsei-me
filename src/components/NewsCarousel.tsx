'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MeshCanvas } from './MeshCanvas';
import { pick, type NewsItem } from '@/lib/content';
import { formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

/**
 * 다크 배경 위 뉴스 카드 가로 캐러셀.
 * 드래그/스와이프 스크롤 + 좌우 버튼. 웨이브 캔버스 배경.
 */
export function NewsCarousel({ items, locale }: { items: NewsItem[]; locale: Locale }) {
  const t = useTranslations('home.newsPreview');
  const tNews = useTranslations('news');
  const trackRef = useRef<HTMLUListElement | null>(null);

  function scrollBy(dir: number) {
    trackRef.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  }

  return (
    <section className="full-bleed relative isolate overflow-hidden bg-yonsei-navy py-section-sm text-white">
      <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-60" />

      <div className="mx-auto max-w-[1360px] px-6 sm:px-10 lg:px-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-headline font-bold">{t('title')}</h2>
          <Link href="/news" className="text-sm font-semibold text-yonsei-gold hover:underline">
            {t('viewAll')} →
          </Link>
        </div>

        <ul
          ref={trackRef}
          className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2"
        >
          {items.map((item) => (
            <li key={item.slug} className="w-[300px] shrink-0 snap-start">
              <Link
                href={`/news/${item.slug}`}
                className="flex h-full flex-col rounded-lg border border-white/15 bg-white/10 p-6 transition-all hover:-translate-y-1 hover:bg-white/[0.16]"
              >
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-yonsei-gold">
                  {tNews(`categories.${item.category}`)}
                </span>
                <span className="mt-3 text-[0.95rem] font-semibold leading-snug text-white">
                  {pick(item.title, locale)}
                </span>
                <time dateTime={item.date} className="mt-auto pt-4 text-xs text-white/60">
                  {formatDate(item.date, locale)}
                </time>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="이전"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-lg transition-colors hover:bg-white/25"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="다음"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-lg transition-colors hover:bg-white/25"
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}
