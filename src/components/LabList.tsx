'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
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

/** 연구실별 이미지가 없을 때 순환 사용하는 더미 배경 3장 (LabCarousel 과 동일 관례) */
const FALLBACK_IMAGES = [
  '/img/research/energy-conversion.jpg',
  '/img/research/intelligent-robotics.jpg',
  '/img/research/precision-manufacturing.jpg',
];

type Filter = 'all' | ResearchField;

/** 분야 인트로(research-gallery.json 로케일 해석본) — 특정 분야 선택 시 상단 소개 블록 */
export interface LabFieldIntro {
  field: ResearchField;
  title: string;
  description: string;
  image: string;
}

/**
 * 분야 필터 탭 — 레퍼런스 디자인 이식: 활성 항목의 위·아래에 굵은 바가 붙는
 * 텍스트 탭(구 UnderlineTabs 대체). 좁은 화면은 가로 스크롤.
 */
function FieldBarTabs({
  active,
  onChange,
  tabs,
  ariaLabel,
}: {
  active: string;
  onChange: (id: Filter) => void;
  tabs: { id: Filter; label: string; count: number }[];
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex items-stretch gap-5 overflow-x-auto sm:gap-9">
      {tabs.map((tab) => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={on}
            className={cn(
              'relative whitespace-nowrap py-3.5 text-base font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue sm:text-lg',
              on ? 'text-yonsei-blue' : 'text-content-soft hover:text-content',
            )}
          >
            {/* 활성 표시 — 텍스트 위·아래의 굵은 바(레퍼런스 문법) */}
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-0 top-0 h-[3px] bg-yonsei-blue transition-opacity', on ? 'opacity-100' : 'opacity-0')}
            />
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-0 bottom-0 h-[3px] bg-yonsei-blue transition-opacity', on ? 'opacity-100' : 'opacity-0')}
            />
            {tab.label}
            <span
              className={cn(
                'ml-1.5 align-middle text-xs font-medium tabular-nums',
                on ? 'text-yonsei-blue/70' : 'text-content-faint',
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 연구실 목록 — 나열식 표를 버리고 연구실별 특색이 드러나는 에디토리얼 행으로 개편.
 *
 * 구성: [분야 필터 탭(활성 위·아래 바)] → [특정 분야 선택 시 분야 인트로: 제목 +
 * 설명 패널 + 대표 이미지 배너(fieldIntros, research-gallery.json 재사용)] →
 * [연구실 행: 좌 = 큰 이름·영문·(소개문단)·라벨 메타(지도교수/분야/위치/연락처)·
 * 바로가기 버튼 / 우 = 연구실 이미지(없으면 더미 3장 순환)].
 * 소개문단은 labs-directory.json 의 description(옵션) — 채우는 즉시 표시된다.
 *
 * 기존 기능 유지: ?field= 딥링크 초기 필터, 검색(연구실·교수명), 학부 인턴 필터·배지,
 * 필터 전환 시 스태거 재생(key), 빈 상태.
 */
export function LabList({
  items,
  fieldIntros = [],
}: {
  items: LabDirectoryEntry[];
  fieldIntros?: LabFieldIntro[];
}) {
  const t = useTranslations('research');
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [internOnly, setInternOnly] = useState(false);

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

  // 학부 인턴 모집 중인 연구실 수 (상단 필터 노출·배지 카운트용)
  const internTotal = useMemo(() => items.filter((lab) => lab.internRecruiting).length, [items]);

  // 분야 필터 + 인턴 모집 필터 + 검색어(연구실명·교수명 한/영, 대소문자 무시) AND 결합
  const visible = useMemo(() => {
    let list = filter === 'all' ? items : items.filter((lab) => lab.field === filter);
    if (internOnly) list = list.filter((lab) => lab.internRecruiting);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((lab) =>
      [lab.nameKo, lab.nameEn, lab.professorKo, lab.professorEn]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [items, filter, query, internOnly]);

  const intro = filter === 'all' ? null : fieldIntros.find((g) => g.field === filter) ?? null;

  return (
    <div>
      {/* 분야 필터 — 활성 항목 위·아래 굵은 바(레퍼런스 디자인) */}
      <div className="mb-8">
        <FieldBarTabs
          active={filter}
          onChange={setFilter}
          ariaLabel="연구실 분야 필터"
          tabs={(['all', ...FIELDS] as Filter[]).map((id) => ({
            id,
            label: t(`fieldFilter.${id}`),
            count: counts[id],
          }))}
        />
      </div>

      {/* 분야 인트로 — 특정 분야 선택 시: 분야명 + 설명(텍스트만, 박스·이미지 없이 —
          사용자 지시). ⚠️ key 는 목록 ul(key=list-*)과 형제 레벨 — 접두사로 충돌을
          막는다(동일 키였을 때 React 가 intro 제거를 누락하는 버그가 실제 발생). */}
      {intro && (
        <div key={`intro-${intro.field}`} className="anim-panel mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-content-faint">
            {t('fieldIntroLabel')}
          </p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-content sm:text-3xl">
            {intro.title}
          </h3>
          <p className="mt-4 max-w-3xl text-base leading-[1.8] text-content-soft">
            {intro.description}
          </p>
        </div>
      )}

      {/* 연구실 검색(좌) + 학부 인턴 모집 필터(우) — 모바일도 한 줄.
          전폭 검색창 아래 전폭 필터를 쌓으면 검색 바가 아니라 폼처럼 읽힌다. */}
      <div className="mb-2 flex items-center gap-2 sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1 sm:w-72 sm:flex-none">
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
              className="w-full border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-content transition-colors placeholder:text-content-faint focus:border-yonsei-blue focus:outline-none"
            />
          </div>
        </div>

        {/* 학부 인턴 모집 중인 연구실만 보기 — 모집 연구실이 있을 때만 노출 */}
        {internTotal > 0 && (
          <label
            className={cn(
              'inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-emerald-500/40',
              internOnly
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-surface-border text-content-soft hover:border-emerald-500/60 hover:text-content',
            )}
          >
            <input
              type="checkbox"
              checked={internOnly}
              onChange={(e) => setInternOnly(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            {t('intern.filter')}
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                internOnly ? 'text-emerald-700 dark:text-emerald-300' : 'text-content-faint',
              )}
            >
              {internTotal}
            </span>
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        /* 검색 결과 없음 — CourseCatalog 와 같은 독수리 빈 상태 */
        <div className="mt-6 flex flex-col items-center gap-5 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
          <span aria-hidden="true" className="eagle-mask h-20 w-20 bg-yonsei-blue/35" />
          <p className="max-w-sm text-content-soft">{t('search.empty')}</p>
        </div>
      ) : (
        /* key 로 필터 전환 시 행들을 리마운트해 스태거 등장을 재트리거한다. */
        <ul key={`list-${filter}`}>
          {visible.map((lab, i) => {
            const img = lab.image ?? FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];
            const desc = lab.description
              ? locale === 'ko'
                ? lab.description.ko
                : lab.description.en
              : null;
            return (
              <li
                key={lab.nameKo}
                className="anim-nav-item grid gap-5 border-b border-surface-border py-7 last:border-b-0 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-10"
                style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
              >
                {/* 좌: 이름·영문·(소개)·라벨 메타·바로가기 */}
                <div className="flex min-w-0 flex-col items-start">
                  <h3 className="text-xl font-bold leading-snug tracking-tight text-content sm:text-2xl">
                    {lab.url ? (
                      <a
                        href={lab.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-yonsei-blue"
                      >
                        {lab.nameKo}
                      </a>
                    ) : (
                      lab.nameKo
                    )}
                  </h3>
                  <p className="mt-1 text-xs font-medium tracking-wide text-content-faint">
                    {lab.nameEn}
                  </p>

                  {lab.internRecruiting && (
                    <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t('intern.badge')}
                      {lab.internCount ? (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          · {t('intern.count', { n: lab.internCount })}
                        </span>
                      ) : null}
                    </span>
                  )}

                  {/* 소개 문단 — labs-directory.json description 이 있을 때만 */}
                  {desc && (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-content-soft">{desc}</p>
                  )}

                  {/* 라벨 메타 — 레퍼런스의 2열 라벨 그리드(지도교수/분야/위치/연락처) */}
                  <dl className="mt-4 grid w-full max-w-xl grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-6">
                    <dt className="font-bold text-content">{t('labMeta.professor')}</dt>
                    <dd className="min-w-0 text-content-soft">
                      {lab.professorKo}
                      {lab.professorEn && (
                        <span className="ml-1.5 text-xs text-content-faint">{lab.professorEn}</span>
                      )}
                    </dd>
                    <dt className="font-bold text-content">{t('labMeta.field')}</dt>
                    <dd className="min-w-0 text-content-soft">{t(`fieldFilter.${lab.field}`)}</dd>
                    <dt className="font-bold text-content">{t('labMeta.location')}</dt>
                    <dd className="min-w-0 text-content-soft">{lab.location}</dd>
                    {lab.phone ? (
                      <>
                        <dt className="font-bold text-content">{t('labMeta.phone')}</dt>
                        <dd className="min-w-0 text-content-soft">{lab.phone}</dd>
                      </>
                    ) : null}
                  </dl>

                  {/* 바로가기 — 레퍼런스의 '바로가기 ↗' 보더 버튼 */}
                  {lab.url && (
                    <a
                      href={lab.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${lab.nameKo} ${t('labVisit')}`}
                      className="mt-4 inline-flex items-center gap-2 border border-surface-border px-4 py-2 text-xs font-bold text-content transition-colors hover:border-yonsei-blue hover:bg-yonsei-blue hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
                    >
                      {t('labVisit')}
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
                </div>

                {/* 우: 연구실 이미지(없으면 더미 순환) — 레퍼런스 우측 박스, 높이 축소판 */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-soft md:aspect-auto md:h-40 md:self-center">
                  <Image
                    src={img}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 240px, 100vw"
                    className="object-cover"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
