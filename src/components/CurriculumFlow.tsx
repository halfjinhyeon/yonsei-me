'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { cn } from '@/lib/utils';
import {
  buildCurriculumModel,
  buildStage,
  columnLabel,
  edgeKey,
  FOCUS_DEPTH,
  G,
  isRequired,
  kindLabel as kindLabelOf,
  LANE_KEYS,
  laneOf,
  relationWeb,
  routeSet,
  colX,
  type CurriculumCourse,
  type CurriculumMapData,
  type FlowEdge,
  type LaneKey,
} from '@/lib/curriculum-map';
import type { Locale } from '@/i18n/routing';

type CoursesData = typeof import('@content/courses-undergraduate.json');
type DescriptionsData = typeof import('@content/course-descriptions.json');

/**
 * 교과목 체계도 — 스윔레인(분야 레인 × 학기 열) 위에 선수·연계 관계를 직각 화살표로
 * 얹은 이수 흐름도.
 *
 * 2026-08 재구성(디자인 확정본 `교과목 체계도.dc.html` 이관):
 *  1. **열 8 → 6.** 4학년 1·2학기 열을 3·4학년 열로 접었다.
 *  2. **배치는 손으로 정한 격자.** 칸(레인×열) 안 세로 슬롯을 course-flow.json 의
 *     `nodes[].row` 가 지정한다 — 관리자 콘솔의 '교과목 체계도' 화면이 그 값을 쓴다.
 *  3. **좌표는 계산값.** 칩 DOM 실측 대신 고정 지오메트리(@/lib/curriculum-map).
 *  4. **화살표는 '고른 과목만'.** 채널 라우터가 카드·다른 선을 피해 경로를 배정한다.
 *  5. 기본형·트리형 토글과 온보딩 말풍선 제거 — 선택 전 화면이 곧 옛 '기본형'이다.
 *
 * 판·라우터는 관리자 편집 화면(admin/CurriculumMapEditor)과 **같은 모듈**을 쓴다 —
 * "학생이 보는 그대로 고친다"가 성립하려면 좌표계가 하나여야 한다.
 *
 * 반응형: tab(700px)+ 는 스윔레인 무대(넘치면 횡스크롤), 미만은 학기별 세로 스택 +
 * 레인 그룹. 좁은 화면의 관계는 ① 선택 시 무관 과목 흐림 ② 상세 패널의 선수/후속
 * 목록(누르면 점프)으로 표현한다 — 좁은 화면 화살표는 스파게티가 된다.
 *
 * ⚠️ 관계 데이터(content/course-flow.json)는 표준 커리큘럼 논리 초안 — 학부 검수 필요.
 */

type CourseDesc = { nameEn: string; desc: string };
type Filter = 'all' | LaneKey;

// SSR 안전 layout effect — 서버 렌더 시 useLayoutEffect 경고 회피(사이트 공통 패턴)
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const POP_W = 320;

export function CurriculumFlow({
  locale,
  courses,
  descriptions,
  flow,
}: {
  locale: Locale;
  courses: CoursesData;
  descriptions: DescriptionsData;
  /** 선수·연계 관계 + 칸 안 슬롯 (content/course-flow.json — CMS 편집 대상) */
  flow: CurriculumMapData;
}) {
  const t = useTranslations('research');
  const ko = locale === 'ko';
  // 캐스팅은 참조를 바꾸지 않으므로(같은 객체) 아래 useMemo 의 의존성으로 안전하다.
  const COURSES = courses as CurriculumCourse[];
  const DESCRIPTIONS = descriptions as Record<string, CourseDesc>;
  const EDGES = flow.edges;
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const active = selected ?? hover;

  // ── 데이터 파생 — 열·레인·칸 안 슬롯 ──────────────────────────────────
  const model = useMemo(() => {
    const rowSlots = new Map<string, number>(
      flow.nodes
        .filter((n) => typeof n.row === 'number')
        .map((n) => [n.code, n.row as number] as const),
    );
    return buildCurriculumModel(COURSES, rowSlots);
  }, [COURSES, flow.nodes]);
  const { byCode, columns, specials } = model;

  // 분야 탭 개수 — 코드 기준(중복 개설 1회). 학년 무관 과목은 기초·공통에 얹는다.
  const counts = useMemo(() => {
    const map = { all: 0 } as Record<Filter, number>;
    for (const k of LANE_KEYS) map[k] = 0;
    for (const c of byCode.values()) {
      map.all += 1;
      map[laneOf(c)] += 1;
    }
    return map;
  }, [byCode]);

  const visibleLane = useCallback((key: LaneKey) => filter === 'all' || filter === key, [filter]);

  // 보이는 레인만 쌓아 높이를 다시 잡는다(필터 시 빈 판 방지)
  const stage = useMemo(
    () => buildStage(model, { isLaneVisible: visibleLane }),
    [model, visibleLane],
  );

  // ── 관계망 + 경로 ────────────────────────────────────────────────────
  const web = useMemo(() => relationWeb(EDGES, active, FOCUS_DEPTH), [EDGES, active]);
  const lines = useMemo(() => {
    if (!active) return [];
    const drawn = web.edges.filter((e) => stage.pos.has(e.from) && stage.pos.has(e.to));
    return routeSet(stage, drawn);
  }, [active, web, stage]);

  // 상세 패널·팝오버용 선수/후속 목록
  const relations = useMemo(() => {
    if (!selected) return { prev: [] as FlowEdge[], next: [] as FlowEdge[] };
    return {
      prev: EDGES.filter((e) => e.to === selected),
      next: EDGES.filter((e) => e.from === selected),
    };
  }, [EDGES, selected]);

  const selectedCourse = selected ? byCode.get(selected) ?? null : null;

  const pick = useCallback((code: string) => {
    setSelected((cur) => (cur === code ? null : code));
    setHover(null);
  }, []);
  const clearSel = useCallback(() => {
    setSelected(null);
    setHover(null);
  }, []);

  // Esc — 선택 해제
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') clearSel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSel]);

  const kindLabel = (kind: string) => kindLabelOf(kind, ko);
  const nameOf = (code: string) => byCode.get(code)?.name ?? code;

  // ── 카드 아래 미니 상세 팝오버 — 선택 카드 좌표에 절대 배치 ─────────────
  // 아래로 여는 게 기본, 무대 바닥 근처 카드만 위로 뒤집는다. 위 플립은 transform 이
  // 아니라 0-높이 앵커 + bottom-0 으로 처리한다 — anim-panel keyframe·reduced-motion 의
  // transform 재정의와 충돌하지 않는다.
  const selCard = selected ? stage.pos.get(selected) ?? null : null;
  const popUp = selCard ? selCard.y > stage.height - 280 : false;
  const pop = useMemo(
    () =>
      selCard
        ? {
            left: Math.max(0, Math.min(selCard.x - 6, stage.width - POP_W)),
            top: popUp ? selCard.y - 10 : selCard.y + G.CARD_H + 10,
            up: popUp,
          }
        : null,
    [selCard, popUp, stage.width],
  );
  // 팝오버 높이는 설명 길이에 따라 달라져 실측이 필요하다(위치·폭은 계산값).
  const popBoxRef = useRef<HTMLDivElement | null>(null);
  const [popH, setPopH] = useState(0);
  const popTop = pop?.top ?? 0;
  useIsoLayoutEffect(() => {
    setPopH(popBoxRef.current?.getBoundingClientRect().height ?? 0);
  }, [selected, popTop, popUp]);

  // 아래로 열린 팝오버가 무대 바닥을 넘는 만큼 스페이서 — 횡스크롤 래퍼(overflow-x-auto
  // 는 세로도 auto)가 설명을 자르지 않게 한다.
  const padBottom =
    !selected || popUp || !popH ? 0 : Math.max(0, Math.ceil(popTop + popH + 8 - stage.height));

  // 팝오버가 '연결된 과목 카드'를 가리면 배경을 반투명으로 — 가려진 연결 카드가 비쳐
  // 보이게 한다(사용자 지시). 무관한 카드를 가리는 건 그대로 둔다.
  const popDim = useMemo(() => {
    if (!selected || !pop || !popH) return false;
    const top = pop.up ? pop.top - popH : pop.top;
    const box = { l: pop.left, r: pop.left + POP_W, t: top, b: top + popH };
    for (const code of web.nodes.keys()) {
      if (code === selected) continue;
      const c = stage.pos.get(code);
      if (!c) continue;
      if (c.x < box.r && c.x2 > box.l && c.y < box.b && c.y + G.CARD_H > box.t) return true;
    }
    return false;
  }, [selected, pop, popH, web, stage]);

  // ── 모바일 스택용 — 레인 × 열 목록(슬롯 순서대로) ─────────────────────
  const mobileLanes = useMemo(
    () =>
      LANE_KEYS.map((key, li) => ({
        key,
        cells: columns.map((_, ci) =>
          model.cards
            .filter((c) => c.laneIdx === li && c.col === ci)
            .sort((a, b) => a.row - b.row)
            .map((c) => c.course),
        ),
      }))
        .filter((lane) => visibleLane(lane.key))
        .filter((lane) => lane.cells.some((cell) => cell.length > 0)),
    [model.cards, columns, visibleLane],
  );

  const statusText = selected
    ? ko
      ? `선택 — ${nameOf(selected)} · 관계 ${lines.length}개`
      : `Selected — ${nameOf(selected)} · ${lines.length} link${lines.length === 1 ? '' : 's'}`
    : ko
      ? '과목을 누르면 관계 표시'
      : 'Select a course to show its links';

  /** 좁은 화면 스택·공통 과목용 칩 — 무대 카드와 달리 흐름 배치 */
  const renderStackChip = (course: CurriculumCourse) => {
    const filled = isRequired(course.kind);
    const isSel = selected === course.code;
    const dim = selected ? !web.nodes.has(course.code) : false;
    return (
      <button
        key={course.code}
        type="button"
        onClick={() => pick(course.code)}
        aria-pressed={isSel}
        title={`${course.code} · ${course.credits}${ko ? '학점' : ' cr'} · ${kindLabel(course.kind)}`}
        className={cn(
          'rounded-[2px] border px-2 py-1.5 text-left text-xs font-semibold leading-tight outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-yonsei-blue',
          filled
            ? 'border-yonsei-navy bg-yonsei-navy text-white hover:border-yonsei-blue hover:bg-yonsei-blue'
            : 'border-yonsei-navy/35 bg-surface text-content hover:border-yonsei-navy hover:text-yonsei-navy',
          isSel && 'border-yonsei-blue ring-2 ring-yonsei-blue/60 ring-offset-1 ring-offset-surface',
          dim && 'opacity-30',
        )}
      >
        {course.name}
      </button>
    );
  };

  return (
    <div>
      {/* 분야 필터 탭(좌) + 상태 문구·선택 해제(우) */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-[30rem] overflow-x-auto">
          <UnderlineTabs
            ariaLabel={ko ? '분야 필터' : 'Field filter'}
            active={filter}
            onChange={(id) => {
              setFilter(id as Filter);
              clearSel();
            }}
            tabs={(['all', ...LANE_KEYS] as Filter[]).map((id) => ({
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

        <div className="flex shrink-0 items-center gap-2.5 pb-2.5">
          <span
            aria-live="polite"
            className={cn(
              'text-xs',
              selected ? 'font-semibold text-yonsei-navy' : 'font-medium text-content-faint',
            )}
          >
            {statusText}
          </span>
          <button
            type="button"
            onClick={clearSel}
            className={cn(
              'shrink-0 border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue',
              selected
                ? 'border-yonsei-navy text-yonsei-navy hover:bg-yonsei-navy hover:text-white'
                : 'border-surface-border text-content-faint hover:border-yonsei-navy hover:text-yonsei-navy',
            )}
          >
            {ko ? '선택 해제' : 'Clear'}
          </button>
        </div>
      </div>

      {/* 범례 — 칩 문법 + 화살표 문법(화살표는 tab+ 무대에만 그려진다) */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-content-soft">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded-[2px] bg-yonsei-navy" />
          {ko ? '채움 — 전공필수 · 대학교양' : 'Filled — Required · General'}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-5 rounded-[2px] border border-yonsei-navy/40 bg-surface"
          />
          {ko ? '테두리 — 전공선택' : 'Outlined — Elective'}
        </span>
        <span className="hidden items-center gap-1.5 tab:flex">
          <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
            <line x1="1" y1="4" x2="19" y2="4" stroke="#0057A8" strokeWidth="1.6" />
            <path d="M18 1.6 L22.5 4 L18 6.4 Z" fill="#0057A8" />
          </svg>
          {ko ? '실선 — 선수 · 직결' : 'Solid — prerequisite'}
        </span>
        <span className="hidden items-center gap-1.5 tab:flex">
          <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
            <line
              x1="1"
              y1="4"
              x2="19"
              y2="4"
              stroke="#0057A8"
              strokeWidth="1.6"
              strokeDasharray="3 3"
            />
            <path d="M18 1.6 L22.5 4 L18 6.4 Z" fill="#0057A8" />
          </svg>
          {ko ? '점선 — 연계 · 권장' : 'Dashed — related'}
        </span>
      </div>

      {/* ── 모바일·좁은 화면(< tab): 학기별 세로 스택 + 레인 그룹 ── */}
      <div key={`m-${filter}`} className="border-t-2 border-yonsei-navy tab:hidden">
        {columns.map((col, colIdx) => {
          const lanesHere = mobileLanes.filter((lane) => lane.cells[colIdx].length > 0);
          if (lanesHere.length === 0) return null;
          const label = columnLabel(col.year, col.semester, ko);
          return (
            <section
              key={`${col.year}-${col.semester}-${colIdx}`}
              className="anim-nav-item border-t border-surface-border py-5 first:border-t-0"
              style={{ animationDelay: `${Math.min(colIdx, 8) * 60}ms` }}
            >
              <h4 className="text-sm font-bold text-content">
                {label.top} <span className="text-content-faint">{label.bottom}</span>
              </h4>
              <div className="mt-3 space-y-3">
                {lanesHere.map((lane) => (
                  <div key={lane.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-3.5 w-0.5 shrink-0',
                          lane.key === 'basics' ? 'bg-surface-border' : 'bg-yonsei-navy',
                        )}
                      />
                      <span
                        className={cn(
                          'text-xs font-bold leading-tight',
                          lane.key === 'basics' ? 'text-content-faint' : 'text-content-soft',
                        )}
                      >
                        {t(`fieldFilter.${lane.key}`)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-3.5">
                      {lane.cells[colIdx].map((c) => renderStackChip(c))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── 데스크톱·태블릿(tab+): 고정 지오메트리 무대 + 포커스 화살표.
          무대는 자연폭(≈1290px)을 유지하고 넘치는 만큼 이 래퍼가 횡스크롤한다. ── */}
      <div className="hidden overflow-x-auto pb-1 tab:block">
        <div className="relative" style={{ width: stage.width, height: stage.height }}>
          {/* 판(머리글 룰·레인 구분선) + 화살표 오버레이 */}
          <svg
            aria-hidden="true"
            width={stage.width}
            height={stage.height}
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
          >
            <defs>
              <marker
                id="cf-hl"
                viewBox="0 0 8 8"
                refX="6.4"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0.8 0.8 L7 4 L0.8 7.2 Z" fill="#0057A8" />
              </marker>
            </defs>
            <rect x={0} y={G.HEAD - 2} width={stage.width} height={2} fill="#003377" />
            {stage.lanes.map((lane, i) =>
              i === 0 ? null : (
                <rect
                  key={lane.key}
                  x={0}
                  y={lane.top - 1}
                  width={stage.width}
                  height={1}
                  fill="#E0E6ED"
                />
              ),
            )}
            {lines.map((ln) => (
              <path
                key={ln.id}
                d={ln.d}
                fill="none"
                stroke="#0057A8"
                strokeWidth={selected ? 1.8 : 1.5}
                strokeDasharray={ln.type === 'soft' ? '3 3' : undefined}
                markerEnd="url(#cf-hl)"
                opacity={selected ? 1 : 0.65}
              />
            ))}
          </svg>

          {/* 열 머리글 */}
          {columns.map((col, i) => {
            const label = columnLabel(col.year, col.semester, ko);
            return (
              <div
                key={`${col.year}-${col.semester}-${i}`}
                className="absolute top-0 text-center leading-tight"
                style={{ left: colX(i), width: G.COL_W }}
              >
                <span className="block text-xs font-bold text-content">{label.top}</span>
                <span className="block text-[0.69rem] font-medium text-content-faint">
                  {label.bottom}
                </span>
              </div>
            );
          })}

          {/* 레인 라벨 — 네이비 세로 바 + 굵은 글자(기초·공통만 흐리게) */}
          {stage.lanes.map((lane) => (
            <div
              key={lane.key}
              className="absolute left-0 flex items-center gap-2"
              style={{ top: lane.top, width: G.LABEL_W - 14, height: lane.h }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-[30px] w-0.5 shrink-0',
                  lane.key === 'basics' ? 'bg-surface-border' : 'bg-yonsei-navy',
                )}
              />
              <span
                className={cn(
                  'text-[0.78rem] font-bold leading-tight -tracking-[0.03em]',
                  lane.key === 'basics' ? 'text-content-faint' : 'text-content',
                )}
              >
                {t(`fieldFilter.${lane.key}`)}
              </span>
            </div>
          ))}

          {/* 과목 카드 */}
          {stage.cards.map((card) => {
            const c = card.course;
            const filled = isRequired(c.kind);
            const isSel = selected === c.code;
            const hop = web.nodes.get(c.code);
            const near = active !== null && hop !== undefined && !isSel;
            const dim = active !== null && hop === undefined;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => pick(c.code)}
                onMouseEnter={() => {
                  if (!selected) setHover(c.code);
                }}
                onMouseLeave={() => setHover((h) => (h === c.code ? null : h))}
                onFocus={() => {
                  if (!selected) setHover(c.code);
                }}
                onBlur={() => setHover((h) => (h === c.code ? null : h))}
                aria-pressed={isSel}
                title={`${c.code} · ${c.credits}${ko ? '학점' : ' cr'} · ${kindLabel(c.kind)}`}
                className={cn(
                  'absolute box-border flex items-center justify-center rounded-[2px] border px-1.5 text-xs font-semibold leading-tight -tracking-[0.03em] outline-none transition-[opacity,box-shadow,background-color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-yonsei-blue',
                  filled
                    ? 'border-yonsei-navy bg-yonsei-navy text-white'
                    : 'border-yonsei-navy/35 bg-surface text-content',
                  isSel && 'z-[14] ring-2 ring-yonsei-blue/60 ring-offset-1 ring-offset-surface',
                  near && 'z-[12] border-yonsei-blue',
                  !isSel && !near && 'z-10',
                  dim && 'opacity-25',
                )}
                style={{ left: card.x, top: card.y, width: G.CARD_W, height: G.CARD_H }}
              >
                <span className="block max-w-full truncate">{c.name}</span>
              </button>
            );
          })}

          {/* 카드 아래 미니 상세 팝오버 — 과목명·학정번호 / 구분선 / 메타·설명 / 관계 */}
          {pop && selectedCourse && (
            <div
              key={`pop-${selectedCourse.code}`}
              className="absolute z-30 h-0"
              style={{ left: pop.left, top: pop.top }}
            >
              <div
                ref={popBoxRef}
                className={cn(
                  'anim-panel absolute w-80 border-2 border-yonsei-navy p-4',
                  pop.up ? 'bottom-0' : 'top-0',
                  // 연결 카드를 가릴 때만 배경 30% 반투명 — 뒤의 카드가 비쳐 보인다
                  popDim ? 'bg-surface/30' : 'bg-surface',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold leading-snug text-content">
                    {selectedCourse.name}
                    <span className="ml-2 text-xs font-semibold tabular-nums text-yonsei-navy">
                      {selectedCourse.code}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={clearSel}
                    aria-label={ko ? '닫기' : 'Close'}
                    className="-m-1 shrink-0 p-1 text-content-faint transition-colors hover:text-yonsei-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-yonsei-blue"
                  >
                    <svg
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <path d="M1 1l10 10M11 1L1 11" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2.5 border-t border-surface-border pt-2.5">
                  <p className="text-xs font-medium text-content-faint">
                    {selectedCourse.credits}
                    {ko ? '학점' : ' cr'} · {kindLabel(selectedCourse.kind)} ·{' '}
                    {t(`fieldFilter.${laneOf(selectedCourse)}`)}
                  </p>
                  <p className="mt-1.5 max-h-32 overflow-y-auto text-xs leading-relaxed text-content-soft">
                    {DESCRIPTIONS[selectedCourse.code]?.desc ??
                      (ko ? '설명 준비 중입니다.' : 'Description coming soon.')}
                  </p>
                </div>
                {relations.prev.length > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-content">
                    <span className="font-bold text-content-faint">
                      {ko ? '선수 · 연계 ← ' : 'Before ← '}
                    </span>
                    {relations.prev
                      .map(
                        (e) =>
                          nameOf(e.from) + (e.type === 'soft' ? (ko ? ' (연계)' : ' (rec.)') : ''),
                      )
                      .join(' · ')}
                  </p>
                )}
                {relations.next.length > 0 && (
                  <p className="mt-1 text-xs leading-relaxed text-content">
                    <span className="font-bold text-content-faint">
                      {ko ? '후속 → ' : 'Next → '}
                    </span>
                    {relations.next
                      .map(
                        (e) => nameOf(e.to) + (e.type === 'soft' ? (ko ? ' (연계)' : ' (rec.)') : ''),
                      )
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        {/* 팝오버 하단 여유 — 무대가 낮을 때(분야 필터) 설명 잘림 방지 */}
        {padBottom > 0 && <div aria-hidden="true" style={{ height: padBottom }} />}
      </div>

      {/* 공통 과목(학년 무관 개설) — 체계 흐름 밖이라 별도 표기 */}
      {specials.length > 0 && (
        <div className="mt-8 border-t border-surface-border pt-4">
          <p className="text-xs font-bold text-content-faint">
            {ko ? '공통 선택 과목 — 학년 무관 개설' : 'Common electives — any year'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {specials.map((c) => renderStackChip(c))}
          </div>
        </div>
      )}

      {/* 초안 고지 */}
      <p className="mt-3 text-xs text-content-faint">
        {ko
          ? '※ 선수·연계 관계(화살표)는 표준 커리큘럼 논리로 작성한 초안으로, 학부 공식 편람과 다를 수 있습니다.'
          : '※ Prerequisite arrows are a draft based on standard ME curricula and may differ from the official catalog.'}
      </p>

      {/* 과목 상세 패널 — 메타 + 먼저/이어지는 과목(누르면 점프) + 설명 */}
      <div className="mt-10 scroll-mt-24" aria-live="polite">
        {selectedCourse ? (
          <div key={selectedCourse.code} className="anim-panel border-t-2 border-yonsei-navy pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-subhead text-xl font-semibold tracking-tight text-content">
                {selectedCourse.name}
                {DESCRIPTIONS[selectedCourse.code]?.nameEn && (
                  <span className="ml-2 text-sm font-medium text-content-faint">
                    {DESCRIPTIONS[selectedCourse.code].nameEn}
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={clearSel}
                className="shrink-0 text-xs font-semibold text-content-faint transition-colors hover:text-yonsei-navy"
                aria-label={ko ? '상세 닫기' : 'Close details'}
              >
                {ko ? '닫기' : 'Close'}
              </button>
            </div>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-soft">
              <span className="font-semibold text-yonsei-navy">{selectedCourse.code}</span>
              <span>
                {selectedCourse.credits}
                {ko ? '학점' : ' credits'}
              </span>
              <span>{kindLabel(selectedCourse.kind)}</span>
              <span>{t(`fieldFilter.${laneOf(selectedCourse)}`)}</span>
              <span>
                {(() => {
                  const l = columnLabel(selectedCourse.year, selectedCourse.semester, ko);
                  return `${l.top} ${l.bottom}`;
                })()}
              </span>
            </p>

            <div className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {(
                [
                  [ko ? '먼저 듣는 과목' : 'Take before', relations.prev, 'from'],
                  [ko ? '이어지는 과목' : 'Leads to', relations.next, 'to'],
                ] as const
              ).map(([heading, list, side]) => (
                <div key={side}>
                  <p className="text-[0.69rem] font-bold tracking-[0.08em] text-content-faint">
                    {heading}
                  </p>
                  {list.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {list.map((e) => {
                        const code = e[side];
                        const c = byCode.get(code);
                        if (!c) return null;
                        return (
                          <button
                            key={edgeKey(e)}
                            type="button"
                            onClick={() => pick(code)}
                            className={cn(
                              'rounded-[2px] border border-yonsei-navy/35 px-2 py-1 text-xs font-semibold text-content transition-colors hover:border-yonsei-navy hover:text-yonsei-navy',
                              e.type === 'soft' && 'border-dashed',
                            )}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-[0.8rem] text-content-faint">
                      {side === 'from'
                        ? ko
                          ? '지정된 선수 과목 없음'
                          : 'No prerequisites'
                        : ko
                          ? '이어지는 과목 없음'
                          : 'No follow-on courses'}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {DESCRIPTIONS[selectedCourse.code]?.desc ? (
              <p className="mt-5 max-w-prose text-sm leading-relaxed text-content-soft">
                {DESCRIPTIONS[selectedCourse.code].desc}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-content-faint">
            {ko
              ? '과목을 선택하면 상세 정보와 선수 · 후속 관계가 여기에 표시됩니다.'
              : 'Select a course to see details and its links.'}
          </p>
        )}
      </div>
    </div>
  );
}
