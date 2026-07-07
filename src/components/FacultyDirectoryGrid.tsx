'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { cn } from '@/lib/utils';
import type { FacultyRecord } from '@/lib/faculty';

const ACCENTS = [
  'from-yonsei-navy to-yonsei-blue',
  'from-yonsei-blue to-yonsei-sky',
  'from-yonsei-navy to-yonsei-gold',
  'from-yonsei-sky to-yonsei-navy',
];

function accentFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return ACCENTS[hash % ACCENTS.length];
}

type Filter = 'all' | 'active' | 'emeritus';

/** 별도 필드가 없으므로 yearRange(재직 기간)로 명예·퇴임 여부를 파생한다. */
const isEmeritus = (f: FacultyRecord) => Boolean(f.yearRange);

/**
 * 교수진 인명록. 상단 언더라인 탭으로 전체 / 교수 / 명예·퇴임 교수를 필터링하고
 * (활성 탭 아래의 얇은 브랜드 그라디언트 바가 선택 이동 시 슬라이드),
 * 각 카드는 사진(좌) + 항상 보이는 정보(우)의 가로 배치다. 원본 학과 사이트의 정보
 * "구성"은 유지하며, 연락처를 hover 뒤에 숨기지 않는다.
 */
export function FacultyDirectoryGrid({
  items,
  moreLabel,
}: {
  items: FacultyRecord[];
  moreLabel: string;
}) {
  const t = useTranslations('faculty');
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const emeritus = items.filter(isEmeritus).length;
    return { all: items.length, active: items.length - emeritus, emeritus };
  }, [items]);

  const visible = useMemo(() => {
    if (filter === 'active') return items.filter((f) => !isEmeritus(f));
    if (filter === 'emeritus') return items.filter(isEmeritus);
    return items;
  }, [items, filter]);

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: t('directoryFilter.all'), count: counts.all },
    { id: 'active', label: t('directoryFilter.active'), count: counts.active },
    { id: 'emeritus', label: t('directoryFilter.emeritus'), count: counts.emeritus },
  ];

  return (
    <div>
      {/* 언더라인 필터 탭 — 사이트 공통 UnderlineTabs (선택 시 컬러바 슬라이드) */}
      <UnderlineTabs
        className="mb-8"
        active={filter}
        onChange={(id) => setFilter(id as Filter)}
        tabs={tabs.map((tab) => ({
          id: tab.id,
          label: (
            <>
              {tab.label}
              <span
                className={cn(
                  'text-xs font-medium tabular-nums',
                  filter === tab.id ? 'text-yonsei-blue' : 'text-content-faint',
                )}
              >
                {tab.count}
              </span>
            </>
          ),
        }))}
      />

      {/* key={filter} 로 필터 전환 시 리스트를 리마운트해 스태거 등장을 재트리거한다. */}
      <div className="relative">
        {/* 데스크톱 2열 사이 얇은 남색 구분선 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 left-1/2 hidden w-px -translate-x-1/2 bg-yonsei-navy/40 sm:block"
        />
        <ul key={filter} className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
        {visible.map((f, i) => {
          const emeritus = isEmeritus(f);
          const accent = accentFor(f.name);
          const linkHref = f.moreInfoUrl ?? f.lab?.url ?? (f.lab ? '/research#labs' : null);
          const isExternal = !!linkHref?.startsWith('http');

          return (
            <li
              key={f.name}
              className="anim-nav-item group relative flex gap-5 rounded-card border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-surface-border hover:bg-surface hover:shadow-card"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
            >
              {/* 명예·퇴임 교수: 좌측 골드 라인으로 "선배 세대" 무드를 미묘하게 표시 */}
              {emeritus && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-yonsei-gold/70"
                />
              )}

              {/* 사진 (원본 컬러·각진 모서리 — 사진이 없을 때만 브랜드 그라디언트 + 이니셜) */}
              <div
                className={cn(
                  'relative aspect-[3/4] w-28 flex-none overflow-hidden bg-gradient-to-br text-white sm:w-32',
                  accent,
                )}
              >
                {f.photo ? (
                  <Image
                    src={f.photo}
                    alt={f.name}
                    fill
                    sizes="(min-width: 640px) 112px, 96px"
                    className="object-cover"
                  />
                ) : (
                  <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white/25">{f.name.charAt(0)}</span>
                  </div>
                )}
              </div>

              {/* 항상 보이는 정보 블록 */}
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className={cn('text-lg font-bold', emeritus ? 'text-content-soft' : 'text-content')}>
                  {f.name}
                  {f.role && (
                    <span className="ml-2 rounded-full bg-yonsei-gold/15 px-2 py-0.5 text-xs font-semibold text-yonsei-gold">
                      {f.role}
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-base text-content-soft">{f.title}</p>

                {emeritus ? (
                  <div className="mt-2 space-y-0.5">
                    {f.specialty && <p className="text-base text-content-soft">{f.specialty}</p>}
                    {f.yearRange && (
                      <p className="text-sm font-medium uppercase tracking-wide text-content-faint">
                        {f.yearRange}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-1 text-sm text-content-soft">
                    {f.lab?.nameKo && <p className="truncate text-content-soft">{f.lab.nameKo}</p>}
                    {f.email && (
                      <p className="truncate">
                        <a href={`mailto:${f.email}`} className="text-yonsei-blue hover:underline">
                          {f.email}
                        </a>
                      </p>
                    )}
                    {f.phone && <p>{f.phone}</p>}
                    {f.room && <p className="truncate">{f.room}</p>}
                  </div>
                )}

                {linkHref && (
                  <a
                    href={linkHref}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    aria-label={`${f.name} ${moreLabel}`}
                    className="group/link mt-auto inline-flex items-center gap-1 pt-2 text-xs font-semibold text-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
                  >
                    {moreLabel}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-1"
                    >
                      <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                )}
              </div>
            </li>
          );
        })}
        </ul>
      </div>
    </div>
  );
}
