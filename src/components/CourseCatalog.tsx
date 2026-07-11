'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { cn } from '@/lib/utils';
import type { ResearchField } from '@/lib/faculty';

/**
 * 교과목 한 행. 학부(content/courses-undergraduate.json)는 모든 컬럼을,
 * 대학원(content/courses-graduate.json)은 code/name/credits만 갖는다.
 * field 가 null 이면 기초/공통 과목 — '전체' 탭에서만 표시된다.
 */
export interface CatalogCourse {
  year?: string;
  semester?: string;
  kind?: string;
  code: string;
  name: string;
  credits: string;
  hours?: string;
  field: ResearchField | null;
}

/** 표 컬럼 구성 — 각 페이지가 원본 md 표와 동일한 컬럼/라벨을 지정한다. */
export interface CatalogColumn {
  key: 'year' | 'semester' | 'kind' | 'code' | 'name' | 'credits' | 'hours';
  label: string;
}

/** 분야 탭 표시 순서 (research.fieldFilter 메시지 키와 동일) */
const FIELDS: ResearchField[] = [
  'bioNano',
  'thermoFluid',
  'dynamicsControl',
  'manufacturingDesign',
  'computation',
  'mechanicsMaterials',
];

type Filter = 'all' | ResearchField;

/**
 * 교과목 편람 표. 상단 언더라인 탭(전체 + 6개 분야, 건수 배지)으로 분야를 필터링하는
 * 에디토리얼 표(굵은 상단 룰 + 헤어라인, 헤더 셀만 옅은 면색). 기초/공통 과목
 * (field: null)은 '전체'에서만 보이고, 필터 전환 시 tbody 리마운트로 행 스태거
 * 등장을 재생한다 (교수진 탭 FacultyDirectoryGrid 패턴).
 */
export function CourseCatalog({
  courses,
  columns,
  ariaLabel,
  emptyLabel,
}: {
  courses: CatalogCourse[];
  columns: CatalogColumn[];
  ariaLabel?: string;
  emptyLabel: string;
}) {
  const t = useTranslations('research');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const map = { all: courses.length } as Record<Filter, number>;
    for (const field of FIELDS) map[field] = 0;
    for (const course of courses) if (course.field) map[course.field] += 1;
    return map;
  }, [courses]);

  // 분야 필터 + 검색어(과목명·학정번호, 대소문자 무시) AND 결합
  const visible = useMemo(() => {
    const byField = filter === 'all' ? courses : courses.filter((c) => c.field === filter);
    const q = query.trim().toLowerCase();
    if (!q) return byField;
    return byField.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [courses, filter, query]);

  return (
    <div>
      {/* 언더라인 분야 필터 탭 — 사이트 공통 UnderlineTabs (좁은 화면은 가로 스크롤) */}
      <div className="mb-6 overflow-x-auto">
        <UnderlineTabs
          active={filter}
          onChange={(id) => setFilter(id as Filter)}
          ariaLabel={ariaLabel}
          tabs={(['all', ...FIELDS] as Filter[]).map((id) => ({
            id,
            label: (
              <>
                <span className="whitespace-nowrap">{t(`fieldFilter.${id}`)}</span>
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    filter === id ? 'text-yonsei-blue' : 'text-content-faint',
                  )}
                >
                  {counts[id]}
                </span>
              </>
            ),
          }))}
        />
      </div>

      {/* 과목 검색 — 과목명·학정번호 (BoardFilterBar 와 동일한 돋보기 입력 패턴) */}
      <div className="mb-6 sm:max-w-xs">
        <label htmlFor="course-search" className="sr-only">
          {t('search.courses')}
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
            id="course-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.courses')}
            className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-content transition-colors placeholder:text-content-faint focus:border-yonsei-blue focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        /* 빈 분야 — BoardList 와 같은 독수리 마스코트 빈 상태 */
        <div className="flex flex-col items-center gap-5 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
          <span aria-hidden="true" className="eagle-mask h-20 w-20 bg-yonsei-blue/35" />
          <p className="max-w-sm text-content-soft">
            {query.trim() ? t('search.empty') : emptyLabel}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-t-2 border-yonsei-navy text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="whitespace-nowrap bg-surface-soft px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-content-faint"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            {/* key={filter} 로 필터 전환 시 행들을 리마운트해 스태거 등장을 재트리거한다. */}
            <tbody key={filter}>
              {visible.map((course, i) => (
                <tr
                  key={`${course.code}-${i}`}
                  className="anim-nav-item border-b border-surface-border"
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-3.5 align-top',
                        col.key === 'name'
                          ? 'font-medium text-content'
                          : 'text-content-soft',
                        col.key === 'code' && 'whitespace-nowrap',
                      )}
                    >
                      {course[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
