'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { cn } from '@/lib/utils';
import type { LabDirectoryEntry, ResearchField } from '@/lib/faculty';

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
 * 연구실 목록 표. 상단 언더라인 탭(전체 + 6개 분야, 건수 배지)으로 분야를 필터링하고
 * (교수진 탭 FacultyDirectoryGrid 패턴), 연구실명은 실제 연구실 사이트로 하이퍼링크 연결
 * (링크가 없는 경우 일반 텍스트로 표시). 에디토리얼 톤(굵은 상단 룰 +
 * 헤어라인만)으로 색 블록·지브라 스트라이프 없이 구성.
 */
export function LabList({ items }: { items: LabDirectoryEntry[] }) {
  const t = useTranslations('research');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  // 홈 연구 분야 갤러리에서 /research?field=<분야>#labs 로 진입 시 해당 분야로 초기 필터.
  // (정적 페이지 유지를 위해 useSearchParams 대신 window 로 읽는다.)
  useEffect(() => {
    const field = new URLSearchParams(window.location.search).get('field');
    if (field && (FIELDS as string[]).includes(field)) {
      setFilter(field as ResearchField);
    }
  }, []);

  const counts = useMemo(() => {
    const map = { all: items.length } as Record<Filter, number>;
    for (const field of FIELDS) map[field] = 0;
    for (const lab of items) map[lab.field] += 1;
    return map;
  }, [items]);

  // 분야 필터 + 검색어(연구실명·교수명 한/영, 대소문자 무시) AND 결합
  const visible = useMemo(() => {
    const byField = filter === 'all' ? items : items.filter((lab) => lab.field === filter);
    const q = query.trim().toLowerCase();
    if (!q) return byField;
    return byField.filter((lab) =>
      [lab.nameKo, lab.nameEn, lab.professorKo, lab.professorEn]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [items, filter, query]);

  return (
    <div>
      {/* 언더라인 분야 필터 탭 — 사이트 공통 UnderlineTabs (좁은 화면은 가로 스크롤) */}
      <div className="mb-8 overflow-x-auto">
        <UnderlineTabs
          active={filter}
          onChange={(id) => setFilter(id as Filter)}
          ariaLabel="연구실 분야 필터"
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

      {/* 연구실 검색 — 연구실명·교수명 (BoardFilterBar 와 동일한 돋보기 입력 패턴) */}
      <div className="mb-6 sm:max-w-xs">
        <label htmlFor="lab-search" className="sr-only">
          {t('search.labs')}
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
            id="lab-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.labs')}
            className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-content transition-colors placeholder:text-content-faint focus:border-yonsei-blue focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        /* 검색 결과 없음 — CourseCatalog 와 같은 독수리 빈 상태 */
        <div className="flex flex-col items-center gap-5 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
          <span aria-hidden="true" className="eagle-mask h-20 w-20 bg-yonsei-blue/35" />
          <p className="max-w-sm text-content-soft">{t('search.empty')}</p>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b-2 border-yonsei-navy">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-content-faint">
                연구실
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-content-faint">
                지도교수
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-content-faint">
                위치/연락처
              </th>
            </tr>
          </thead>
          {/* key={filter} 로 필터 전환 시 행들을 리마운트해 스태거 등장을 재트리거한다. */}
          <tbody key={filter}>
            {visible.map((lab, i) => (
              <tr
                key={lab.nameKo}
                className="anim-nav-item border-b border-surface-border last:border-b-0"
                style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
              >
                <td className="px-3 py-4 align-top">
                  {lab.url ? (
                    <a
                      href={lab.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-yonsei-blue underline-offset-2 hover:underline"
                    >
                      {lab.nameKo}
                      <br />
                      <span className="text-xs text-content-faint">{lab.nameEn}</span>
                    </a>
                  ) : (
                    <>
                      <span className="font-medium text-content">{lab.nameKo}</span>
                      <br />
                      <span className="text-xs text-content-faint">{lab.nameEn}</span>
                    </>
                  )}
                </td>
                <td className="px-3 py-4 align-top text-content-soft">
                  {lab.professorKo}
                  <br />
                  <span className="text-xs text-content-faint">{lab.professorEn}</span>
                </td>
                <td className="px-3 py-4 align-top text-content-soft">
                  {lab.location}
                  {lab.phone && (
                    <>
                      <br />
                      <span className="text-xs text-content-faint">{lab.phone}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
