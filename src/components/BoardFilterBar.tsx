'use client';

import { useTranslations } from 'next-intl';

export interface BoardFilterState {
  query: string;
  from: string;
  to: string;
}

export const emptyFilter: BoardFilterState = { query: '', from: '', to: '' };

/** 검색어 정규화: 소문자화 + 공백 접기 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 필터가 하나라도 활성인지 */
export function isFilterActive(f: BoardFilterState): boolean {
  return normalize(f.query) !== '' || f.from !== '' || f.to !== '';
}

/**
 * 한 행(제목·날짜)이 필터 조건을 만족하는지 판정.
 * query: 공백 정규화·소문자 부분일치. from/to: date 문자열 비교(한쪽만 지정 가능).
 * 날짜 필터가 걸렸는데 행에 date가 없으면 제외한다.
 */
export function matchesFilter(row: { title: string; date?: string | null }, f: BoardFilterState): boolean {
  const q = normalize(f.query);
  if (q && !normalize(row.title).includes(q)) return false;
  if (f.from || f.to) {
    if (!row.date) return false;
    if (f.from && row.date < f.from) return false;
    if (f.to && row.date > f.to) return false;
  }
  return true;
}

const inputClass =
  'w-full border border-surface-border bg-surface px-3 py-2 text-sm text-content transition-colors placeholder:text-content-faint focus:border-yonsei-blue focus:outline-none';

/**
 * 단일 게시판용 검색어 + 날짜범위 필터 바 (제어형).
 * 결과 건수(resultCount)와 초기화 버튼은 필터가 활성일 때만 노출한다.
 */
export function BoardFilterBar({
  value,
  onChange,
  resultCount = null,
}: {
  value: BoardFilterState;
  onChange: (v: BoardFilterState) => void;
  resultCount?: number | null;
}) {
  const t = useTranslations('news');
  const active = isFilterActive(value);

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {/* 검색어 */}
        <div className="min-w-0 flex-1 sm:min-w-[14rem]">
          <label htmlFor="board-filter-query" className="sr-only">
            {t('search.placeholder')}
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-content-faint"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="board-filter-query"
              type="search"
              value={value.query}
              onChange={(e) => onChange({ ...value, query: e.target.value })}
              placeholder={t('search.placeholder')}
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        {/* 시작일 */}
        <div>
          <label htmlFor="board-filter-from" className="sr-only">
            {t('search.fromLabel')}
          </label>
          <input
            id="board-filter-from"
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            aria-label={t('search.fromLabel')}
            className={`${inputClass} sm:w-44`}
          />
        </div>

        {/* 종료일 */}
        <div>
          <label htmlFor="board-filter-to" className="sr-only">
            {t('search.toLabel')}
          </label>
          <input
            id="board-filter-to"
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            aria-label={t('search.toLabel')}
            className={`${inputClass} sm:w-44`}
          />
        </div>

        {/* 초기화 (조건 활성 시) */}
        {active && (
          <button
            type="button"
            onClick={() => onChange(emptyFilter)}
            className="border border-surface-border px-3 py-2 text-sm font-medium text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-blue"
          >
            {t('search.clear')}
          </button>
        )}
      </div>

      {/* 결과 건수 (조건 활성 + 건수 전달 시) */}
      {active && resultCount !== null && (
        <p className="mt-2 text-sm text-content-soft" aria-live="polite">
          {t('search.results', { count: resultCount })}
        </p>
      )}
    </div>
  );
}
