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

// ── 학기 그룹 에디토리얼 변형(grouped) 전용 ──────────────────────────

/** 종별 → 배지 표기/범례 메시지 키. 라틴 한 글자는 홍익대 레퍼런스(C/R/SE)의 관례 —
 *  양 로케일에서 동일하게 읽히고, 의미는 옆 범례가 설명한다. */
const KIND_META: Record<
  string,
  { short: string; msg: 'required' | 'elective' | 'general'; style: 'filled' | 'outline' | 'neutral' }
> = {
  전필: { short: 'R', msg: 'required', style: 'filled' },
  전선: { short: 'E', msg: 'elective', style: 'outline' },
  대교: { short: 'G', msg: 'general', style: 'neutral' },
};

/** 종별 원형 배지 — 전필(네이비 채움) > 전선(네이비 윤곽) > 대교(중립 윤곽) 위계 */
function KindBadge({ kind }: { kind?: string }) {
  const meta = kind ? KIND_META[kind] : undefined;
  if (!meta) return <span className="text-content-soft">{kind ?? ''}</span>;
  return (
    <span
      aria-label={kind}
      className={cn(
        'inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold leading-none',
        meta.style === 'filled' && 'bg-yonsei-navy text-white',
        meta.style === 'outline' && 'border-2 border-yonsei-navy text-yonsei-navy',
        meta.style === 'neutral' && 'border border-content-faint text-content-soft',
      )}
    >
      {meta.short}
    </span>
  );
}

/** 학년·학기 문자열 → 그룹 정렬 순서와 표시 라벨.
 *  데이터 형태: year '1'|'3 & 4'|'2, 3, 4', semester '1'|'2'|'2, 3, 4'. */
function groupInfo(c: CatalogCourse): { order: number; label: string } {
  const y = (c.year ?? '').trim();
  const s = (c.semester ?? '').trim();
  // 학기까지 여러 값에 걸치면(전학년 개설) 맨 뒤의 공통 그룹으로
  if (/[,&]/.test(s)) return { order: 999, label: '전학년 공통' };
  const yNum = parseInt(y, 10);
  const sNum = parseInt(s, 10);
  const yLabel = /[,&]/.test(y) ? `${y.replace(/\s*[&,]\s*/g, '·')}학년` : `${yNum}학년`;
  return {
    order: (Number.isNaN(yNum) ? 9 : yNum) * 10 + (Number.isNaN(sNum) ? 9 : sNum),
    label: `${yLabel} ${sNum}학기`,
  };
}

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
  grouped,
}: {
  courses: CatalogCourse[];
  columns: CatalogColumn[];
  ariaLabel?: string;
  emptyLabel: string;
  /** 그룹 에디토리얼 표(홍익대 레퍼런스 스타일) 기준 — 대형 그룹 제목 + 널찍한 행.
   *  'semester' = 학년·학기 그룹(학부, year/semester 필요),
   *  'field' = 연구 분야 그룹(대학원, field 기반. null 은 공통·기초 그룹). */
  grouped?: 'semester' | 'field';
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

  // grouped 변형: 필터·검색을 통과한 과목을 그룹 기준(학기/분야)으로 묶어 정렬
  const groups = useMemo(() => {
    if (!grouped) return [];
    const map = new Map<string, { order: number; label: string; rows: CatalogCourse[] }>();
    for (const c of visible) {
      const { order, label } =
        grouped === 'field'
          ? c.field
            ? { order: FIELDS.indexOf(c.field), label: t(`fieldFilter.${c.field}`) }
            : { order: 999, label: t('commonGroup') }
          : groupInfo(c);
      if (!map.has(label)) map.set(label, { order, label, rows: [] });
      map.get(label)!.rows.push(c);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [visible, grouped, t]);

  // 에디토리얼 표에서 실제 데이터가 있는 컬럼만 노출(대학원은 종별·시간이 없다)
  const hasKind = useMemo(() => visible.some((c) => c.kind), [visible]);
  const hasHours = useMemo(() => visible.some((c) => c.hours), [visible]);

  /** columns prop 에서 라벨 조회(페이지가 정의한 원본 표 라벨 재사용) */
  const colLabel = (key: CatalogColumn['key']) => columns.find((c) => c.key === key)?.label ?? key;

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
      ) : grouped ? (
        /* ── 학년·학기 그룹 에디토리얼 표(홍익대 레퍼런스) ──
           대형 그룹 제목 + 종별 범례(배지) / 널찍한 행(과목명 볼드 + 학정번호 보조),
           종별은 원형 배지. key={filter+query} 리마운트로 행 스태거 재생. */
        <div key={`${filter}-${query}`} className="space-y-16">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <h3 className="text-2xl font-black tracking-tight text-content sm:text-3xl">
                  {g.label}
                </h3>
                {/* 종별 범례 — 종별 데이터가 있을 때만, 그룹 제목 우측에 반복(좁은 화면 생략) */}
                {hasKind && (
                  <div className="hidden flex-wrap items-center gap-x-5 gap-y-1 pb-1 text-xs text-content-soft md:flex">
                    {Object.entries(KIND_META).map(([kind, meta]) => (
                      <span key={kind} className="inline-flex items-center gap-1.5">
                        <KindBadge kind={kind} />
                        <span>
                          <b className="font-bold text-content">{kind}</b>: {t(`kinds.${meta.msg}`)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-t-2 border-surface-border border-t-yonsei-navy">
                      <th className="py-3 pr-4 text-left text-xs font-bold text-content-faint">
                        {colLabel('name')}
                      </th>
                      {hasKind && (
                        <th className="w-16 px-2 py-3 text-center text-xs font-bold text-content-faint">
                          {colLabel('kind')}
                        </th>
                      )}
                      <th className="w-16 px-2 py-3 text-center text-xs font-bold text-content-faint">
                        {colLabel('credits')}
                      </th>
                      {hasHours && (
                        <th className="w-24 px-2 py-3 text-center text-xs font-bold text-content-faint">
                          {colLabel('hours')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((course, i) => {
                      // "한글명 (English Title)" 형태(대학원)는 영문을 보조 줄로 분리
                      const m = course.name.match(/^(.+?)\s*\((.+)\)\s*$/);
                      const mainName = m ? m[1] : course.name;
                      const subName = m ? m[2] : null;
                      return (
                        <tr
                          key={`${course.code}-${i}`}
                          className="anim-nav-item border-b border-surface-border"
                          style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                        >
                          <td className="py-5 pr-4 align-top">
                            <span className="block text-base font-bold leading-snug text-content">
                              {mainName}
                            </span>
                            <span className="mt-1 block text-xs font-medium tracking-wide text-content-faint">
                              {course.code}
                              {subName && <> · {subName}</>}
                            </span>
                          </td>
                          {hasKind && (
                            <td className="px-2 py-5 text-center align-top">
                              <KindBadge kind={course.kind} />
                            </td>
                          )}
                          <td className="px-2 py-5 text-center align-top text-base tabular-nums text-content">
                            {course.credits}
                          </td>
                          {hasHours && (
                            <td className="whitespace-nowrap px-2 py-5 text-center align-top tabular-nums text-content-soft">
                              {course.hours}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
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
