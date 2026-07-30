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

/** 학정번호 → 교과목 소개(content/course-descriptions.json). 체계도(CurriculumFlow)와 같은 원본. */
export type CatalogDescriptions = Record<string, { nameEn?: string; desc?: string } | undefined>;

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

/** '2, 3, 4'·'3 & 4' 같은 복수 값 문자열에 선택 학년/학기가 포함되는지 — 숫자 나열 파싱 */
function matchesNum(raw: string | undefined, sel: string): boolean {
  if (sel === 'all') return true;
  return (raw ?? '').match(/\d+/g)?.includes(sel) ?? false;
}

/**
 * 교과목 편람 표. 상단 언더라인 탭(전체 + 6개 분야, 건수 배지)으로 분야를 필터링하는
 * 에디토리얼 표(굵은 상단 룰 + 헤어라인, 헤더 셀만 옅은 면색). 탭 아래 학년·학기
 * select(데이터에 있을 때만)와 과목명·학정번호 검색으로 함께 좁힌다. 기초/공통 과목
 * (field: null)은 '전체'에서만 보이고, 필터 전환 시 tbody 리마운트로 행 스태거
 * 등장을 재생한다 (교수진 탭 FacultyDirectoryGrid 패턴).
 *
 * descriptions 를 넘기면 grouped 표에 교과목 소개(설명) 열이 붙는다 — lg+ 는 과목명
 * 옆 전용 열, lg 미만은 과목명 아래 토글로 펼치는 표 폭 전체 행(가로 스크롤 없이
 * 같은 정보를 주되 기본은 접혀 있다).
 */
export function CourseCatalog({
  courses,
  columns,
  ariaLabel,
  emptyLabel,
  grouped,
  descriptions,
}: {
  courses: CatalogCourse[];
  columns: CatalogColumn[];
  ariaLabel?: string;
  emptyLabel: string;
  /** 교과목 소개 본문(+영문 과목명). 없으면 설명 열 자체가 렌더되지 않는다. */
  descriptions?: CatalogDescriptions;
  /** 그룹 에디토리얼 표(홍익대 레퍼런스 스타일) 기준 — 대형 그룹 제목 + 널찍한 행.
   *  'semester' = 학년·학기 그룹(학부, year/semester 필요),
   *  'field' = 연구 분야 그룹(대학원, field 기반. null 은 공통·기초 그룹). */
  grouped?: 'semester' | 'field';
}) {
  const t = useTranslations('research');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [semester, setSemester] = useState('all');
  // 좁은 화면 설명 펼침 상태(행 단위) — 기본은 모두 접힘. 학정번호가 중복되는 과목이
  // 있어(스페셜 토픽 등) 그룹 라벨·인덱스까지 넣은 키를 쓴다. lg 이상은 열로 보여
  // 이 상태와 무관하다.
  const [openDesc, setOpenDesc] = useState<ReadonlySet<string>>(new Set());
  const toggleDesc = (key: string) =>
    setOpenDesc((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const counts = useMemo(() => {
    const map = { all: courses.length } as Record<Filter, number>;
    for (const field of FIELDS) map[field] = 0;
    for (const course of courses) if (course.field) map[course.field] += 1;
    return map;
  }, [courses]);

  // select 옵션 — 데이터에 실제 존재하는 학년/학기만(복수 값 문자열 분해). 비면 미노출.
  const yearOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of courses) for (const n of (c.year ?? '').match(/\d+/g) ?? []) s.add(n);
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [courses]);
  const semesterOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of courses) {
      const raw = (c.semester ?? '').trim();
      // 복수 값 학기('2, 3, 4' 등)는 전학년 공통(개설 학기 구분 없음) — 옵션에 기여하지 않는다
      if (/[,&]/.test(raw)) continue;
      for (const n of raw.match(/\d+/g) ?? []) s.add(n);
    }
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [courses]);

  // 분야 필터 + 학년·학기 + 검색어(과목명·학정번호, 대소문자 무시) AND 결합
  const visible = useMemo(() => {
    let rows = filter === 'all' ? courses : courses.filter((c) => c.field === filter);
    rows = rows.filter(
      (c) =>
        matchesNum(c.year, year) &&
        // 복수 값 학기(전학년 공통)는 어느 학기를 골라도 노출 — groupInfo 해석과 동일
        (semester === 'all' ||
          /[,&]/.test((c.semester ?? '').trim()) ||
          matchesNum(c.semester, semester)),
    );
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    // 설명을 노출하는 표에서는 설명 본문·영문 과목명까지 검색 대상(플레이스홀더도 함께 바뀐다)
    return rows.filter((c) => {
      const d = descriptions?.[c.code];
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (d?.nameEn ?? '').toLowerCase().includes(q) ||
        (d?.desc ?? '').toLowerCase().includes(q)
      );
    });
  }, [courses, filter, query, year, semester, descriptions]);

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
  // 설명 열은 descriptions 를 받았고 본문이 하나라도 있을 때만. 필터 결과(visible)가
  // 아니라 전체 목록 기준 — 필터를 바꿀 때마다 열이 생겼다 사라지지 않게 한다.
  // (대학원 과목은 현재 nameEn 만 있고 desc 가 비어 있어 열이 붙지 않는다.)
  const hasDesc = useMemo(
    () => !!descriptions && courses.some((c) => descriptions[c.code]?.desc?.trim()),
    [courses, descriptions],
  );
  const searchLabel = t(hasDesc ? 'search.coursesDesc' : 'search.courses');

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

      {/* 필터 행 — 학년·학기 select(데이터 존재 시) + 과목 검색(과목명·학정번호, BoardFilterBar 돋보기 입력 패턴) */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {yearOptions.length > 0 && (
          <>
            <label htmlFor="course-year" className="sr-only">
              학년 필터
            </label>
            <select
              id="course-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-content transition-colors focus:border-yonsei-blue focus:outline-none"
            >
              <option value="all">전체 학년</option>
              {yearOptions.map((n) => (
                <option key={n} value={n}>
                  {n}학년
                </option>
              ))}
            </select>
          </>
        )}
        {semesterOptions.length > 0 && (
          <>
            <label htmlFor="course-semester" className="sr-only">
              학기 필터
            </label>
            <select
              id="course-semester"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-content transition-colors focus:border-yonsei-blue focus:outline-none"
            >
              <option value="all">전체 학기</option>
              {semesterOptions.map((n) => (
                <option key={n} value={n}>
                  {n}학기
                </option>
              ))}
            </select>
          </>
        )}
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="course-search" className="sr-only">
            {searchLabel}
          </label>
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
            placeholder={searchLabel}
            className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-content transition-colors placeholder:text-content-faint focus:border-yonsei-blue focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        /* 빈 분야 — BoardList 와 같은 독수리 마스코트 빈 상태 */
        <div className="flex flex-col items-center gap-5 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
          <span aria-hidden="true" className="eagle-mask h-20 w-20 bg-yonsei-blue/35" />
          <p className="max-w-sm text-content-soft">
            {query.trim() || year !== 'all' || semester !== 'all' ? t('search.empty') : emptyLabel}
          </p>
        </div>
      ) : grouped ? (
        /* ── 학년·학기 그룹 에디토리얼 표(홍익대 레퍼런스) ──
           대형 그룹 제목 + 종별 범례(배지) / 널찍한 행(과목명 볼드 + 학정번호 보조),
           종별은 원형 배지. key={filter+query+year+semester} 리마운트로 행 스태거 재생. */
        <div key={`${filter}-${query}-${year}-${semester}`} className="space-y-16">
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

              {/* 이름 칸이 줄바꿈되는 좁은 4열 표 — 스크롤 래퍼 없이도 안 넘친다(불필요 스크롤바 방지) */}
              <table className="mt-4 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-t-2 border-surface-border border-t-yonsei-navy">
                      <th
                        className={cn(
                          'py-3 pr-4 text-left text-xs font-bold text-content-faint',
                          // 설명 열이 있으면 과목명은 좁게 고정하고 남는 폭을 설명에 준다
                          hasDesc && 'lg:w-[28%]',
                        )}
                      >
                        {colLabel('name')}
                      </th>
                      {/* 설명 — 과목명 바로 옆(lg+ 전용 열). 좁은 화면에서는 과목 아래 별도 행 */}
                      {hasDesc && (
                        <th className="hidden px-5 py-3 text-left text-xs font-bold text-content-faint lg:table-cell">
                          {t('descColumn')}
                        </th>
                      )}
                      {hasKind && (
                        <th className="w-16 px-2 py-3 text-center text-xs font-bold text-content-faint">
                          {colLabel('kind')}
                        </th>
                      )}
                      {/* 학점 헤더는 대학원 '학점(Credits)'처럼 길어도 한 줄 유지(줄바꿈 방지) */}
                      <th className="w-20 whitespace-nowrap px-2 py-3 text-center text-xs font-bold text-content-faint">
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
                      // "한글명 (English Title)" 형태(대학원)는 영문을 보조 줄로 분리.
                      // 괄호 안에 라틴 문자가 있을 때만 — '공학수학(1)' 같은 국문 분번은
                      // 과목명의 일부라 분리하면 안 된다.
                      // 학부처럼 국문뿐이면 설명 데이터의 영문명(nameEn)으로 보충한다.
                      const m = course.name.match(/^(.+?)\s*\((.+)\)\s*$/);
                      const enTitle = m && /[A-Za-z]/.test(m[2]) ? m : null;
                      const mainName = enTitle ? enTitle[1] : course.name;
                      const info = descriptions?.[course.code];
                      const subName = enTitle ? enTitle[2] : info?.nameEn ?? null;
                      const body = info?.desc?.trim() ? info.desc : undefined;
                      // 좁은 화면 설명 — 표 폭을 다 쓰는 별도 행(과목명 셀 안에 넣으면
                      // 종별·학점 열이 자리를 잡아 두어 3~4단어마다 줄바꿈된다)을
                      // 기본 접힘으로 두고 과목명 아래 토글로 펼친다. 49행이 전부
                      // 펼쳐져 있으면 목록으로 훑기가 어렵다.
                      const rowKey = `${g.label}-${course.code}-${i}`;
                      const open = openDesc.has(rowKey);
                      const descRow = hasDesc && body ? (
                        <tr
                          key={`${rowKey}-desc`}
                          id={`desc-${rowKey}`}
                          className={cn('border-b border-surface-border lg:hidden', !open && 'hidden')}
                        >
                          <td colSpan={2 + (hasKind ? 1 : 0) + (hasHours ? 1 : 0)} className="pb-5 pr-4 align-top">
                            <p className="text-[13px] leading-relaxed text-content-soft">{body}</p>
                          </td>
                        </tr>
                      ) : null;
                      return [
                        <tr
                          key={rowKey}
                          className={cn(
                            'anim-nav-item border-b border-surface-border',
                            // 펼친 상태에서는 과목 행과 설명 행 사이 구분선을 지운다(한 과목 = 한 덩어리)
                            descRow && open && 'max-lg:border-b-0',
                          )}
                          style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                        >
                          <td className={cn('py-5 pr-4 align-top', descRow && open && 'max-lg:pb-3')}>
                            <span className="block text-base font-bold leading-snug text-content">
                              {mainName}
                            </span>
                            <span className="mt-1 block text-xs font-medium tracking-wide text-content-faint">
                              {course.code}
                              {/* 과목명에 붙어 있던 영문(대학원)은 그대로, 설명 데이터에서
                                  보충한 영문명은 좁은 화면에서 생략 — 3~4줄로 접혀 난잡해진다 */}
                              {subName &&
                                (enTitle ? (
                                  <> · {subName}</>
                                ) : (
                                  <span className="hidden lg:inline"> · {subName}</span>
                                ))}
                            </span>
                            {descRow && (
                              <button
                                type="button"
                                onClick={() => toggleDesc(rowKey)}
                                aria-expanded={open}
                                aria-controls={`desc-${rowKey}`}
                                className="mt-2.5 inline-flex items-center gap-1 rounded-[2px] border border-surface-border px-2 py-1 text-[11px] font-semibold text-content-soft transition-colors hover:border-yonsei-navy hover:text-yonsei-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-yonsei-blue lg:hidden"
                              >
                                {t(open ? 'descHide' : 'descShow')}
                                <svg
                                  viewBox="0 0 10 6"
                                  className={cn('h-1.5 w-2.5 transition-transform', open && 'rotate-180')}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  aria-hidden="true"
                                >
                                  <path d="M1 1l4 4 4-4" strokeLinecap="round" />
                                </svg>
                              </button>
                            )}
                          </td>
                          {hasDesc && (
                            <td className="hidden px-5 py-5 align-top text-sm leading-relaxed text-content-soft lg:table-cell">
                              {body ?? <span className="text-content-faint">—</span>}
                            </td>
                          )}
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
                        </tr>,
                        descRow,
                      ];
                    })}
                  </tbody>
              </table>
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
