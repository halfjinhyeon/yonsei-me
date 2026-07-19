'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { EagleLoader } from '@/components/EagleLoader';
import { cn } from '@/lib/utils';
import type { FacultyRecord } from '@/lib/faculty';

const ACCENTS = [
  'from-yonsei-navy to-yonsei-blue',
  'from-yonsei-blue to-yonsei-sky',
  'from-yonsei-blue to-yonsei-navy',
  'from-yonsei-sky to-yonsei-navy',
];

function accentFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return ACCENTS[hash % ACCENTS.length];
}

/** 전화 픽토그램 (장식 — 라벨은 인접 텍스트) */
function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path
        d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 메일 픽토그램 (장식 — 라벨은 인접 텍스트) */
function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-3.5 w-3.5 shrink-0"
    >
      <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
      <path d="m3 6 9 7 9-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  // 기본 선택 = 첫 탭(교수). 탭 순서를 교수→명예·퇴임→전체로 두었으므로 로드 시
  // 밑줄이 첫 탭에 오도록 초기값도 'active'로 맞춘다(사용자 지시).
  const [filter, setFilter] = useState<Filter>('active');

  const counts = useMemo(() => {
    const emeritus = items.filter(isEmeritus).length;
    return { all: items.length, active: items.length - emeritus, emeritus };
  }, [items]);

  const visible = useMemo(() => {
    if (filter === 'active') return items.filter((f) => !isEmeritus(f));
    if (filter === 'emeritus') return items.filter(isEmeritus);
    return items;
  }, [items, filter]);

  // 탭 순서(사용자 지시): 교수(재직) → 명예·퇴임 → 전체(맨 뒤).
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'active', label: t('directoryFilter.active'), count: counts.active },
    { id: 'emeritus', label: t('directoryFilter.emeritus'), count: counts.emeritus },
    { id: 'all', label: t('directoryFilter.all'), count: counts.all },
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

      {/* key={filter} 로 필터 전환 시 리스트를 리마운트해 스태거 등장을 재트리거한다.
          카드: 항상 보이는 각진 보더 박스(레퍼런스 학과 사이트 문법) — 현행보다 크고
          레퍼런스보다 작은 중간 크기(2열 유지, 사진·패딩 확대). */}
      <ul key={filter} className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {visible.map((f, i) => {
          const emeritus = isEmeritus(f);
          const accent = accentFor(f.name);

          return (
            <li
              key={f.name}
              className="anim-nav-item group relative flex gap-5 border border-surface-border bg-surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-yonsei-blue/50 hover:shadow-card sm:gap-6"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
            >
              {/* 명예·퇴임 교수: 좌측 네이비 라인으로 "선배 세대" 무드를 미묘하게 표시 */}
              {emeritus && (
                <span aria-hidden="true" className="absolute inset-y-4 left-0 w-0.5 bg-yonsei-navy/40" />
              )}

              {/* 사진 (원본 컬러·각진 모서리 — 사진이 없을 때만 브랜드 그라디언트 + 이니셜) */}
              <div
                className={cn(
                  'relative aspect-[3/4] w-32 flex-none self-start overflow-hidden bg-gradient-to-br text-white sm:w-36',
                  accent,
                )}
              >
                {f.photo ? (
                  <>
                    {/* 사진 로딩 전까지 보이는 독수리 스피너 (로드되면 사진이 덮음) */}
                    <span className="absolute inset-0 grid place-items-center bg-surface-soft">
                      <EagleLoader decorative size={44} />
                    </span>
                    <Image
                      src={f.photo}
                      alt={f.name}
                      fill
                      sizes="(min-width: 640px) 144px, 128px"
                      className="object-cover"
                    />
                  </>
                ) : (
                  <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white/25">{f.name.charAt(0)}</span>
                  </div>
                )}
              </div>

              {/* 정보 블록 — 이름·직함 / 픽토그램 연락처 / 라벨 행(연구실·주소·전공) */}
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className={cn('text-lg font-bold sm:text-xl', emeritus ? 'text-content-soft' : 'text-content')}>
                  {f.name}
                  {f.role && (
                    <span className="ml-2 align-middle bg-yonsei-blue/10 px-2 py-0.5 text-xs font-semibold text-yonsei-blue">
                      {f.role}
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-sm text-content-soft sm:text-base">{f.title}</p>

                {/* 연락처 행 — 전화·이메일 픽토그램(레퍼런스 문법) */}
                {!emeritus && (f.phone || f.email) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-surface-border pt-3 text-sm">
                    {f.phone && (
                      <span className="inline-flex items-center gap-1.5 text-content-soft">
                        <PhoneIcon />
                        <span className="sr-only">{t('phoneLabel')}: </span>
                        {f.phone}
                      </span>
                    )}
                    {f.email && (
                      <a
                        href={`mailto:${f.email}`}
                        className="inline-flex min-w-0 items-center gap-1.5 text-yonsei-blue hover:underline"
                      >
                        <MailIcon />
                        <span className="sr-only">{t('emailLabel')}: </span>
                        <span className="truncate">{f.email}</span>
                      </a>
                    )}
                  </div>
                )}

                {emeritus ? (
                  <dl className="mt-3 space-y-1.5 border-t border-surface-border pt-3 text-sm">
                    {f.specialty && (
                      <div className="flex items-start gap-3">
                        <dt className="w-12 shrink-0 font-bold text-content">{t('specialtyLabel')}</dt>
                        <dd className="min-w-0 text-content-soft">{f.specialty}</dd>
                      </div>
                    )}
                    {f.yearRange && (
                      <p className="text-sm font-medium uppercase tracking-wide text-content-faint">
                        {f.yearRange}
                      </p>
                    )}
                  </dl>
                ) : (
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {f.lab?.nameKo && (
                      <div className="flex items-center gap-3">
                        <dt className="w-12 shrink-0 font-bold text-content">{t('labLabel')}</dt>
                        <dd className="flex min-w-0 items-center gap-2 text-content-soft">
                          <span className="truncate">{f.lab.nameKo}</span>
                          {/* 연구실 바로가기 — 레퍼런스 '+' 버튼 역할(연구실 홈페이지 새 창) */}
                          {f.lab.url && (
                            <a
                              href={f.lab.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={t('labLink', { lab: f.lab.nameKo })}
                              title={t('labLink', { lab: f.lab.nameKo })}
                              className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center border border-surface-border text-yonsei-blue transition-colors before:absolute before:-inset-2.5 before:content-[''] hover:border-yonsei-blue hover:bg-yonsei-blue hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                className="h-3 w-3"
                              >
                                <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </a>
                          )}
                        </dd>
                      </div>
                    )}
                    {f.room && (
                      <div className="flex items-start gap-3">
                        <dt className="w-12 shrink-0 font-bold text-content">{t('roomLabel')}</dt>
                        <dd className="min-w-0 text-content-soft">{f.room}</dd>
                      </div>
                    )}
                    {f.specialty && (
                      <div className="flex items-start gap-3">
                        <dt className="w-12 shrink-0 font-bold text-content">{t('specialtyLabel')}</dt>
                        <dd className="min-w-0 text-content-soft">{f.specialty}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {/* 교수 개인 상세(moreInfoUrl)가 있을 때만 하단 링크 — 연구실 링크는 위 버튼이 담당 */}
                {f.moreInfoUrl && (
                  <a
                    href={f.moreInfoUrl}
                    target={f.moreInfoUrl.startsWith('http') ? '_blank' : undefined}
                    rel={f.moreInfoUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                    aria-label={`${f.name} ${moreLabel}`}
                    className="group/link mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
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
  );
}
