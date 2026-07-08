'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { cn } from '@/lib/utils';
import type { ResearchField } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';
import coursesUndergraduate from '@content/courses-undergraduate.json';
import courseDescriptions from '@content/course-descriptions.json';

/**
 * 교과목 체계도 — 스윔레인 로드맵.
 *
 * 프로토타입의 "교과목체계도"를 사이트 문법으로 재해석한 인터랙티브 로드맵.
 * 열 = 학년·학기, 행(레인) = 분야 트랙(6분야 taxonomy + 기초·공통), 각 셀에 과목 칩.
 * 칩 클릭 시 아래 상세 패널에 과목 설명(content/course-descriptions.json)을 표시한다.
 *
 * 데이터는 CourseCatalog/EditorialTab 컨벤션대로 컴포넌트에서 직접 import 한다.
 */

interface RoadmapCourse {
  year: string;
  semester: string;
  kind: string; // 대교 | 전필 | 전선
  code: string;
  name: string;
  credits: string;
  hours: string;
  field: ResearchField | null;
}

type CourseDesc = { nameEn: string; desc: string };
const DESCRIPTIONS = courseDescriptions as Record<string, CourseDesc>;
const COURSES = coursesUndergraduate as RoadmapCourse[];

/** 레인 키 — null(기초·공통)은 문자열 'basics' 로 다룬다. */
type LaneKey = 'basics' | ResearchField;
type Filter = 'all' | ResearchField;

/** 필터 탭 순서 (research.fieldFilter 메시지 키) — 기초·공통은 탭에 넣지 않는다. */
const FIELD_TABS: ResearchField[] = [
  'bioNano',
  'thermoFluid',
  'dynamicsControl',
  'manufacturingDesign',
  'computation',
  'mechanicsMaterials',
];

/** 레인 표시 순서 (위→아래). 색은 상징색 2색 체계(네이비+골드)로 통일 —
 *  레인 구분은 색이 아니라 행 라벨·헤어라인이 담당한다 (평면 에디토리얼 톤). */
const LANES: { key: LaneKey }[] = [
  { key: 'basics' },
  { key: 'mechanicsMaterials' },
  { key: 'computation' },
  { key: 'dynamicsControl' },
  { key: 'thermoFluid' },
  { key: 'manufacturingDesign' },
  { key: 'bioNano' },
];

/** 과목의 레인 키 (field 가 null 이면 기초·공통 레인) */
function laneOf(c: RoadmapCourse): LaneKey {
  return c.field ?? 'basics';
}

/** 종별이 필수 성격인지 (전필·대교 = 채움 칩, 전선 = 테두리 칩) */
function isRequired(kind: string): boolean {
  return kind === '전필' || kind === '대교';
}

/** 학년·학기 라벨 (2줄). year 문자열은 "1" | "3 & 4" | "2, 3, 4" 등 다양 → 표시용으로 정규화 */
function columnLabel(year: string, semester: string, ko: boolean): { top: string; bottom: string } {
  const y = year.replace(/\s*&\s*/g, '·').replace(/\s*,\s*/g, '·');
  const s = semester.replace(/\s*&\s*/g, '·').replace(/\s*,\s*/g, '·');
  return ko
    ? { top: `${y}학년`, bottom: `${s}학기` }
    : { top: `Year ${y}`, bottom: `Sem ${s}` };
}

export function CurriculumRoadmap({ locale }: { locale: Locale }) {
  const t = useTranslations('research');
  const ko = locale === 'ko';
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  // 칩 선택 시 상세 패널로 부드럽게 스크롤 (해제 시엔 이동하지 않음)
  const selectCourse = (code: string) => {
    const next = selected === code ? null : code;
    setSelected(next);
    if (next) {
      requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  };

  // 열: (year, semester) 유니크 조합을 파일 순서대로
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const out: { year: string; semester: string }[] = [];
    for (const c of COURSES) {
      const id = `${c.year}__${c.semester}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ year: c.year, semester: c.semester });
      }
    }
    return out;
  }, []);

  // 분야별 과목 수 (필터 탭 건수 배지)
  const counts = useMemo(() => {
    const map = { all: COURSES.length } as Record<Filter, number>;
    for (const f of FIELD_TABS) map[f] = 0;
    for (const c of COURSES) if (c.field) map[c.field] += 1;
    return map;
  }, []);

  // 레인 × 열 → 과목 목록. 필터 적용 시 해당 분야 레인만 남긴다.
  const lanes = useMemo(() => {
    const active = LANES.filter((lane) => {
      if (filter === 'all') return true;
      return lane.key === filter;
    });
    return active
      .map((lane) => {
        const cellFor = (col: { year: string; semester: string }) =>
          COURSES.filter(
            (c) =>
              laneOf(c) === lane.key &&
              c.year === col.year &&
              c.semester === col.semester,
          );
        const cells = columns.map(cellFor);
        const total = cells.reduce((n, cell) => n + cell.length, 0);
        return { ...lane, cells, total };
      })
      .filter((lane) => lane.total > 0); // 과목 없는 레인 렌더 생략
  }, [columns, filter]);

  const selectedCourse = useMemo(
    () => (selected ? COURSES.find((c) => c.code === selected) ?? null : null),
    [selected],
  );

  const kindLabel = (kind: string) =>
    ko
      ? kind === '전필'
        ? '전공필수'
        : kind === '전선'
          ? '전공선택'
          : '대학교양'
      : kind === '전필'
        ? 'Major Required'
        : kind === '전선'
          ? 'Major Elective'
          : 'General Education';

  // 로드맵 그리드 열 = 트랙 라벨 열(고정) + 학기 열들
  const gridTemplate = `12rem repeat(${columns.length}, minmax(9.5rem, 1fr))`;

  return (
    <div>
      {/* 분야 필터 탭 — 사이트 공통 UnderlineTabs (선택 시 컬러바 슬라이드, 좁은 화면은 가로 스크롤) */}
      <div className="mb-6 overflow-x-auto">
        <UnderlineTabs
          ariaLabel={ko ? '분야 필터' : 'Field filter'}
          active={filter}
          onChange={(id) => setFilter(id as Filter)}
          tabs={(['all', ...FIELD_TABS] as Filter[]).map((id) => ({
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

      {/* 범례 + 스크롤 힌트 (상징색 2색 — 네이비 채움/테두리, 선택 = 골드) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-4 text-xs text-content-soft">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-5 rounded-[2px] bg-yonsei-navy" />
            {ko ? '채움 — 전공필수·대학교양' : 'Filled — Required · General'}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-5 rounded-[2px] border border-yonsei-navy/40 bg-surface" />
            {ko ? '테두리 — 전공선택' : 'Outlined — Elective'}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-5 rounded-[2px] border-2 border-yonsei-gold bg-surface" />
            {ko ? '골드 — 선택된 과목' : 'Gold — Selected'}
          </li>
        </ul>
        <p className="text-xs text-content-faint lg:hidden">
          {ko ? '좌우로 스크롤하세요' : 'Scroll horizontally'}
        </p>
      </div>

      {/* 로드맵 — 가로 스크롤 래퍼. 평면 에디토리얼: 필 박스 대신 룰(선)과 타이포로 구조화 */}
      <div className="overflow-x-auto pb-2">
        {/* key={filter} 로 필터 전환 시 레인 스태거 등장을 재트리거 */}
        <div key={filter} className="min-w-[820px]">
          {/* 헤더 행: 표 thead 문법 — 텍스트 + 굵은 네이비 상단 룰 */}
          <div
            className="grid gap-2 border-b-2 border-yonsei-navy pb-2"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div aria-hidden="true" />
            {columns.map((col, i) => {
              const label = columnLabel(col.year, col.semester, ko);
              return (
                <div
                  key={`${col.year}-${col.semester}-${i}`}
                  className="text-center leading-tight"
                >
                  <span className="block text-xs font-bold text-content">{label.top}</span>
                  <span className="block text-[0.7rem] font-medium text-content-faint">
                    {label.bottom}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 레인 행들 — 헤어라인으로 구분 */}
          <div className="divide-y divide-surface-border">
            {lanes.map((lane, laneIdx) => (
              <div
                key={lane.key}
                className="anim-nav-item grid items-stretch gap-2 py-2.5"
                style={{
                  gridTemplateColumns: gridTemplate,
                  animationDelay: `${Math.min(laneIdx, 8) * 70}ms`,
                }}
              >
                {/* 트랙 라벨: 네이비 세로 바(기초·공통은 중립 회색) + 본문색 굵은 글자 */}
                <div className="flex items-center gap-2.5 py-1">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-8 w-0.5 shrink-0',
                      lane.key === 'basics' ? 'bg-surface-border' : 'bg-yonsei-navy',
                    )}
                  />
                  <span
                    className={cn(
                      'text-sm font-bold leading-tight',
                      lane.key === 'basics' ? 'text-content-faint' : 'text-content',
                    )}
                  >
                    {t(`fieldFilter.${lane.key}`)}
                  </span>
                </div>

                {/* 셀: 학기별 과목 칩 세로 나열 */}
                {lane.cells.map((cell, colIdx) => (
                  <div key={colIdx} className="flex flex-col justify-center gap-1.5 px-1 py-1">
                    {cell.map((course) => {
                      const filled = isRequired(course.kind);
                      const isSel = selected === course.code;
                      return (
                        <button
                          key={course.code}
                          type="button"
                          onClick={() => selectCourse(course.code)}
                          aria-pressed={isSel}
                          title={`${course.code} · ${course.credits}${ko ? '학점' : ' cr'}`}
                          className={cn(
                            'rounded-[2px] border px-2 py-1.5 text-left text-xs font-semibold leading-tight outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-yonsei-blue',
                            filled
                              ? 'border-yonsei-navy bg-yonsei-navy text-white hover:border-yonsei-blue hover:bg-yonsei-blue'
                              : 'border-yonsei-navy/35 bg-surface text-content hover:border-yonsei-navy hover:text-yonsei-navy',
                            isSel && 'border-yonsei-gold ring-2 ring-yonsei-gold/60 ring-offset-1 ring-offset-surface',
                          )}
                        >
                          {course.name}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 과목 상세 패널 — 평면 에디토리얼(박스 없이 골드 상단 룰) + 선택 변경 시 페이드업 */}
      <div ref={detailRef} className="mt-8 scroll-mt-24" aria-live="polite">
        {selectedCourse ? (
          <div key={selectedCourse.code} className="anim-panel border-t-2 border-yonsei-gold pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-bold tracking-tight text-content">
                {selectedCourse.name}
                {DESCRIPTIONS[selectedCourse.code]?.nameEn && (
                  <span className="ml-2 text-sm font-medium text-content-faint">
                    {DESCRIPTIONS[selectedCourse.code].nameEn}
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 text-xs font-semibold text-content-faint transition-colors hover:text-yonsei-navy"
                aria-label={ko ? '상세 닫기' : 'Close details'}
              >
                {ko ? '닫기' : 'Close'}
              </button>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-soft">
              <span className="font-semibold text-yonsei-navy">{selectedCourse.code}</span>
              <span>{selectedCourse.credits}{ko ? '학점' : ' credits'}</span>
              <span>{kindLabel(selectedCourse.kind)}</span>
            </p>
            {DESCRIPTIONS[selectedCourse.code]?.desc ? (
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-content-soft">
                {DESCRIPTIONS[selectedCourse.code].desc}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-content-faint">
            {ko ? '과목 칩을 눌러 상세 설명을 확인하세요.' : 'Select a course to see its description.'}
          </p>
        )}
      </div>
    </div>
  );
}
