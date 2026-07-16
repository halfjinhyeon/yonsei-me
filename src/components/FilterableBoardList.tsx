'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BoardList, type BoardRow } from '@/components/BoardList';
import { BoardFilterBar, emptyFilter, isFilterActive, matchesFilter } from '@/components/BoardFilterBar';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import type { Locale } from '@/i18n/routing';

/** 카테고리 필터 탭 정의 (예: 공지사항의 학부/대학원) */
export interface BoardCategory {
  /** BoardRow.category 와 매칭되는 식별자 */
  id: string;
  label: string;
}

/**
 * BoardList를 검색 바(범위 셀렉트 + 검색어, +선택적 카테고리 탭)로 감싼 래퍼.
 * 검색 범위는 제목/내용(발췌)/제목+내용 — BoardRow.title/subtitle 대상 클라이언트 필터.
 * props는 BoardList와 동일. 필터가 활성일 때만 결과 건수를 노출하고,
 * 필터 결과가 0건이면 검색 전용 empty 문구를 보여준다.
 *
 * categories 를 넘기면 상단에 언더라인 탭(전체 + 각 카테고리)이 뜨고,
 * BoardRow.category 로 목록을 걸러낸다(공지사항 학부/대학원 등).
 */
export function FilterableBoardList({
  items,
  locale,
  emptyLabel,
  categories,
}: {
  items: BoardRow[];
  locale: Locale;
  emptyLabel: string;
  categories?: BoardCategory[];
}) {
  const t = useTranslations('news');
  const [filter, setFilter] = useState(emptyFilter);
  const [cat, setCat] = useState('all');

  const searchActive = isFilterActive(filter);
  const catActive = !!categories && cat !== 'all';

  const filtered = useMemo(() => {
    let list = items;
    if (catActive) list = list.filter((item) => item.category === cat);
    if (searchActive) list = list.filter((item) => matchesFilter(item, filter));
    return list;
  }, [items, catActive, cat, searchActive, filter]);

  // 검색어가 적용돼 있으면 건수 노출(카테고리만으로는 목록이 곧 결과라 생략)
  const showCount = searchActive;

  return (
    <div>
      {categories && categories.length > 0 && (
        <div className="mb-5 overflow-x-auto">
          <UnderlineTabs
            active={cat}
            onChange={setCat}
            ariaLabel={t('filter.categoryLabel')}
            tabs={[
              { id: 'all', label: <span className="whitespace-nowrap">{t('filter.all')}</span> },
              ...categories.map((c) => ({
                id: c.id,
                label: (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {c.label}
                    <span
                      className={cnCount(cat === c.id)}
                    >
                      {items.filter((it) => it.category === c.id).length}
                    </span>
                  </span>
                ),
              })),
            ]}
          />
        </div>
      )}
      <BoardFilterBar value={filter} onChange={setFilter} resultCount={showCount ? filtered.length : null} />
      <BoardList
        items={filtered}
        locale={locale}
        emptyLabel={searchActive ? t('search.empty') : emptyLabel}
      />
    </div>
  );
}

/** 카테고리 탭 건수 배지 클래스 (활성/비활성) */
function cnCount(active: boolean): string {
  return active
    ? 'text-xs font-medium tabular-nums text-yonsei-blue'
    : 'text-xs font-medium tabular-nums text-content-faint';
}
