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

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((lab) => lab.field === filter)),
    [items, filter],
  );

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
    </div>
  );
}
