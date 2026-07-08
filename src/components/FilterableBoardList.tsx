'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BoardList, type BoardRow } from '@/components/BoardList';
import { BoardFilterBar, emptyFilter, isFilterActive, matchesFilter } from '@/components/BoardFilterBar';
import type { Locale } from '@/i18n/routing';

/**
 * BoardList를 검색어 + 날짜범위 필터 바로 감싼 래퍼.
 * props는 BoardList와 동일. 필터가 활성일 때만 결과 건수를 노출하고,
 * 필터 결과가 0건이면 검색 전용 empty 문구를 보여준다.
 */
export function FilterableBoardList({
  items,
  locale,
  emptyLabel,
}: {
  items: BoardRow[];
  locale: Locale;
  emptyLabel: string;
}) {
  const t = useTranslations('news');
  const [filter, setFilter] = useState(emptyFilter);

  const active = isFilterActive(filter);
  const filtered = useMemo(
    () => (active ? items.filter((item) => matchesFilter(item, filter)) : items),
    [items, active, filter],
  );

  return (
    <div>
      <BoardFilterBar value={filter} onChange={setFilter} resultCount={active ? filtered.length : null} />
      <BoardList items={filtered} locale={locale} emptyLabel={active ? t('search.empty') : emptyLabel} />
    </div>
  );
}
