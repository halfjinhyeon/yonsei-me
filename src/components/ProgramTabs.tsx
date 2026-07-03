'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { pick, type Program } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

/**
 * 좌: 목록 항목에 호버하면 바뀌는 이미지 패널 + 웨이브 오버레이
 * 우: 탭(학부/대학원) + 호버 시 설명이 펼쳐지는 링크 리스트
 */
export function ProgramTabs({
  undergraduate,
  graduate,
  locale,
}: {
  undergraduate: Program[];
  graduate: Program[];
  locale: Locale;
}) {
  const t = useTranslations('home.programs');
  const [tab, setTab] = useState<'ug' | 'grad'>('ug');
  const list = tab === 'ug' ? undergraduate : graduate;
  const [hoverId, setHoverId] = useState<string>(list[0]?.id);

  const activeItem = list.find((p) => p.id === hoverId) ?? list[0];

  return (
    <section className="full-bleed grid lg:grid-cols-2">
      {/* 이미지 패널 */}
      <div className="relative min-h-[18rem] overflow-hidden bg-yonsei-navy lg:min-h-[34rem]">
        {[...undergraduate, ...graduate].map((p) => (
          <div
            key={p.id}
            aria-hidden="true"
            className={cn(
              'absolute inset-0 bg-cover bg-center transition-opacity duration-500',
              activeItem && p.id === activeItem.id ? 'opacity-100' : 'opacity-0',
            )}
            style={{ backgroundImage: `url(${p.image})` }}
          />
        ))}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-yonsei-navy/70 to-transparent"
        />
      </div>

      {/* 탭 + 리스트 */}
      <div className="flex flex-col justify-center bg-surface px-6 py-14 sm:px-10 lg:px-16">
        <h2 id="programs-heading" className="mb-8 text-headline font-bold text-content">
          {t.rich('heading', {
            em: (chunks) => <em className="font-display font-normal not-italic text-yonsei-blue">{chunks}</em>,
          })}
        </h2>

        {/* 탭바 */}
        <div role="tablist" aria-labelledby="programs-heading" className="mb-4 flex gap-6 border-b border-surface-border">
          {(
            [
              { id: 'ug', label: t('tabUg') },
              { id: 'grad', label: t('tabGrad') },
            ] as const
          ).map((tb) => (
            <button
              key={tb.id}
              role="tab"
              aria-selected={tab === tb.id}
              onClick={() => {
                setTab(tb.id);
                const next = tb.id === 'ug' ? undergraduate : graduate;
                setHoverId(next[0]?.id);
              }}
              className={cn(
                '-mb-px border-b-[3px] pb-3 text-sm font-semibold transition-colors',
                tab === tb.id
                  ? 'border-yonsei-gold text-content'
                  : 'border-transparent text-content-faint hover:text-yonsei-blue',
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* 리스트 */}
        <ul className="flex flex-col">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                href={p.href}
                onMouseEnter={() => setHoverId(p.id)}
                onFocus={() => setHoverId(p.id)}
                className="group flex items-center justify-between gap-4 border-b border-surface-border py-3.5 transition-colors hover:text-yonsei-blue"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-content group-hover:text-yonsei-blue">
                    {pick(p.title, locale)}
                  </span>
                  <span className="mt-0.5 grid grid-rows-[0fr] overflow-hidden text-sm text-content-soft transition-all duration-300 group-hover:grid-rows-[1fr] group-focus:grid-rows-[1fr]">
                    <span className="min-h-0">{pick(p.desc, locale)}</span>
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-content-faint transition-transform group-hover:translate-x-1 group-hover:text-yonsei-blue"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/academics"
          className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-yonsei-blue hover:underline"
        >
          {tab === 'ug' ? t('exploreUg') : t('exploreGrad')}
        </Link>
      </div>
    </section>
  );
}
