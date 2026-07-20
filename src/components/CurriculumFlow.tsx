'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { cn } from '@/lib/utils';
import type { ResearchField } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';
import coursesUndergraduate from '@content/courses-undergraduate.json';
import courseDescriptions from '@content/course-descriptions.json';
import courseFlow from '@content/course-flow.json';

/**
 * 교과목 체계도 — 기존 스윔레인 로드맵(레인 라벨·학기 열·과목 칩)에 선수·연계
 * '꺾임(직각) 화살표' 오버레이를 더한 이수 흐름도. 구 CurriculumRoadmap 대체.
 *
 * 디자인 원칙(사용자 확정):
 *  - 좌측 분야 분류 마커(레인 라벨)와 스윔레인 구조는 기존 그대로 유지.
 *  - 칩은 기존 디자인(각진 rounded-[2px]·채움=전공필수·대학교양/테두리=전공선택·네이비
 *    2색)을 그대로 쓰되 높이만 ~10px 낮춤(py-1.5 → py-0.5). 선택 강조는 골드 금지 → 블루.
 *  - 화살표는 곡선이 아닌 직각 꺾임(ㄱ자) 폴리라인 — 먹색(#232323 계열)의 가는 선(1.2px),
 *    작은 화살촉. 실선 = 선수·직결, 점선 = 연계·권장.
 *  - 한 칩에 화살표가 2개 이상 드나들면 출발점/도착점 y 를 5px 간격으로 부채꼴 분산하고,
 *    세로 꺾임 구간의 x 도 엇갈리게 해 머리·꼬리·몸통이 겹치지 않게 한다.
 *
 * 좌표는 칩의 실제 DOM 위치 실측(ResizeObserver) — 어떤 화면 폭에서도 칩에 정확히
 * 붙어 다니므로 고정폭 SVG 와 달리 횡스크롤이 없다(열은 minmax(0,1fr) 유동 폭).
 *
 * 반응형: lg+ 는 스윔레인+화살표, lg 미만(태블릿·모바일)은 기존 모바일 문법(학기별
 * 세로 스택 + 레인 그룹)을 유지하고 관계는 ① 선택 시 연결 과목 외 흐림 ② 상세 패널의
 * 선수/후속 목록(탭하면 점프)으로 표현한다 — 좁은 화면 화살표는 스파게티가 된다.
 *
 * ⚠️ 관계 데이터(content/course-flow.json)는 표준 커리큘럼 논리 초안 — 학부 검수 필요.
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

interface FlowEdge {
  from: string;
  to: string;
  type: 'prereq' | 'soft';
}
const FLOW = courseFlow as unknown as { edges: FlowEdge[] };

type LaneKey = 'basics' | ResearchField;
type Filter = 'all' | ResearchField;

const FIELD_TABS: ResearchField[] = [
  'bioNano',
  'thermoFluid',
  'dynamicsControl',
  'manufacturingDesign',
  'computation',
  'mechanicsMaterials',
];

/** 레인 표시 순서(위→아래) — 기존 체계도와 동일 */
const LANES: { key: LaneKey }[] = [
  { key: 'basics' },
  { key: 'mechanicsMaterials' },
  { key: 'computation' },
  { key: 'dynamicsControl' },
  { key: 'thermoFluid' },
  { key: 'manufacturingDesign' },
  { key: 'bioNano' },
];

const laneOf = (c: RoadmapCourse): LaneKey => c.field ?? 'basics';
const isRequired = (kind: string) => kind === '전필' || kind === '대교';

function columnLabel(year: string, semester: string, ko: boolean): { top: string; bottom: string } {
  const y = year.replace(/\s*&\s*/g, '·').replace(/\s*,\s*/g, '·');
  const s = semester.replace(/\s*&\s*/g, '·').replace(/\s*,\s*/g, '·');
  return ko
    ? { top: `${y}학년`, bottom: `${s}학기` }
    : { top: `Year ${y}`, bottom: `Sem ${s}` };
}

/** 화살표 한 개(그리드 래퍼 기준 좌표의 직각 폴리라인 경로) */
interface Line {
  d: string;
  type: FlowEdge['type'];
  idx: number;
}

export function CurriculumFlow({ locale }: { locale: Locale }) {
  const t = useTranslations('research');
  const ko = locale === 'ko';
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  // 보기 모드 — 기본형(수정 전 원래 스윔레인, 화살표 없음) ↔ 트리형(선수·연계 화살표).
  // 기본값은 기본형(사용자 지정).
  const [mode, setMode] = useState<'basic' | 'tree'>('basic');
  const isTree = mode === 'tree';
  const detailRef = useRef<HTMLDivElement | null>(null);

  // ── 데이터 파생(기존 체계도와 동일한 열·레인 계산) ─────────────────────
  const model = useMemo(() => {
    // 코드 → 과목(중복 코드는 첫 등장 — MEU4300/4400 이 4-1·4-2 양쪽에 있어 한 번만 표시)
    const byCode = new Map<string, RoadmapCourse>();
    for (const c of COURSES) if (!byCode.has(c.code)) byCode.set(c.code, c);
    const unique = [...byCode.values()];

    // 학년 무관 공통 과목(스페셜 토픽)은 체계 흐름 밖 — 그리드에서 빼고 하단 별도 표기
    // (사용자 지시: 체계를 보여주는 데 집중). 열도 그리드 과목 기준으로만 만들어
    // 공통 과목 전용의 어중간한 열("2·3·4학년")이 생기지 않게 한다.
    const SPECIAL = new Set(['MEU2001']);
    const specials = unique.filter((c) => SPECIAL.has(c.code));
    const gridCourses = unique.filter((c) => !SPECIAL.has(c.code));

    const seen = new Set<string>();
    const columns: { year: string; semester: string }[] = [];
    for (const c of gridCourses) {
      const id = `${c.year}__${c.semester}`;
      if (!seen.has(id)) {
        seen.add(id);
        columns.push({ year: c.year, semester: c.semester });
      }
    }
    const colOf = (c: RoadmapCourse) =>
      columns.findIndex((col) => col.year === c.year && col.semester === c.semester);
    const colOfCode = new Map(gridCourses.map((c) => [c.code, colOf(c)]));

    // ── 셀 내 순서 최적화(교차 최소화) — 바리센터 휴리스틱 ─────────────────
    // 레인(분류) 순서는 불변 — 기초·공통은 항상 맨 위(사용자 요구). 각 (레인×학기)
    // 셀 '안'에서만 과목의 위아래 순서를, 연결된 이웃(선수·후속)의 세로 위치 평균
    // (바리센터)에 맞춰 좌→우/우→좌 스윕으로 정렬해 화살표 꼬임을 줄인다.
    // 순수 결정적 연산(동일 입력 → 동일 결과) — SSR/CSR 동일 렌더라 hydration 안전.
    // 편람(JSON 파일 순서)은 건드리지 않는다 — 체계도 표시 순서만 달라진다.
    const cells: RoadmapCourse[][][] = LANES.map((lane) =>
      columns.map((_, ci) =>
        gridCourses.filter((c) => laneOf(c) === lane.key && colOfCode.get(c.code) === ci),
      ),
    );
    // '기본형' 보기용 — 최적화 전(파일 순서) 스냅샷. 수정 전 원래 구조 그대로 보여준다.
    const baseCells: RoadmapCourse[][][] = cells.map((row) => row.map((cell) => cell.slice()));
    const preds = new Map<string, string[]>();
    const succs = new Map<string, string[]>();
    for (const e of FLOW.edges) {
      const cf = colOfCode.get(e.from);
      const ct = colOfCode.get(e.to);
      if (cf === undefined || ct === undefined || cf === ct) continue; // 같은 열 간선은 중립
      if (!succs.has(e.from)) succs.set(e.from, []);
      succs.get(e.from)!.push(e.to);
      if (!preds.has(e.to)) preds.set(e.to, []);
      preds.get(e.to)!.push(e.from);
    }
    const pos = new Map<string, { li: number; idx: number }>();
    const syncPos = () => {
      cells.forEach((row, li) =>
        row.forEach((cell) => cell.forEach((c, idx) => pos.set(c.code, { li, idx }))),
      );
    };
    syncPos();
    // 세로 위치 근사 랭크 — 레인이 지배적, 셀 내 순서가 미세 조정
    const rankOf = (code: string) => {
      const p = pos.get(code);
      return p ? p.li * 1000 + p.idx * 10 : Number.MAX_SAFE_INTEGER;
    };
    const sortCell = (cell: RoadmapCourse[], neigh: Map<string, string[]>) => {
      if (cell.length < 2) return cell;
      const scored = cell.map((c, i) => {
        const ns = neigh.get(c.code);
        // 이웃 없는 과목은 제자리 유지(자기 랭크가 기준값) — 안정 정렬로 동점도 원순서
        const v = ns && ns.length > 0 ? ns.reduce((s, n) => s + rankOf(n), 0) / ns.length : rankOf(c.code);
        return { c, v, i };
      });
      scored.sort((a, b) => a.v - b.v || a.i - b.i);
      return scored.map((x) => x.c);
    };
    // 스윕 3회(좌→우, 우→좌, 좌→우) — 이 규모(셀 최대 4개)에선 충분히 수렴
    for (let iter = 0; iter < 3; iter++) {
      const leftToRight = iter % 2 === 0;
      const order = leftToRight
        ? [...columns.keys()]
        : [...columns.keys()].reverse();
      const neigh = leftToRight ? preds : succs;
      for (const ci of order) {
        for (let li = 0; li < LANES.length; li++) {
          cells[li][ci] = sortCell(cells[li][ci], neigh);
        }
        syncPos();
      }
    }

    return { byCode, gridCourses, specials, columns, colOfCode, orderedCells: cells, baseCells };
  }, []);
  const { byCode, specials, columns, colOfCode, orderedCells, baseCells } = model;

  const counts = useMemo(() => {
    const map = { all: COURSES.length } as Record<Filter, number>;
    for (const f of FIELD_TABS) map[f] = 0;
    for (const c of COURSES) if (c.field) map[c.field] += 1;
    return map;
  }, []);

  // 레인 × 열 → 과목 목록 — 트리형은 교차 최소화 순서, 기본형은 원래(파일) 순서.
  const lanes = useMemo(() => {
    const source = isTree ? orderedCells : baseCells;
    return LANES.map((lane, li) => ({ ...lane, cells: source[li] }))
      .filter((lane) => (filter === 'all' ? true : lane.key === filter))
      .map((lane) => ({ ...lane, total: lane.cells.reduce((n, cell) => n + cell.length, 0) }))
      .filter((lane) => lane.total > 0);
  }, [orderedCells, baseCells, isTree, filter]);

  // 선택 과목과 직접 연결된 간선·이웃
  const linked = useMemo(() => {
    if (!selected) return { edges: new Set<number>(), nodes: new Set<string>() };
    const e = new Set<number>();
    const n = new Set<string>([selected]);
    FLOW.edges.forEach((edge, i) => {
      if (edge.from === selected || edge.to === selected) {
        e.add(i);
        n.add(edge.from);
        n.add(edge.to);
      }
    });
    return { edges: e, nodes: n };
  }, [selected]);

  // 상세 패널용 선수/후속 목록
  const relations = useMemo(() => {
    if (!selected) return { prev: [] as FlowEdge[], next: [] as FlowEdge[] };
    return {
      prev: FLOW.edges.filter((e) => e.to === selected),
      next: FLOW.edges.filter((e) => e.from === selected),
    };
  }, [selected]);

  const selectedCourse = selected ? byCode.get(selected) ?? null : null;

  // 칩 선택 토글 — 상세 패널로의 자동 스크롤은 삭제(사용자 지시: 시선이 튀는 문제)
  const goDetail = (code: string) => {
    setSelected((cur) => (cur === code ? null : code));
  };

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

  // ── 화살표 오버레이: 칩 DOM 실측 → 직각 꺾임 경로 + 겹침 방지 부채꼴 분산 ──
  const gridRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [overlaySize, setOverlaySize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    if (!isTree) {
      setLines([]);
      return; // 기본형 — 화살표 없음
    }
    const wrap = gridRef.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    if (base.width === 0) {
      setLines([]);
      return; // lg 미만(hidden)
    }

    // 렌더된 칩만 대상(필터로 레인이 숨으면 해당 간선은 생략)
    const rectOf = (code: string) => {
      const el = chipRefs.current.get(code);
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top, cy: r.top + r.height / 2 - base.top, cx: r.left + r.width / 2 - base.left };
    };

    const usable = FLOW.edges
      .map((edge, idx) => {
        const a = rectOf(edge.from);
        const b = rectOf(edge.to);
        return a && b ? { edge, idx, a, b } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // 도착점 부채꼴 — 같은 칩으로 들어오는 간선이 2개 이상이면 접점 y 를 FAN 간격으로
    // 벌려 화살촉이 겹치지 않게 한다(출발점은 아래 버스 라우팅이 한 접점을 공유).
    const FAN = 6;
    const inBy = new Map<string, typeof usable>();
    for (const u of usable) {
      (inBy.get(u.edge.to) ?? inBy.set(u.edge.to, []).get(u.edge.to)!).push(u);
    }
    const endOff = new Map<number, number>();
    for (const [, list] of inBy) {
      list.sort((p, q) => p.a.cy - q.a.cy);
      list.forEach((u, k) => endOff.set(u.idx, (k - (list.length - 1) / 2) * FAN));
    }

    // 세로 꺾임 통로 중복 방지 — 비슷한 x 에 세로선이 또 오면 4px 씩 옆으로 민다.
    const vertUsed = new Map<number, number>();
    const deconflict = (x: number) => {
      const key = Math.round(x / 5);
      const n = vertUsed.get(key) ?? 0;
      vertUsed.set(key, n + 1);
      return x + n * 4;
    };

    // 가로 주행 전역 중복 방지 — 이미 지나간 가로 구간과 x 범위가 겹치고 y 차가 7px
    // 미만이면 7px 씩 아래로 민다(단독 칩 레인끼리 cy 가 정확히 같아 두 간선이 한 선처럼
    // 보이던 문제의 해법). 밀린 주행은 목적지 직전 작은 조그(V)로 원래 높이에 복귀한다.
    const hRuns: { y: number; a: number; b: number }[] = [];
    const claimRun = (y: number, a: number, b: number, canShift: boolean) => {
      let yy = y;
      if (canShift) {
        let guard = 0;
        let moved = true;
        while (moved && guard++ < 6) {
          moved = false;
          for (const r of hRuns) {
            if (Math.min(r.b, b) - Math.max(r.a, a) >= 12 && Math.abs(r.y - yy) < 7) {
              yy += 7;
              moved = true;
            }
          }
        }
      }
      hRuns.push({ y: yy, a, b });
      return yy;
    };

    // ── 경로 생성 — '버스(한 줄기 + 가지)' 라우팅, 2패스 ─────────────────
    // 같은 출발 과목의 간선들은 출발 접점 하나(칩 우중앙)에서 나와 공유 수직 줄기
    // (trunk, 소스당 x 하나)를 타고, 각 목적지 '행 높이'에서 가지(branch)로 갈라진다
    // — 회로도 문법. 같은 출발점 간선끼리의 교차가 구조적으로 0이 되고(이전 부채꼴
    // 방식의 자기 교차 10건 제거), 세로선 수 자체가 줄어 다이어그램이 정돈된다.
    // 패스1: 이동 불가 고정 다리(출발·진입·같은열 조그) 선등록 + 소스별 trunk x 확정.
    // 패스2: 가지의 긴 가로 주행 배치 — 겹치면 7px 밀리고 목적지 직전 조그로 복귀.
    const crossEdges = usable.filter(
      (u) => colOfCode.get(u.edge.from) !== colOfCode.get(u.edge.to),
    );
    const sameColEdges = usable.filter(
      (u) => colOfCode.get(u.edge.from) === colOfCode.get(u.edge.to),
    );

    // 같은 학기(세로 직결) — 패스1에서 완성 + 조그 가로선 선등록
    const sameColLines: Line[] = sameColEdges.map(({ edge, idx, a, b }) => {
      const down = b.top >= a.bottom;
      const x1 = a.cx;
      const x2 = b.cx;
      const my = down ? (a.bottom + b.top) / 2 : (a.top + b.bottom) / 2;
      claimRun(my, Math.min(x1, x2), Math.max(x1, x2), false);
      const d = down
        ? `M ${x1} ${a.bottom} L ${x1} ${my} L ${x2} ${my} L ${x2} ${b.top - 2}`
        : `M ${x1} ${a.top} L ${x1} ${my} L ${x2} ${my} L ${x2} ${b.bottom + 2}`;
      return { d, type: edge.type, idx };
    });

    // 소스별 trunk x — 가장 가까운 목적지 열 직전 간격 안에서 확보(통로 중복 시 4px 밀림)
    const bySource = new Map<string, typeof crossEdges>();
    for (const u of crossEdges) {
      (bySource.get(u.edge.from) ?? bySource.set(u.edge.from, []).get(u.edge.from)!).push(u);
    }
    const trunkX = new Map<string, number>();
    for (const [src, list] of bySource) {
      const a = list[0].a;
      const nearestLeft = Math.min(...list.map((u) => u.b.left));
      const lo = a.right + 6;
      const hi = nearestLeft - 8;
      const sx = hi <= lo ? (a.right + nearestLeft) / 2 : Math.min(hi, deconflict(lo + 6));
      trunkX.set(src, sx);
      // 고정 다리 선등록: 출발 다리(소스당 1개 공유) + 각 목적지 진입 다리
      claimRun(a.cy, a.right, sx, false);
      for (const u of list) {
        claimRun(u.b.cy + (endOff.get(u.idx) ?? 0), u.b.left - 14, u.b.left, false);
      }
    }

    // 패스2: 가지 주행 배치
    const crossLines: Line[] = crossEdges.map(({ edge, idx, a, b }) => {
      const sx = trunkX.get(edge.from)!;
      const y2 = b.cy + (endOff.get(idx) ?? 0);
      const runY = claimRun(y2, sx, b.left - 14, true);
      let d: string;
      if (Math.abs(runY - y2) < 0.5) {
        d = `M ${a.right} ${a.cy} L ${sx} ${a.cy} L ${sx} ${y2} L ${b.left - 2} ${y2}`;
      } else {
        // 주행이 밀렸으면 목적지 직전 조그(V)로 원래 진입 높이에 복귀
        const jx = Math.max(sx + 4, b.left - 14);
        d = `M ${a.right} ${a.cy} L ${sx} ${a.cy} L ${sx} ${runY} L ${jx} ${runY} L ${jx} ${y2} L ${b.left - 2} ${y2}`;
      }
      return { d, type: edge.type, idx };
    });

    const out: Line[] = [...sameColLines, ...crossLines];

    setLines(out);
    setOverlaySize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
  }, [colOfCode, isTree]);

  useEffect(() => {
    // 커밋 직후 + 진입 애니메이션·폰트 로드 이후까지 다중 시점 재실측 —
    // 첫 마운트에서 오버레이가 비는 타이밍 문제를 원천 차단한다.
    const raf = requestAnimationFrame(measure);
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 450);
    document.fonts?.ready.then(measure).catch(() => {});
    const wrap = gridRef.current;
    const ro = wrap ? new ResizeObserver(() => requestAnimationFrame(measure)) : null;
    if (wrap && ro) ro.observe(wrap);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, filter, lanes]);

  // ── 칩 — 기존 renderChip 디자인, 높이만 ~10px 축소(py-1.5→py-0.5), 골드→블루 ──
  // 연결 하이라이트 흐림은 화살표가 있는 트리형 전용(기본형은 원래처럼 선택 링만)
  const chipDim = (course: RoadmapCourse) =>
    isTree && selected ? !linked.nodes.has(course.code) : false;

  const renderChip = (course: RoadmapCourse, forGrid: boolean) => {
    const filled = isRequired(course.kind);
    const isSel = selected === course.code;
    return (
      <button
        key={course.code}
        ref={(el) => {
          if (!forGrid) return;
          // 해제(null) 시 삭제하지 않는다 — 키 리마운트에서 새 등록 → 옛 해제 순서로
          // 정상 엔트리가 지워지는 레이스 방지. 낡은 엘리먼트는 measure 의
          // isConnected 검사로 걸러지고, 재마운트 시 set 이 최신으로 덮어쓴다.
          if (el) chipRefs.current.set(course.code, el);
        }}
        type="button"
        onClick={() => goDetail(course.code)}
        aria-pressed={isSel}
        title={`${course.code} · ${course.credits}${ko ? '학점' : ' cr'}`}
        className={cn(
          'rounded-[2px] border text-xs font-semibold leading-tight outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-yonsei-blue',
          // 트리형: 글자 폭 맞춤·가운데(화살표 통로 확보) / 기본형: 수정 전 원래 칩(좌측 정렬)
          isTree
            ? 'w-fit max-w-full whitespace-nowrap px-3 py-2 text-center'
            : 'px-2 py-1.5 text-left',
          filled
            ? 'border-yonsei-navy bg-yonsei-navy text-white hover:border-yonsei-blue hover:bg-yonsei-blue'
            : 'border-yonsei-navy/35 bg-surface text-content hover:border-yonsei-navy hover:text-yonsei-navy',
          isSel && 'border-yonsei-blue ring-2 ring-yonsei-blue/60 ring-offset-1 ring-offset-surface',
          chipDim(course) && 'opacity-30',
          forGrid && 'relative z-10',
        )}
      >
        {course.name}
      </button>
    );
  };

  const edgeDim = (idx: number) => (selected ? !linked.edges.has(idx) : false);

  // 로드맵 그리드 열 — 레인 라벨(7rem) + 학기 열(유동 폭: 컨테이너에 맞춰 횡스크롤 없음)
  const gridTemplate = `7rem repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div>
      {/* 분야 필터 탭(좌) + 보기 전환 토글(우) — 기본형(원래 구조) ⇄ 트리형(화살표) */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto">
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

        {/* 보기 전환 — 순환(두 화살표) 픽토그램 + 현재 모드명. 기본값 기본형(사용자 지정) */}
        <button
          type="button"
          onClick={() => setMode(isTree ? 'basic' : 'tree')}
          aria-pressed={isTree}
          title={ko ? '기본형·트리형 보기 전환' : 'Toggle basic / tree view'}
          className="inline-flex shrink-0 items-center gap-2 border border-yonsei-navy px-3.5 py-2 text-sm font-bold text-yonsei-navy transition-colors hover:bg-yonsei-navy hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M4 9a8 8 0 0 1 13.6-3.4L20 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 15a8 8 0 0 1-13.6 3.4L4 16" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {ko ? (isTree ? '트리형' : '기본형') : isTree ? 'Tree' : 'Basic'}
        </button>
      </div>

      {/* 범례 — 칩 문법(기존) + 화살표 문법(트리형 lg+ 전용) */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-content-soft">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded-[2px] bg-yonsei-navy" />
          {ko ? '채움 — 전공필수·대학교양' : 'Filled — Required · General'}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded-[2px] border border-yonsei-navy/40 bg-surface" />
          {ko ? '테두리 — 전공선택' : 'Outlined — Elective'}
        </span>
        {isTree && (
          <>
            <span className="hidden items-center gap-1.5 lg:flex">
              <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
                <line x1="1" y1="4" x2="18" y2="4" stroke="rgb(35 35 35 / 0.55)" strokeWidth="1.2" />
                <path d="M17 1.6 L21.5 4 L17 6.4 Z" fill="rgb(35 35 35 / 0.7)" />
              </svg>
              {ko ? '실선 — 선수·직결' : 'Solid — prerequisite'}
            </span>
            <span className="hidden items-center gap-1.5 lg:flex">
              <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
                <line x1="1" y1="4" x2="18" y2="4" stroke="rgb(35 35 35 / 0.55)" strokeWidth="1.2" strokeDasharray="3 3" />
                <path d="M17 1.6 L21.5 4 L17 6.4 Z" fill="rgb(35 35 35 / 0.7)" />
              </svg>
              {ko ? '점선 — 연계·권장' : 'Dashed — related'}
            </span>
          </>
        )}
      </div>

      {/* ── 모바일·좁은 화면(< lg): 학기별 세로 스택 + 레인 그룹(기존 문법 유지) ── */}
      <div key={`m-${filter}`} className="border-t-2 border-yonsei-navy lg:hidden">
        {columns.map((col, colIdx) => {
          const lanesHere = lanes.filter((lane) => lane.cells[colIdx].length > 0);
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
                      {lane.cells[colIdx].map((c) => renderChip(c, false))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── 데스크톱(lg+): 스윔레인 + 직각 화살표 오버레이(유동 열 폭 — 횡스크롤 없음) ── */}
      <div className="hidden lg:block">
        {/* 헤더 행 — 기존 thead 문법(굵은 네이비 상단 룰) */}
        <div
          className="grid gap-x-2 border-b-2 border-yonsei-navy pb-2"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div aria-hidden="true" />
          {columns.map((col, i) => {
            const label = columnLabel(col.year, col.semester, ko);
            return (
              <div key={`${col.year}-${col.semester}-${i}`} className="text-center leading-tight">
                <span className="block text-xs font-bold text-content">{label.top}</span>
                <span className="block text-[0.7rem] font-medium text-content-faint">
                  {label.bottom}
                </span>
              </div>
            );
          })}
        </div>

        {/* 레인 행들 + 화살표 오버레이(래퍼 relative, 칩 z-10 / SVG z-0) */}
        <div ref={gridRef} className="relative">
          {/* 화살표 오버레이 — 트리형 전용(기본형은 수정 전 원래 구조 그대로) */}
          {isTree && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            width={overlaySize.w || undefined}
            height={overlaySize.h || undefined}
          >
            <defs>
              <marker id="cf-arrow" viewBox="0 0 8 8" refX="6.4" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0.8 0.8 L7 4 L0.8 7.2 Z" fill="rgb(35 35 35 / 0.7)" />
              </marker>
              <marker id="cf-arrow-hl" viewBox="0 0 8 8" refX="6.4" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0.8 0.8 L7 4 L0.8 7.2 Z" fill="#0057A8" />
              </marker>
            </defs>
            {lines.map((ln) => {
              const hl = selected !== null && linked.edges.has(ln.idx);
              const dim = edgeDim(ln.idx);
              return (
                <path
                  key={ln.idx}
                  d={ln.d}
                  fill="none"
                  stroke={hl ? '#0057A8' : 'rgb(35 35 35 / 0.55)'}
                  strokeWidth={hl ? 1.8 : 1.2}
                  strokeDasharray={ln.type === 'soft' ? '3 3' : undefined}
                  markerEnd={hl ? 'url(#cf-arrow-hl)' : 'url(#cf-arrow)'}
                  opacity={dim ? 0.12 : 1}
                  style={{ transition: 'opacity 250ms ease, stroke 250ms ease' }}
                />
              );
            })}
          </svg>
          )}

          <div className="divide-y divide-surface-border">
            {lanes.map((lane) => (
              <div
                key={lane.key}
                className="grid items-stretch gap-x-2 py-3"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {/* 레인(분류) 라벨 — 기존 마커 그대로: 네이비 세로 바 + 굵은 글자 */}
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

                {/* 셀: 학기별 과목 칩 세로 나열 — 트리형은 칩을 글자 폭·가운데 정렬 + 넓은
                    간격(화살표 통로), 기본형은 수정 전 원래 배치(좌측·셀 폭·촘촘). */}
                {lane.cells.map((cell, colIdx) => (
                  <div
                    key={colIdx}
                    className={cn(
                      'flex flex-col justify-center px-0.5',
                      isTree ? 'items-center gap-2.5 py-1.5' : 'gap-1.5 py-1',
                    )}
                  >
                    {cell.map((c) => renderChip(c, true))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 공통 과목(학년 무관 개설) — 체계 흐름 밖이라 별도 표기(사용자 지시) */}
      {specials.length > 0 && (
        <div className="mt-8 border-t border-surface-border pt-4">
          <p className="text-xs font-bold text-content-faint">
            {ko ? '공통 선택 과목 — 학년 무관 개설' : 'Common electives — any year'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {specials.map((c) => renderChip(c, false))}
          </div>
        </div>
      )}

      {/* 초안 고지 */}
      <p className="mt-3 text-xs text-content-faint">
        {ko
          ? '※ 선수·연계 관계(화살표)는 표준 커리큘럼 논리로 작성한 초안으로, 학부 공식 편람과 다를 수 있습니다.'
          : '※ Prerequisite arrows are a draft based on standard ME curricula and may differ from the official catalog.'}
      </p>

      {/* 과목 상세 패널 — 기존 패널 + 선수/후속 목록(모바일에선 화살표의 대체재) */}
      <div ref={detailRef} className="mt-8 scroll-mt-24" aria-live="polite">
        {selectedCourse ? (
          <div key={selectedCourse.code} className="anim-panel border-t-2 border-yonsei-navy pt-4">
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
              <span>{t(`fieldFilter.${laneOf(selectedCourse)}`)}</span>
            </p>

            {/* 선수·후속 관계 — 클릭하면 그 과목으로 점프 */}
            {(relations.prev.length > 0 || relations.next.length > 0) && (
              <div className="mt-4 flex flex-col gap-2 text-xs">
                {relations.prev.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-content-soft">{ko ? '선수·연계 ←' : 'Before ←'}</span>
                    {relations.prev.map((e) => {
                      const c = byCode.get(e.from);
                      if (!c) return null;
                      return (
                        <button
                          key={e.from}
                          type="button"
                          onClick={() => goDetail(e.from)}
                          className={cn(
                            'rounded-[2px] border border-yonsei-navy/35 px-2 py-1 font-semibold text-content transition-colors hover:border-yonsei-navy hover:text-yonsei-navy',
                            e.type === 'soft' && 'border-dashed',
                          )}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {relations.next.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-content-soft">{ko ? '후속 과목 →' : 'Next →'}</span>
                    {relations.next.map((e) => {
                      const c = byCode.get(e.to);
                      if (!c) return null;
                      return (
                        <button
                          key={e.to}
                          type="button"
                          onClick={() => goDetail(e.to)}
                          className={cn(
                            'rounded-[2px] border border-yonsei-navy/35 px-2 py-1 font-semibold text-content transition-colors hover:border-yonsei-navy hover:text-yonsei-navy',
                            e.type === 'soft' && 'border-dashed',
                          )}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {DESCRIPTIONS[selectedCourse.code]?.desc ? (
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-content-soft">
                {DESCRIPTIONS[selectedCourse.code].desc}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-content-faint">
            {ko ? '과목 칩을 눌러 상세 설명과 선수·후속 관계를 확인하세요.' : 'Select a course to see details and its links.'}
          </p>
        )}
      </div>
    </div>
  );
}
