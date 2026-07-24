'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  admitProbability,
  allocate,
  distributionFor,
  efficientFrontier,
  histogramBars,
  probabilityAtLeast,
  type AllocEntry,
} from '@/lib/mileage';
import {
  confidenceOf,
  confidenceReason,
  fetchBundle,
  fetchDetails,
  findConflicts,
  majorQuotaCount,
  searchSections,
  siblingSections,
  type MileageData,
  type Section,
  type SectionDetail,
} from '@/lib/mileage/bundle';
import type { Locale } from '@/i18n/routing';

/** 졸업요건 체커 → 마일리지 플래너 인수인계 키(사용자 지시 4) */
export const MILEAGE_HANDOFF_KEY = 'me-mileage-handoff';

export interface MileageHandoff {
  /** 체커가 계산한 "남은 과목" — 과목명 기준으로 이번 학기 개설분을 찾는다 */
  courses: { name: string; credits?: number; required?: boolean }[];
}

/** 담은 과목 하나의 계획 상태 */
interface Planned {
  /** Section.id ("CODE-DIV") */
  id: string;
  mileage: number;
  /** 졸업 필수도 1=선택 2=권장 3=필수 */
  weight: number;
}

const WEIGHT_LABELS: Record<number, { ko: string; en: string }> = {
  3: { ko: '필수', en: 'Required' },
  2: { ko: '권장', en: 'Recommended' },
  1: { ko: '선택', en: 'Elective' },
};

/** 합격 가능성 구간 — 색과 라벨 */
function levelOf(p: number, ko: boolean) {
  if (p >= 0.8) return { color: '#0F7B3E', label: ko ? '안정' : 'Safe' };
  if (p >= 0.5) return { color: '#0057A8', label: ko ? '적정' : 'Likely' };
  if (p >= 0.25) return { color: '#A16207', label: ko ? '불안' : 'Risky' };
  return { color: '#DC2626', label: ko ? '위험' : 'Unlikely' };
}

/** 데이터 부족 경고색 — 흰 배경 대비 4.82:1 로 11px 글씨에서도 WCAG AA 통과 */
const WARN_AMBER = '#A16207';
const WARN_RED = '#DC2626';

/**
 * 마일리지가 같을 때 적용되는 우선순위 기준(연세대 안내 기준).
 *
 * ⚠️ 흔한 오해 두 가지를 문구로 못박는다.
 *   · 학년은 "높을수록 유리"가 아니다 — 학년별 정원이 있는 과목에서 정원을 채우는 장치다.
 *   · 5·6번은 학점의 '양'이 아니라 '비율'이다.
 * 실제로 과거 기록에서도 컷 지점의 학년별 합격률이 2·3·4학년 73.5/72.5/72.1%로 평평해
 * 학년 효과가 식별되지 않았고, 그래서 예측 모델에 학년 보정을 넣지 않았다.
 */
const TIEBREAKERS_KO = [
  { title: '전공자 여부', body: '전공자 정원이 있는 과목에 한합니다. 전공자 자리와 비전공자 자리를 따로 채웁니다.' },
  { title: '신청 과목 수', body: '최대 6과목까지 인정. 4과목만 들을 예정이어도 6과목을 채우는 편이 유리합니다.' },
  { title: '졸업 신청 여부', body: '막학기에 졸업(수료)을 신청한 학생이 우선합니다.' },
  { title: '초수강 여부', body: '재수강생은 처음 듣는 학생에게 밀립니다.' },
  { title: '졸업학점 대비 이수학점', body: '양이 아니라 비율입니다. 졸업학점이 낮은 전공이 같은 이수학점에서 유리합니다.' },
  { title: '수강가능학점 대비 직전학기 이수학점', body: '초과 수강분은 인정되지 않아 최대 1까지만 반영됩니다.' },
  { title: '학년', body: '학년별 정원이 있는 과목에 한합니다. 학년이 높다고 유리한 것이 아니라, 학년별 정원을 채우기 위한 기준입니다.' },
];

const TIEBREAKERS_EN = [
  { title: 'Major status', body: 'Only where a major quota exists; major and non-major seats fill separately.' },
  { title: 'Number of applied courses', body: 'Up to 6 counted — filling all 6 helps even if you plan to take fewer.' },
  { title: 'Graduation application', body: 'Students applying to graduate take priority.' },
  { title: 'First attempt', body: 'Retakers rank below first-time takers.' },
  { title: 'Earned / required credits', body: 'A ratio, not a raw amount.' },
  { title: 'Last term credits / allowed', body: 'Capped at 1 — extra credits do not count.' },
  { title: 'Year', body: 'Only where per-year quotas exist. A higher year is NOT itself an advantage.' },
];

/**
 * 마일리지 전략 플래너.
 *
 * 진입 경로 두 가지(사용자 지시 4):
 *   ① 졸업요건 체커 결과에서 넘어오기 — sessionStorage 로 "남은 과목"을 받아 자동으로 담는다.
 *   ② 이 탭으로 바로 들어오기 — 빈 상태에서 직접 검색해 담는다.
 *
 * 계산은 전부 브라우저에서 돈다(정적 번들 + 자체 엔진). 서버 호출 없음.
 */
export function MileagePlanner({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  const [data, setData] = useState<MileageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [grade, setGrade] = useState(3);
  const [budget, setBudget] = useState(76);
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(9);
  const [fromChecker, setFromChecker] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** 상세 패널을 펼친 과목 id (한 번에 하나만) */
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  // 번들 로드
  useEffect(() => {
    let alive = true;
    fetchBundle()
      .then((d) => alive && setData(d))
      .catch((e: unknown) =>
        alive ? setLoadError(e instanceof Error ? e.message : String(e)) : undefined,
      );
    return () => {
      alive = false;
    };
  }, []);

  // 진입 경로 ① — 졸업요건 체커에서 넘어온 과목 자동 담기
  useEffect(() => {
    if (!data) return;
    let payload: MileageHandoff | null = null;
    try {
      const raw = sessionStorage.getItem(MILEAGE_HANDOFF_KEY);
      if (raw) payload = JSON.parse(raw) as MileageHandoff;
    } catch {
      payload = null;
    }
    if (!payload?.courses?.length) return;

    const picked: Planned[] = [];
    for (const want of payload.courses) {
      const norm = want.name.replace(/\s+/g, '');
      // 이번 학기 개설분 중 이름이 일치하는 분반. 여러 교수면 예측 컷이 가장 낮은 분반을 기본 제시
      const matches = data.sections.filter((s) => s.name.replace(/\s+/g, '') === norm);
      if (matches.length === 0) continue;
      const best = matches.reduce((a, b) => (b.mu < a.mu ? b : a));
      if (picked.some((p) => p.id === best.id)) continue;
      picked.push({ id: best.id, mileage: 0, weight: want.required === false ? 2 : 3 });
    }
    if (picked.length) {
      setPlanned(picked.slice(0, 10));
      setFromChecker(true);
    }
    sessionStorage.removeItem(MILEAGE_HANDOFF_KEY);
  }, [data]);

  const gradeShift = data?.gradeShift?.[String(grade)] ?? 0;

  /** 담은 과목의 Section + 계획을 합친 뷰 */
  const rows = useMemo(() => {
    if (!data) return [];
    return planned
      .map((p) => {
        const s = data.byId.get(p.id);
        return s ? { plan: p, section: s } : null;
      })
      .filter((x): x is { plan: Planned; section: Section } => x !== null);
  }, [planned, data]);

  const conflicts = useMemo(() => findConflicts(rows.map((r) => r.section)), [rows]);
  const used = planned.reduce((a, p) => a + p.mileage, 0);
  const over = used > budget;

  const dist = useMemo(
    () =>
      distributionFor(
        rows.map((r) => ({ pred: r.section, mileage: r.plan.mileage, credits: r.section.credits })),
        gradeShift,
      ),
    [rows, gradeShift],
  );
  const pTarget = probabilityAtLeast(dist, target);
  const bars = useMemo(() => histogramBars(dist, target), [dist, target]);

  const allocEntries: AllocEntry[] = useMemo(
    () => rows.map((r) => ({ pred: r.section, credits: r.section.credits, weight: r.plan.weight })),
    [rows],
  );

  // step 2 — 표본을 촘촘히 떠야 보간이 실제 곡률을 따라간다(4는 계단이 눈에 띄었다).
  // 예산 76 기준 39회 배분 계산이라 수 ms 로 끝난다.
  const frontier = useMemo(
    () => (rows.length ? efficientFrontier(allocEntries, budget, gradeShift, 2) : []),
    [allocEntries, budget, gradeShift, rows.length],
  );

  const results = useMemo(() => searchSections(data ?? ({ sections: [] } as never), query), [data, query]);

  // ── 조작 ────────────────────────────────────────────────
  const add = useCallback((s: Section) => {
    setPlanned((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, { id: s.id, mileage: 0, weight: 2 }]));
    setQuery('');
  }, []);
  const remove = (id: string) => setPlanned((prev) => prev.filter((p) => p.id !== id));
  const setMileage = (id: string, v: number) =>
    setPlanned((prev) => prev.map((p) => (p.id === id ? { ...p, mileage: Math.max(0, v) } : p)));
  const setWeight = (id: string, w: number) =>
    setPlanned((prev) => prev.map((p) => (p.id === id ? { ...p, weight: w } : p)));
  /** 교수 변경 — 같은 과목의 다른 분반으로 교체(사용자 지시 2) */
  const switchSection = (oldId: string, newId: string) =>
    setPlanned((prev) => prev.map((p) => (p.id === oldId ? { ...p, id: newId } : p)));

  const autoAllocate = () => {
    const r = allocate(allocEntries, budget, gradeShift);
    setPlanned((prev) => {
      const next = [...prev];
      rows.forEach((row, i) => {
        const idx = next.findIndex((p) => p.id === row.section.id);
        if (idx >= 0) next[idx] = { ...next[idx], mileage: r.mileages[i] };
      });
      return next;
    });
  };
  const resetAll = () => setPlanned((prev) => prev.map((p) => ({ ...p, mileage: 0 })));

  if (loadError) {
    return (
      <p className="border border-surface-border bg-surface-soft px-5 py-8 text-sm text-content-soft">
        {ko ? '마일리지 데이터를 불러오지 못했습니다. 새로고침해 주세요.' : 'Failed to load data.'}
      </p>
    );
  }

  return (
    <div>
      {/* 면책 — 상시 노출 */}
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-2 border-yonsei-navy bg-surface-soft px-4 py-3">
        <span className="bg-yonsei-navy px-2 py-0.5 text-[11px] font-bold text-white">BETA</span>
        <span className="text-[13px] font-semibold text-content">
          {ko ? '예측이며 합격을 보장하지 않습니다' : 'Predictions only — not a guarantee'}
        </span>
        <span className="text-[12px] text-content-faint">
          {ko ? '학생 제작 · 과거 수강신청 기록 기반' : 'Student-built · based on past registration records'}
        </span>
      </div>

      {/* 진입 경로 ① 안내 */}
      {fromChecker && (
        <p className="mb-5 border border-yonsei-blue/30 bg-yonsei-blue/[0.06] px-4 py-3 text-[13px] text-content">
          {ko
            ? `졸업요건 결과에서 남은 과목 ${rows.length}개를 불러왔습니다. 필요 없으면 ✕ 로 빼세요.`
            : `Imported ${rows.length} remaining course(s) from your graduation audit.`}
        </p>
      )}

      {!data ? (
        <p className="px-1 py-10 text-sm text-content-faint">{ko ? '데이터 불러오는 중…' : 'Loading…'}</p>
      ) : (
        // 좌측(내 프로필) 폭을 줄여 그만큼 가운데 배분 열을 넓혔다(사용자 지시).
        // 합을 3.0 으로 유지해 우측 리스크 열 폭은 그대로 둔다 — 1440px 기준 좌 374→304px,
        // 가운데 520→590px.
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.73fr)_minmax(0,1.42fr)_minmax(0,0.85fr)] lg:gap-6">
          {/* ─────────── 좌: 계획 담기 ─────────── */}
          <section aria-label={ko ? '과목 담기' : 'Add courses'} className="min-w-0">
            <SectionLabel>{ko ? '내 프로필' : 'Profile'}</SectionLabel>
            {/* 졸업요건 체커의 '학번 선택'과 동일한 세그먼트 토글(사용자 지시) */}
            <div className="mt-3">
              <SegmentedControl
                value={String(grade)}
                onChange={(id) => setGrade(Number(id))}
                options={[1, 2, 3, 4].map((g) => ({
                  id: String(g),
                  label: ko ? `${g}학년` : `Y${g}`,
                }))}
                ariaLabel={ko ? '학년 선택' : 'Year'}
                className="w-full"
              />
            </div>
            <p className="mb-1.5 mt-4 text-[11px] font-semibold text-content-faint">
              {ko ? '학기 예산' : 'Budget'}
            </p>
            <SegmentedControl
              value={String(budget)}
              onChange={(id) => setBudget(Number(id))}
              options={[72, 76].map((b) => ({ id: String(b), label: `${b}mp` }))}
              ariaLabel={ko ? '학기 예산 선택' : 'Budget'}
              className="w-full"
            />

            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="mt-4 flex min-h-[44px] w-full items-center justify-between border-t border-surface-border pt-3 text-left text-[12px] font-semibold text-content-faint"
            >
              {ko ? '고급 · 동점자 세부조건' : 'Advanced · tie-breakers'}
              <span aria-hidden="true">{advancedOpen ? '−' : '+'}</span>
            </button>
            {advancedOpen && (
              <div className="mt-2">
                <ol className="space-y-1.5 text-[11.5px] leading-relaxed text-content-faint">
                  {(ko ? TIEBREAKERS_KO : TIEBREAKERS_EN).map((t, i) => (
                    <li key={i}>
                      <span className="font-semibold text-content">
                        {i + 1}. {t.title}
                      </span>
                      <br />
                      {t.body}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 border-t border-surface-border pt-2 text-[11px] leading-relaxed text-content-faint">
                  {ko
                    ? '※ 마일리지가 같을 때 위 순서로 우선순위가 정해지고, 마지막에 전공자·학년 정원에 맞춰 위에서부터 확정됩니다. 과거 기록에서도 컷 지점의 학년 효과가 나타나지 않아, 예측에 학년 보정을 넣지 않았습니다.'
                    : '※ Ties are broken in this order, then major/grade quotas are applied. No grade adjustment is used — consistent with the rule that a higher year is not itself an advantage.'}
                </p>
              </div>
            )}

            <div className="mt-7">
              <SectionLabel>{ko ? '과목 담기' : 'Add courses'}</SectionLabel>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ko ? '과목명 · 학정번호 · 교수명' : 'Course, code, or professor'}
                aria-label={ko ? '과목 검색' : 'Search courses'}
                className="mt-3 h-11 w-full border border-surface-border bg-surface px-3 text-[14px] text-content outline-none focus:border-yonsei-blue"
              />
              <p className="mt-1.5 text-[11px] text-content-faint">
                {ko
                  ? `${data.sections.length.toLocaleString()}개 분반 · 교양·타전공 포함`
                  : `${data.sections.length.toLocaleString()} sections · all departments`}
              </p>

              {query.trim() && (
                <ul className="mt-2 max-h-[300px] divide-y divide-surface-border overflow-y-auto border border-surface-border">
                  {results.length === 0 && (
                    <li className="px-3 py-4 text-[12.5px] text-content-faint">
                      {ko ? '검색 결과가 없습니다.' : 'No results.'}
                    </li>
                  )}
                  {results.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => add(s)}
                        className="flex min-h-[44px] w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-soft"
                      >
                        <span className="text-[13.5px] font-semibold text-content">
                          {s.name}
                          <span className="ml-1.5 font-medium text-content-faint">{s.credits}학점</span>
                        </span>
                        <span className="text-[11.5px] text-content-faint">
                          {s.code}-{s.division} · {s.professor || (ko ? '미배정' : 'TBA')} · {s.deptName}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 미니 시간표 — 담은 과목이 있을 때만 */}
            {rows.length > 0 && (
              <div className="mt-7">
                <SectionLabel>{ko ? '미니 시간표' : 'Timetable'}</SectionLabel>
                <MiniTimetable rows={rows} ko={ko} />
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-content-faint">
                  {ko ? '겹치는 칸은 ! 로 표시됩니다' : 'Overlaps are marked with !'}
                </p>
              </div>
            )}
          </section>

          {/* ─────────── 중: 배분 ─────────── */}
          <section aria-label={ko ? '마일리지 배분' : 'Allocation'} className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>{ko ? '마일리지 배분' : 'Allocation'}</SectionLabel>
              <button
                type="button"
                onClick={resetAll}
                className="min-h-[36px] px-2 text-[12px] font-semibold text-content-faint hover:text-yonsei-blue"
              >
                ↺ {ko ? '초기화' : 'Reset'}
              </button>
            </div>

            {/* 예산 바 — 모바일에서는 하단 고정 */}
            <div className="sticky bottom-0 z-10 mt-3 border border-surface-border bg-surface px-3 py-2.5 lg:static">
              <div className="flex items-baseline justify-between">
                <span className="text-[11.5px] font-semibold text-content-faint">
                  {ko ? '배분 합계 / 학기 예산' : 'Allocated / Budget'}
                </span>
                <span
                  className="text-[15px] font-bold tabular-nums"
                  style={{ color: over ? WARN_RED : '#232323' }}
                >
                  {used} / {budget}mp
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full bg-surface-border">
                <div
                  className="h-2"
                  style={{
                    width: `${Math.min(100, (used / budget) * 100)}%`,
                    background: over ? WARN_RED : '#003377',
                  }}
                />
              </div>
              {over && (
                <p className="mt-1.5 text-[11.5px] font-semibold" style={{ color: WARN_RED }}>
                  {ko ? `예산을 ${used - budget}mp 초과했습니다.` : `Over budget by ${used - budget}mp.`}
                </p>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="mt-4 border border-dashed border-surface-border px-5 py-12 text-center">
                <p className="text-[13.5px] font-semibold text-content">
                  {ko ? '담은 과목이 없습니다' : 'No courses yet'}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-content-faint">
                  {ko
                    ? '왼쪽에서 과목을 검색해 담으면 여기에 배분 슬라이더와 실시간 확률이 나타납니다.'
                    : 'Search on the left to add courses.'}
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {rows.map(({ plan, section }) => {
                  const p = admitProbability(section, plan.mileage, gradeShift);
                  const lv = levelOf(p, ko);
                  const conf = confidenceOf(section);
                  const reason = confidenceReason(section, ko);
                  const conflictWith = conflicts.get(section.id);
                  const siblings = siblingSections(data, section.code);
                  return (
                    <li key={plan.id} className="border border-surface-border px-3.5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-content">
                            {section.name}
                            <span className="ml-1.5 text-[12px] font-medium text-content-faint">
                              {section.credits}학점
                            </span>
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-content-faint">
                            {section.code}-{section.division} · {section.deptName}
                          </p>

                          {/* 담당 교수 — 여러 분반이면 선택 가능(사용자 지시 2) */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold text-content-faint">
                              {ko ? '담당 교수' : 'Professor'}
                            </span>
                            {siblings.length > 1 ? (
                              <select
                                value={section.id}
                                onChange={(e) => switchSection(section.id, e.target.value)}
                                aria-label={`${section.name} ${ko ? '분반 선택' : 'section'}`}
                                className="min-h-[36px] max-w-[220px] border border-surface-border bg-surface px-2 text-[12px] text-content"
                              >
                                {siblings.map((sb) => (
                                  <option key={sb.id} value={sb.id}>
                                    {sb.division} · {sb.professor || (ko ? '미배정' : 'TBA')}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[12px] font-semibold text-content">
                                {section.professor || (ko ? '미배정' : 'TBA')}
                              </span>
                            )}
                            {siblings.length > 1 && (
                              <span className="text-[10.5px] text-content-faint">
                                {ko ? '교수별로 예측이 다릅니다' : 'Predictions differ by professor'}
                              </span>
                            )}
                          </div>

                          {/* 졸업 필수도 */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-content-faint">
                              {ko ? '졸업 필수도' : 'Priority'}
                            </span>
                            {[3, 2, 1].map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => setWeight(plan.id, w)}
                                aria-pressed={plan.weight === w}
                                className={cn(
                                  'min-h-[32px] border px-2 text-[11.5px] font-semibold',
                                  plan.weight === w
                                    ? 'border-yonsei-navy bg-yonsei-navy text-white'
                                    : 'border-surface-border bg-surface text-content-faint',
                                )}
                              >
                                {ko ? WEIGHT_LABELS[w].ko : WEIGHT_LABELS[w].en}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(plan.id)}
                          aria-label={`${section.name} ${ko ? '제거' : 'remove'}`}
                          className="grid h-[30px] w-[30px] shrink-0 place-items-center border border-surface-border bg-surface text-[13px] text-content-faint hover:text-content"
                        >
                          ✕
                        </button>
                      </div>

                      {/* 경고 배지 — 같은 형태, 색만 다름 */}
                      {(conflictWith || conf !== 'high') && (
                        <div className="mt-2.5 flex flex-wrap gap-[7px]">
                          {conflictWith && (
                            <WarnBadge color={WARN_RED} icon="calendar">
                              {ko ? '시간 충돌' : 'Time conflict'} · {conflictWith.join(', ')}
                            </WarnBadge>
                          )}
                          {conf !== 'high' && reason && (
                            <WarnBadge color={WARN_AMBER} icon="alert">
                              {ko ? '데이터 부족' : 'Limited data'} · {reason}
                            </WarnBadge>
                          )}
                        </div>
                      )}

                      {/* 슬라이더 + 확률 */}
                      <div className="mt-3 flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-baseline justify-between">
                            <span className="text-[11px] text-content-faint">{ko ? '마일리지' : 'Mileage'}</span>
                            <span className="text-[11px] text-content-faint">
                              {ko ? '예측 컷' : 'Est. cutoff'} ~{Math.round(section.mu)}mp
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={section.maxMileage}
                            value={plan.mileage}
                            onChange={(e) => setMileage(plan.id, Number(e.target.value))}
                            aria-label={`${section.name} ${ko ? '마일리지' : 'mileage'}`}
                            aria-valuetext={`${plan.mileage}mp, ${Math.round(p * 100)}%`}
                            className="h-11 w-full accent-yonsei-navy"
                          />
                        </div>
                        <div className="w-[62px] shrink-0 text-right">
                          <span
                            style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
                            className="text-[24px] font-bold text-content"
                          >
                            {plan.mileage}
                          </span>
                          <span className="text-[11px] text-content-faint"> mp</span>
                        </div>
                        <div className="w-[92px] shrink-0 text-right">
                          <div
                            style={{
                              color: lv.color,
                              fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif',
                            }}
                            className="text-[24px] font-bold leading-none"
                          >
                            {Math.round(p * 100)}%
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1">
                            <span aria-hidden="true" className="inline-block h-[7px] w-[7px]" style={{ background: lv.color }} />
                            <span className="text-[11px] font-semibold" style={{ color: lv.color }}>
                              {lv.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-surface-border">
                        <div className="h-1.5" style={{ width: `${p * 100}%`, background: lv.color }} />
                      </div>

                      {/* 상세 — 기본 통계 / 정원·규정 / 과거 이력 (열 때만 1MB 상세 데이터를 받는다) */}
                      <button
                        type="button"
                        onClick={() => setOpenDetail((v) => (v === plan.id ? null : plan.id))}
                        aria-expanded={openDetail === plan.id}
                        className="mt-2.5 flex min-h-[36px] w-full items-center justify-between text-left text-[11.5px] font-semibold text-content-faint hover:text-yonsei-blue"
                      >
                        {ko ? '정원 · 규정 · 과거 이력 보기' : 'Quotas, rules & history'}
                        <span aria-hidden="true">{openDetail === plan.id ? '−' : '+'}</span>
                      </button>
                      {openDetail === plan.id && <SectionDetailPanel section={section} ko={ko} />}
                    </li>
                  );
                })}
              </ul>
            )}
            {rows.length > 0 && (
              <>
                {/* 실전 조언 — 담은 과목이 6개 미만이면 알린다.
                    전공 과목은 상한(18·12)이 낮아 "모두가 상한을 걸어" 상한이 곧 컷이 되는 일이
                    잦은데, 그때 승부는 마일리지가 아니라 신청 과목 수에서 갈린다. */}
                {rows.length < 6 && (
                  <div
                    className="mt-4 border-l-2 bg-surface-soft px-3.5 py-3"
                    style={{ borderColor: WARN_AMBER }}
                  >
                    <p className="text-[12.5px] font-bold" style={{ color: WARN_AMBER }}>
                      {ko ? `신청 과목이 ${rows.length}개입니다 — 6개를 채우세요` : `Only ${rows.length} courses — fill all 6`}
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-content-soft">
                      {ko
                        ? '전공 과목은 상한(18·12mp)이 낮아 모두가 상한을 걸면 상한이 곧 컷이 됩니다. 이때는 마일리지가 아니라 신청 과목 수로 순위가 갈리므로, 실제로 4과목만 들을 계획이어도 6과목을 채워 두는 편이 유리합니다.'
                        : 'When everyone bids the cap, the tie is broken by how many courses you applied to — fill all 6 even if you plan to take fewer.'}
                    </p>
                  </div>
                )}
                <p className="mt-4 text-[12px] leading-relaxed text-content-faint">
                  {ko
                    ? '슬라이더를 움직이면 확률과 예산 바가 즉시 반응합니다 · 자동 배분 후에도 언제든 다시 조정할 수 있어요.'
                    : 'Move a slider and everything updates instantly.'}
                </p>
              </>
            )}
          </section>

          {/* ─────────── 우: 리스크 ─────────── */}
          <section aria-label={ko ? '리스크' : 'Risk'} className="min-w-0">
            <SectionLabel>{ko ? '리스크' : 'Risk'}</SectionLabel>

            <div className="mt-3 border border-surface-border px-3.5 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11.5px] font-semibold text-content-faint">
                  {ko ? `목표 ${target}학점 이상 확보 확률` : `P(≥ ${target} credits)`}
                </span>
              </div>
              <p
                style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
                className="mt-1 text-[38px] font-bold leading-none text-yonsei-navy"
              >
                {Math.round(pTarget * 100)}%
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-content-faint">
                  {ko ? '목표 학점' : 'Target'}
                </span>
                {[6, 9, 12, 15].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTarget(t)}
                    aria-pressed={target === t}
                    className={cn(
                      'min-h-[32px] border px-2 text-[11.5px] font-semibold',
                      target === t
                        ? 'border-yonsei-navy bg-yonsei-navy text-white'
                        : 'border-surface-border bg-surface text-content-faint',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-content-faint">
                {ko
                  ? `기대 확보 ${dist.expected.toFixed(1)}학점 · 가장 그럴듯한 결과 ${dist.mode}학점`
                  : `Expected ${dist.expected.toFixed(1)} · most likely ${dist.mode}`}
              </p>
              {/* 목표가 담은 과목 총 학점을 넘으면 0%가 당연한데, 안내가 없으면 오해를 부른다 */}
              {rows.length > 0 && target > dist.totalCredits && (
                <p className="mt-1.5 text-[11px] font-semibold" style={{ color: WARN_AMBER }}>
                  {ko
                    ? `담은 과목이 총 ${dist.totalCredits}학점이라 목표 ${target}학점에는 도달할 수 없습니다. 과목을 더 담아 보세요.`
                    : `Only ${dist.totalCredits} credits added — the ${target}-credit target is unreachable.`}
                </p>
              )}
            </div>

            {/* 확보 학점 분포 */}
            {bars.length > 0 && (
              <div className="mt-4 border border-surface-border px-3.5 py-4">
                <p className="text-[11.5px] font-semibold text-content-faint">
                  {ko ? '확보 학점 분포' : 'Credit distribution'}
                </p>
                {/* li 에 h-full 을 주어야 자식 막대의 height:% 가 해소된다
                    (부모 높이가 확정되지 않으면 백분율 높이가 0으로 접힌다) */}
                <ul className="mt-3 flex h-[110px] gap-[3px]">
                  {bars.map((b) => {
                    const peak = Math.max(...bars.map((x) => x.p));
                    return (
                      <li
                        key={b.credits}
                        className="flex h-full min-w-0 flex-1 flex-col justify-end"
                        title={`${b.credits}${ko ? '학점' : ' cr'} ${Math.round(b.p * 100)}%`}
                      >
                        <div
                          style={{
                            height: `${Math.max(3, (b.p / (peak || 1)) * 88)}%`,
                            background: b.meetsTarget ? '#003377' : '#C9D4E2',
                          }}
                        />
                        <span className="mt-1 block truncate text-center text-[9.5px] text-content-faint">
                          {b.credits}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-[10.5px] text-content-faint">
                  {ko ? '진한 막대 = 목표 이상' : 'Dark = meets target'}
                </p>
              </div>
            )}

            {/* 자동 배분 + 프론티어 */}
            <button
              type="button"
              onClick={autoAllocate}
              disabled={rows.length === 0}
              className="mt-4 min-h-[48px] w-full bg-yonsei-navy px-4 text-[14px] font-bold text-white transition-colors hover:bg-yonsei-blue disabled:bg-surface-border disabled:text-content-faint"
            >
              {ko ? '예산 자동 배분' : 'Auto-allocate budget'}
            </button>

            {frontier.length > 1 && (
              <div className="mt-4 border border-surface-border px-3.5 py-4">
                {/* "효율적 프론티어"는 경제학 용어라 학생에게 읽히지 않는다 — 평범한 질문으로 */}
                <p className="text-[12.5px] font-bold text-content">
                  {ko ? '마일리지를 더 걸면 이득일까?' : 'Is spending more worth it?'}
                </p>
                <BudgetCurve points={frontier} budget={budget} used={used} ko={ko} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** 섹션 라벨 — 사이트 공통 네이비 사각 라벨 + 헤어라인 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h3
        style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
        className="inline-block shrink-0 bg-yonsei-navy px-3.5 py-1.5 text-sm font-semibold text-white"
      >
        {children}
      </h3>
      <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />
    </div>
  );
}


/** 경고 배지 — 시간 충돌(빨강)과 데이터 부족(노랑)이 같은 형태를 공유한다 */
function WarnBadge({
  color,
  icon,
  children,
}: {
  color: string;
  icon: 'calendar' | 'alert';
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-[5px] border bg-surface px-[9px] py-1 text-[11px] font-semibold"
      style={{ borderColor: color, color }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        aria-hidden="true"
      >
        {icon === 'calendar' ? (
          <>
            <rect x="4" y="5" width="16" height="16" />
            <path d="M4 10h16M9 3v4M15 3v4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M12 3 2 20h20L12 3z" strokeLinejoin="round" />
            <path d="M12 9v5M12 17.5v.5" strokeLinecap="round" />
          </>
        )}
      </svg>
      {children}
    </span>
  );
}

/**
 * 단조 3차 에르미트 보간(Fritsch–Carlson)으로 부드러운 SVG path 를 만든다.
 *
 * 왜 일반 스플라인(Catmull–Rom 등)을 쓰지 않는가: 예산-성과 곡선은 정의상 단조 증가다
 * (예산을 더 줘서 기대 학점이 줄 수는 없다). 일반 스플라인은 구간에 따라 오버슛이 생겨
 * 곡선이 잠깐 내려갔다 올라오는데, 그러면 "예산을 늘렸더니 손해"라는 없는 사실을 그리게 된다.
 * Fritsch–Carlson 은 접선 크기를 제한해 오버슛을 원천 차단하므로 부드러우면서도 거짓말하지 않는다.
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  if (n === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  // 구간 기울기
  const dx: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x;
    dx.push(h);
    delta.push(h === 0 ? 0 : (pts[i + 1].y - pts[i].y) / h);
  }

  // 초기 접선 = 인접 구간 기울기의 평균
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

  // Fritsch–Carlson 제한 — 평평한 구간은 접선을 0으로 눕히고, 나머지는 반지름 3 안으로 축소
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }

  // 에르미트 접선을 3차 베지에 제어점으로 변환
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const c1x = pts[i].x + h;
    const c1y = pts[i].y + m[i] * h;
    const c2x = pts[i + 1].x - h;
    const c2y = pts[i + 1].y - m[i + 1] * h;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

/**
 * 분반 상세 — 기본 통계 / 정원·규정 / 과거 이력 (사용자 지시 4).
 * 상세 데이터(1MB)는 이 패널을 처음 열 때만 받는다.
 */
function SectionDetailPanel({ section, ko }: { section: Section; ko: boolean }) {
  const [detail, setDetail] = useState<SectionDetail | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchDetails()
      .then((all) => {
        if (!alive) return;
        setDetail(all[section.id] ?? null);
        setState('idle');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [section.id]);

  if (state === 'loading') {
    return <p className="mt-2 text-[11.5px] text-content-faint">{ko ? '불러오는 중…' : 'Loading…'}</p>;
  }
  if (state === 'error') {
    return <p className="mt-2 text-[11.5px] text-content-faint">{ko ? '상세를 불러오지 못했습니다.' : 'Failed to load.'}</p>;
  }
  if (!detail) {
    return <p className="mt-2 text-[11.5px] text-content-faint">{ko ? '이 분반의 과거 자료가 없습니다.' : 'No records.'}</p>;
  }

  const { stats, rules, history, perGrade, tieCredit } = detail;
  const profHist = detail.professorHistory ?? [];
  const majorN = majorQuotaCount(rules.majorQuota);
  const rate =
    stats?.applicants && stats?.capacity ? (stats.applicants / stats.capacity).toFixed(2) : null;

  return (
    <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
      {/* ① 기본 통계 */}
      <div>
        <DetailHead>{ko ? '기본 통계' : 'Statistics'}</DetailHead>
        {stats ? (
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] sm:grid-cols-4">
            <Stat label={ko ? '정원' : 'Cap.'} value={stats.capacity} />
            <Stat label={ko ? '신청' : 'Applied'} value={stats.applicants} />
            <Stat label={ko ? '경쟁률' : 'Ratio'} value={rate ? `${rate}:1` : null} />
            <Stat label={ko ? '평균 배점' : 'Avg'} value={stats.avg} />
            <Stat label={ko ? '최고 배점' : 'Max bid'} value={stats.max} />
            <Stat label={ko ? '기준 학기' : 'Term'} value={fmtTerm(stats.semester, ko)} />
          </dl>
        ) : (
          <p className="mt-1 text-[11px] text-content-faint">{ko ? '자료 없음' : 'No data'}</p>
        )}
      </div>

      {/* ② 정원 & 규정 */}
      <div>
        <DetailHead>{ko ? '정원 & 규정' : 'Quotas & rules'}</DetailHead>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] sm:grid-cols-4">
          <Stat label={ko ? '배점 상한' : 'Max mileage'} value={rules.maxAllowed ? `${rules.maxAllowed}mp` : null} />
          <Stat label={ko ? '전공자 정원' : 'Major seats'} value={majorN !== null ? (majorN > 0 ? `${majorN}석` : ko ? '없음' : 'none') : null} />
        </dl>
        {rules.yearQuotas ? (
          <div className="mt-2">
            <p className="text-[11px] font-semibold text-content-faint">
              {ko ? '학년별 정원' : 'Seats by year'}
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {['1', '2', '3', '4'].map((g) => {
                const seats = rules.yearQuotas?.[g] ?? 0;
                const pg = perGrade?.[g];
                return (
                  <li
                    key={g}
                    className={cn(
                      'border px-2 py-1 text-[11px]',
                      seats > 0 ? 'border-surface-border bg-surface' : 'border-surface-border bg-surface-soft text-content-faint',
                    )}
                  >
                    <b className="font-bold">{g}{ko ? '학년' : 'Y'}</b>{' '}
                    {seats > 0 ? `${seats}${ko ? '석' : ''}` : ko ? '배정 없음' : '—'}
                    {pg && <span className="ml-1 text-yonsei-blue">· {ko ? '컷' : 'cut'} {pg.cut}mp</span>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-content-faint">
              {ko
                ? '학년별로 정원을 따로 채우므로 같은 분반이어도 학년마다 컷이 다릅니다.'
                : 'Seats fill per year, so the cutoff differs by year.'}
            </p>
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-content-faint">
            {ko ? '학년 제한 없음 — 전 학년이 같은 정원에서 경쟁합니다.' : 'No per-year quota.'}
          </p>
        )}
        {tieCredit && (
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-content-faint">
            {ko
              ? `동점(컷과 같은 배점)에서 갈린 총이수학점 비율: 합격 최저 ${(tieCredit.winMin * 100).toFixed(0)}%`
              : `Tie broken at earned-credit ratio ≥ ${(tieCredit.winMin * 100).toFixed(0)}%`}
            {tieCredit.loseMax !== null &&
              (ko
                ? ` · 탈락 최고 ${(tieCredit.loseMax * 100).toFixed(0)}%`
                : ` (lost up to ${(tieCredit.loseMax * 100).toFixed(0)}%)`)}
          </p>
        )}
      </div>

      {/* ③ 과거 이력 — 학생은 분반 번호가 아니라 담당 교수를 보고 고르므로,
             "이 교수의 이 과목 이력"이 주가 된다(예측 모델이 쓰는 자료와도 일치). */}
      <div>
        <DetailHead>
          {ko ? `과거 이력 · ${section.professor || '담당 미정'}` : `History · ${section.professor || 'TBA'}`}
        </DetailHead>
        {profHist.length > 0 ? (
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[300px] border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-t border-surface-border text-content-faint">
                  <th scope="col" className="py-1 text-left font-semibold">{ko ? '학기' : 'Term'}</th>
                  <th scope="col" className="py-1 text-left font-semibold">{ko ? '분반' : 'Sec.'}</th>
                  <th scope="col" className="py-1 text-right font-semibold">{ko ? '컷' : 'Cut'}</th>
                  <th scope="col" className="py-1 text-right font-semibold">{ko ? '정원' : 'Cap.'}</th>
                  <th scope="col" className="py-1 text-right font-semibold">{ko ? '신청' : 'Applied'}</th>
                </tr>
              </thead>
              <tbody>
                {profHist.map(([term, div, cut, cap, app], i) => (
                  <tr key={`${term}-${div}`} className="border-b border-surface-border">
                    <td className="py-1">
                      {fmtTerm(term, ko)}
                      {i === 0 && (
                        <span className="ml-1 bg-yonsei-navy px-1 py-px text-[9px] font-bold text-white">
                          {ko ? '최신' : 'latest'}
                        </span>
                      )}
                    </td>
                    <td className="py-1">
                      {div}
                      {ko ? '분반' : ''}
                      {div !== section.division && (
                        <span className="ml-1 text-[9.5px] text-content-faint">
                          {ko ? '(당시)' : '(then)'}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right font-bold tabular-nums text-content">{cut}mp</td>
                    <td className="py-1 text-right tabular-nums text-content-faint">{cap ?? '—'}</td>
                    <td className="py-1 text-right tabular-nums text-content-faint">{app ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {profHist.some(([, d]) => d !== section.division) && (
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-content-faint">
                {ko
                  ? '분반을 옮긴 학기도 함께 봅니다 — 담당 교수가 같으면 경쟁 양상이 이어지는 편입니다.'
                  : 'Terms in other sections are included — the same professor tends to draw similar demand.'}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: WARN_AMBER }}>
            {ko
              ? `${section.professor || '이 교수'}는 이 과목을 처음 맡습니다 — 과거 기록이 없어 같은 과목의 평균으로 추정했습니다.`
              : `First time teaching this course — estimated from the course average.`}
          </p>
        )}
      </div>

      {/* 이 분반 자체의 기록(담당이 달랐던 학기 포함) — 정원 변화 등 맥락용 보조 자료 */}
      <div>
        <DetailHead>{ko ? '이 분반의 기록 (참고)' : 'This section (reference)'}</DetailHead>
        {history.length ? (
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[300px] border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-t border-surface-border text-content-faint">
                  <th scope="col" className="py-1 text-left font-semibold">{ko ? '학기' : 'Term'}</th>
                  <th scope="col" className="py-1 text-left font-semibold">{ko ? '담당' : 'Prof.'}</th>
                  <th scope="col" className="py-1 text-right font-semibold">{ko ? '컷' : 'Cut'}</th>
                  <th scope="col" className="py-1 text-right font-semibold">{ko ? '정원' : 'Cap.'}</th>
                  <th scope="col" className="py-1 text-right font-semibold">{ko ? '신청' : 'Applied'}</th>
                </tr>
              </thead>
              <tbody>
                {history.map(([term, cut, cap, app, prof], i) => {
                  // 담당 교수가 확인되고 지금 교수와 다르면 "남의 기록"이다 — 흐리게 처리하고 표시한다
                  const other = !!prof && !!section.professor && prof !== section.professor;
                  return (
                    <tr key={term} className="border-b border-surface-border">
                      <td className={cn('py-1', other && 'text-content-faint')}>
                        {fmtTerm(term, ko)}
                        {i === 0 && (
                          <span className="ml-1 bg-yonsei-navy px-1 py-px text-[9px] font-bold text-white">
                            {ko ? '최신' : 'latest'}
                          </span>
                        )}
                      </td>
                      <td className={cn('py-1', other ? 'text-content-faint' : 'font-semibold text-content')}>
                        {prof ?? '—'}
                        {other && (
                          <span className="ml-1 text-[9.5px]" style={{ color: WARN_AMBER }}>
                            {ko ? '(다른 교수)' : '(other)'}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'py-1 text-right tabular-nums',
                          other ? 'text-content-faint' : 'font-bold text-content',
                        )}
                      >
                        {cut}mp
                      </td>
                      <td className="py-1 text-right tabular-nums text-content-faint">{cap ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums text-content-faint">{app ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="mt-1.5 text-[10.5px] leading-relaxed text-content-faint">
              {ko
                ? '이 분반 자리의 변화(정원·경쟁)를 보는 용도입니다. 예측에는 위 담당 교수 이력을 씁니다.'
                : 'Shown for seat/demand context only — the forecast uses the professor history above.'}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-content-faint">{ko ? '기록 없음' : 'No history'}</p>
        )}
      </div>
    </div>
  );
}

function DetailHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11.5px] font-bold text-content">
      <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-[3px] translate-y-px bg-yonsei-navy" />
      {children}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <dt className="text-content-faint">{label}</dt>
      <dd className="font-semibold tabular-nums text-content">{value ?? '—'}</dd>
    </div>
  );
}

/** "2025-20" → "2025년 2학기" */
function fmtTerm(t: string, ko: boolean): string {
  const [y, s] = t.split('-');
  const n = s === '10' ? 1 : s === '11' ? 0 : s === '21' ? 0 : 2;
  if (!n) return ko ? `${y} 계절` : `${y} season`;
  return ko ? `${y}년 ${n}학기` : `${y} S${n}`;
}

/** 시간표 칸 색 — 브랜드 블루 계열만 쓴다(금색 금지). 담은 순서대로 순환. */
const SLOT_COLORS = [
  { bg: '#003377', fg: '#FFFFFF' },
  { bg: '#0057A8', fg: '#FFFFFF' },
  { bg: '#2E86D6', fg: '#FFFFFF' },
  { bg: '#5AA0DE', fg: '#FFFFFF' },
  { bg: '#9CC4E9', fg: '#003377' },
  { bg: '#C9DDF2', fg: '#003377' },
];

/**
 * 미니 주간 시간표.
 *
 * 담은 과목의 강의시간(원문 파싱 결과)을 요일×교시 격자에 얹어, 시간이 겹치는 칸을
 * 빨간 테두리로 드러낸다. 충돌 "판정"은 이미 카드의 경고 배지가 하지만, 어디가 어떻게
 * 겹치는지는 격자로 봐야 납득이 된다.
 *
 * 강의시간 표기가 제각각이라 파싱에 실패하는 과목이 있다 — 그런 과목은 조용히 빠뜨리지 않고
 * 아래에 따로 명시한다(빠뜨리면 "내 과목이 시간표에 없다"는 혼란이 생긴다).
 */
function MiniTimetable({
  rows,
  ko,
}: {
  rows: { plan: Planned; section: Section }[];
  ko: boolean;
}) {
  const DAY_LABELS = ko ? ['월', '화', '수', '목', '금'] : ['M', 'T', 'W', 'T', 'F'];
  const withSlots = rows.filter((r) => r.section.slots.length > 0);
  const noSlots = rows.filter((r) => r.section.slots.length === 0);

  if (rows.length === 0) return null;

  // 실제 쓰이는 교시 범위만 그린다(1~9 를 통째로 그리면 대부분 빈칸이라 읽기 나쁘다)
  const periods = withSlots.flatMap((r) => r.section.slots.map((s) => s.period));
  const minP = periods.length ? Math.min(...periods) : 1;
  const maxP = periods.length ? Math.max(...periods) : 6;

  /** cell[day][period] = 그 칸을 점유한 과목 인덱스들 */
  const cell = new Map<string, number[]>();
  withSlots.forEach((r, i) => {
    for (const s of r.section.slots) {
      if (s.day > 4) continue; // 주말은 격자에서 생략(드물고 폭만 먹는다)
      const k = `${s.day}:${s.period}`;
      const cur = cell.get(k);
      if (cur) cur.push(i);
      else cell.set(k, [i]);
    }
  });

  return (
    <div className="mt-3">
      <div className="grid grid-cols-[18px_repeat(5,minmax(0,1fr))] gap-px border border-surface-border bg-surface-border">
        {/* 헤더 */}
        <div className="bg-surface" />
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="bg-surface py-1 text-center text-[10px] font-bold text-content-faint">
            {d}
          </div>
        ))}
        {/* 교시 행 */}
        {Array.from({ length: maxP - minP + 1 }, (_, r) => minP + r).map((p) => (
          <Fragment key={p}>
            <div className="grid place-items-center bg-surface text-[9px] tabular-nums text-content-faint">
              {p}
            </div>
            {[0, 1, 2, 3, 4].map((d) => {
              const owners = cell.get(`${d}:${p}`) ?? [];
              const clash = owners.length > 1;
              const first = owners[0];
              const tone = first === undefined ? null : SLOT_COLORS[first % SLOT_COLORS.length];
              return (
                <div
                  key={d}
                  title={owners.map((i) => withSlots[i].section.name).join(' / ')}
                  // 한 칸 높이 19→49px(사용자 지시). 높아진 만큼 이름을 잘라내지 않고
                  // 줄바꿈해 보여 준다(break-keep 으로 단어 중간 끊김 방지).
                  className="min-h-[49px] overflow-hidden break-keep px-[3px] py-[3px] text-[9px] font-semibold leading-tight"
                  style={
                    tone
                      ? {
                          background: clash ? '#FDECEC' : tone.bg,
                          color: clash ? WARN_RED : tone.fg,
                          boxShadow: clash ? `inset 0 0 0 1.5px ${WARN_RED}` : undefined,
                        }
                      : { background: '#FFFFFF' }
                  }
                >
                  {clash ? '!' : (withSlots[first]?.section.name ?? '')}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      {noSlots.length > 0 && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: WARN_AMBER }}>
          {ko
            ? `시간 정보를 읽지 못한 과목: ${noSlots.map((r) => r.section.name).join(', ')} — 시간표에 표시되지 않으니 직접 확인하세요.`
            : `Time not parsed: ${noSlots.map((r) => r.section.name).join(', ')}`}
        </p>
      )}
    </div>
  );
}

/**
 * 예산-성과 곡선.
 *
 * 원래 "효율적 프론티어"라는 경제학 용어로 축도 없이 선만 그렸더니, 무엇을 보는 그래프인지
 * 읽히지 않고 끝점이 테두리에 잘렸다. 그래서 ① 이름을 평범한 말로 바꾸고 ② 양축에 눈금과
 * 단위를 달고 ③ 선·점이 잘리지 않도록 안쪽 여백을 두고 ④ 이 곡선의 진짜 메시지인
 * "어느 지점부터는 더 걸어도 거의 늘지 않는다"를 문장으로 뽑아 준다.
 */
function BudgetCurve({
  points,
  budget,
  used,
  ko,
}: {
  points: { budget: number; expected: number }[];
  budget: number;
  used: number;
  ko: boolean;
}) {
  const W = 268;
  const H = 132;
  // 눈금 글자와 점 반지름이 잘리지 않도록 안쪽 여백을 확보한다
  const PAD = { l: 30, r: 12, t: 12, b: 24 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const maxY = Math.max(1, ...points.map((p) => p.expected));
  const x = (b: number) => PAD.l + (b / Math.max(1, budget)) * innerW;
  const y = (e: number) => PAD.t + innerH - (e / maxY) * innerH;

  // 꺾인 폴리라인 대신 단조 3차 보간 — 부드럽되 오버슛(예산↑인데 학점↓)은 생기지 않는다
  const path = monotonePath(points.map((p) => ({ x: x(p.budget), y: y(p.expected) })));
  const cur = points.reduce(
    (a, p) => (Math.abs(p.budget - used) < Math.abs(a.budget - used) ? p : a),
    points[0],
  );
  // 최대치의 95% 에 처음 도달하는 예산 = 사실상 포화 지점
  const sat = points.find((p) => p.expected >= maxY * 0.95);

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={
          ko
            ? `가로축 마일리지 0부터 ${budget}, 세로축 기대 확보 학점 0부터 ${maxY.toFixed(1)}. 현재 ${used}mp에서 ${cur.expected.toFixed(1)}학점.`
            : `Budget 0–${budget}mp vs expected credits 0–${maxY.toFixed(1)}. Now ${cur.expected.toFixed(1)} at ${used}mp.`
        }
      >
        {/* 축 */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + innerH} stroke="#E0E6ED" strokeWidth="1" />
        <line
          x1={PAD.l}
          y1={PAD.t + innerH}
          x2={PAD.l + innerW}
          y2={PAD.t + innerH}
          stroke="#E0E6ED"
          strokeWidth="1"
        />
        {/* 세로 눈금 — 0 / 최대 */}
        <text x={PAD.l - 5} y={PAD.t + innerH + 3} textAnchor="end" fontSize="8.5" fill="#6E6E6E">
          0
        </text>
        <text x={PAD.l - 5} y={PAD.t + 4} textAnchor="end" fontSize="8.5" fill="#6E6E6E">
          {maxY.toFixed(1)}
        </text>
        {/* 가로 눈금 — 0 / 예산 */}
        <text x={PAD.l} y={H - 4} textAnchor="middle" fontSize="8.5" fill="#6E6E6E">
          0
        </text>
        <text x={PAD.l + innerW} y={H - 4} textAnchor="middle" fontSize="8.5" fill="#6E6E6E">
          {budget}mp
        </text>
        {/* 포화 지점 안내선 */}
        {sat && sat.budget > 0 && sat.budget < budget && (
          <line
            x1={x(sat.budget)}
            y1={PAD.t}
            x2={x(sat.budget)}
            y2={PAD.t + innerH}
            stroke="#A16207"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        {/* 곡선 */}
        <path d={path} fill="none" stroke="#0057A8" strokeWidth="2" strokeLinejoin="round" />
        {/* 현재 위치 */}
        <line
          x1={x(cur.budget)}
          y1={y(cur.expected)}
          x2={x(cur.budget)}
          y2={PAD.t + innerH}
          stroke="#003377"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <circle cx={x(cur.budget)} cy={y(cur.expected)} r="3.5" fill="#003377" />
      </svg>
      {/* 축 설명 — 그래프만 봐서는 무엇인지 모르므로 반드시 글로 남긴다 */}
      <p className="mt-1 text-[10.5px] leading-relaxed text-content-faint">
        {ko
          ? '가로 = 쓰는 마일리지 · 세로 = 기대 확보 학점'
          : 'x = mileage spent · y = expected credits'}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-content">
        {ko ? (
          <>
            지금 <b>{used}mp</b>를 걸면 평균 <b>{cur.expected.toFixed(1)}학점</b>을 확보합니다.
          </>
        ) : (
          <>
            At <b>{used}mp</b> you secure about <b>{cur.expected.toFixed(1)}</b> credits.
          </>
        )}
      </p>
      {sat && sat.budget > 0 && sat.budget < budget && (
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: WARN_AMBER }}>
          {ko
            ? `${sat.budget}mp를 넘기면 더 걸어도 거의 늘지 않습니다.`
            : `Beyond ${sat.budget}mp, extra mileage barely helps.`}
        </p>
      )}
    </>
  );
}
