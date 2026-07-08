'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { BoardList, type BoardRow } from '@/components/BoardList';
import { BoardFilterBar, emptyFilter, isFilterActive, matchesFilter } from '@/components/BoardFilterBar';
import { EagleLoader } from '@/components/EagleLoader';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { useTranslations } from 'next-intl';
import { cn, formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

export interface NewsCardItem extends BoardRow {
  href: string;
  image: string;
  excerpt?: string;
}

const VIEW_STORAGE_KEY = 'yonsei-news-view';

/**
 * 뉴스 탭 전용 게시판 — 카드형(이미지+배지+제목)과 목록형(날짜+제목 행)을
 * 우측 상단 토글 버튼으로 전환한다. 선택은 localStorage에 저장.
 */
export function NewsBoard({
  items,
  locale,
  emptyLabel,
  cardLabel,
  listLabel,
}: {
  items: NewsCardItem[];
  locale: Locale;
  emptyLabel: string;
  cardLabel: string;
  listLabel: string;
}) {
  const t = useTranslations('news');
  const [view, setView] = useState<'card' | 'list'>('card');
  const [filter, setFilter] = useState(emptyFilter);

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'list' || saved === 'card') setView(saved);
  }, []);

  function selectView(next: 'card' | 'list') {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  const active = isFilterActive(filter);
  const filtered = useMemo(
    () => (active ? items.filter((item) => matchesFilter(item, filter)) : items),
    [items, active, filter],
  );
  const emptyText = active ? t('search.empty') : emptyLabel;

  return (
    <div>
      {/* 검색어 + 날짜범위 필터 바 */}
      <BoardFilterBar value={filter} onChange={setFilter} resultCount={active ? filtered.length : null} />

      {/* 보기 방식 토글 — 사이트 공통 언더라인 탭 (선택 시 컬러바 슬라이드) */}
      <div className="mb-6 flex justify-end">
        <UnderlineTabs
          ariaLabel={`${cardLabel} / ${listLabel}`}
          active={view}
          onChange={(id) => selectView(id as 'card' | 'list')}
          tabs={[
            {
              id: 'card',
              label: (
                <>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  {cardLabel}
                </>
              ),
            },
            {
              id: 'list',
              label: (
                <>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                  </svg>
                  {listLabel}
                </>
              ),
            },
          ]}
        />
      </div>

      {view === 'list' ? (
        <BoardList items={filtered} locale={locale} emptyLabel={emptyText} />
      ) : filtered.length === 0 ? (
        <BoardList items={[]} locale={locale} emptyLabel={emptyText} />
      ) : (
        <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item, i) => (
            <li key={item.id} className="anim-nav-item" style={{ animationDelay: `${i * 70}ms` }}>
              <Link href={item.href} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-soft">
                  {item.image ? (
                    <>
                      {/* 이미지 로딩 전까지 보이는 독수리 스피너 (로드되면 이미지가 덮음) */}
                      <span className="absolute inset-0 grid place-items-center">
                        <EagleLoader decorative size={56} />
                      </span>
                      <Image
                        src={item.image}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </>
                  ) : (
                    // 이미지 미등록: eagle_empty 이미지 + "사진 미등록" 안내
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-surface-soft px-4 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/img/eagle_empty.png"
                        alt=""
                        className="h-16 w-auto opacity-70 sm:h-20"
                      />
                      <span className="text-xs font-medium text-content-faint">
                        사진이 업로드되지 않았습니다
                      </span>
                    </div>
                  )}
                  {item.tag && (
                    <span className="absolute bottom-0 left-0 bg-yonsei-navy/90 px-3 py-1.5 text-xs font-semibold text-white">
                      {item.tag}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-bold leading-snug text-content transition-colors group-hover:text-yonsei-blue">
                  {item.title}
                  <span
                    aria-hidden="true"
                    className="ml-2 inline-block transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </h3>
                {item.excerpt && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-content-soft">
                    {item.excerpt}
                  </p>
                )}
                {item.date && (
                  <time dateTime={item.date} className="mt-2 block text-xs text-content-faint">
                    {formatDate(item.date, locale)}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
