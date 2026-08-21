/**
 * 교과목 체계도의 판(格子)과 화살표 라우팅 — 순수 계산 모듈.
 *
 * 학생이 보는 화면(components/CurriculumFlow)과 관리자 편집 화면
 * (components/admin/CurriculumMapEditor)이 **같은 좌표계·같은 라우터**를 써야
 * "보면서 고친다"가 성립하므로, React 에 의존하지 않는 부분을 전부 여기로 뺐다.
 * 둘 중 한쪽에만 손대는 일이 없도록 지오메트리 상수도 여기 하나뿐이다.
 *
 * 좌표는 전부 계산값이다(칩 DOM 실측 없음) — 무대 크기가 렌더 전에 확정되므로
 * 편집 화면에서 드래그 위치를 슬롯으로 되돌리는 역산도 여기서 그대로 쓴다.
 */

import { RESEARCH_FIELDS, type ResearchField } from '@/lib/research-fields';

/** 편람 한 줄 — content/courses-undergraduate.json 의 레코드 */
export interface CurriculumCourse {
  year: string;
  semester: string;
  kind: string; // 대교 | 전필 | 전선
  code: string;
  name: string;
  credits: string;
  hours: string;
  field: ResearchField | null;
}

export interface FlowEdge {
  from: string;
  to: string;
  type: 'prereq' | 'soft';
}

/** content/course-flow.json 전체 — `_comment` 는 저장 때 보존한다 */
export interface CurriculumMapData {
  _comment?: string;
  nodes: { code: string; row?: number }[];
  edges: FlowEdge[];
}

export type LaneKey = 'basics' | ResearchField;

/** 레인 표시 순서(위→아래) — 기초·공통은 항상 맨 위(학부 지정, 변경 불가).
 *  나머지는 레인을 넘는 화살표가 가장 적은 순서다(6! 전수 탐색 최소값 중 공식
 *  분류 순서에 가장 가까운 배열). 분야 탭도 이 순서를 따라가 목록이 그림의
 *  위→아래와 같은 차례로 읽힌다. 공식 분류에 분야가 늘면 뒤에 자동으로 붙는다. */
const LANE_FIELD_ORDER: ResearchField[] = [
  'mechanicsMaterials',
  'designManufacturing',
  'roboticsControl',
  'energyThermofluid',
  'microNano',
  'bioPhotonics',
];
export const LANE_KEYS: LaneKey[] = [
  'basics',
  ...LANE_FIELD_ORDER,
  ...RESEARCH_FIELDS.filter((f) => !LANE_FIELD_ORDER.includes(f)),
];

/** 무대 지오메트리(px) — 디자인 확정본 수치. 카드 폭과 통로 폭이 서로 물려 있어
 *  하나만 바꾸면 화살표 통로가 무너진다. 바꿀 땐 세트로. */
export const G = {
  LABEL_W: 104, // 좌측 레인 라벨 열
  COL_W: 152, // 학기 열 폭
  GUT: 52, // 열 사이 통로(세로 꺾임이 지나는 곳)
  CARD_W: 146,
  CARD_H: 30,
  PITCH: 44, // 칸 안 슬롯 간격(카드 높이 + 가로 채널)
  PAD: 14, // 레인 위아래 여백
  HEAD: 46, // 열 머리글 높이
  TAIL: 14, // 무대 오른쪽 여백
} as const;

export const colX = (i: number) => G.LABEL_W + i * (G.COL_W + G.GUT);

export const laneOf = (c: CurriculumCourse): LaneKey => c.field ?? 'basics';
export const isRequired = (kind: string) => kind === '전필' || kind === '대교';
/** 체계도는 4학년 열을 따로 두지 않는다 — 3·4학년 열로 접는다 */
export const foldYear = (year: string) => (year === '4' ? '3 & 4' : year);
/** 학년 무관 개설(스페셜 토픽) — 흐름 밖이라 격자에서 빼고 하단에 따로 표기 */
export const SPECIAL_CODES = new Set(['MEU2001']);

export function columnLabel(
  year: string,
  semester: string,
  ko: boolean,
): { top: string; bottom: string } {
  const y = year.replace(/\s*&\s*/g, '·').replace(/\s*,\s*/g, '·');
  const s = semester.replace(/\s*&\s*/g, '·').replace(/\s*,\s*/g, '·');
  return ko ? { top: `${y}학년`, bottom: `${s}학기` } : { top: `Year ${y}`, bottom: `Sem ${s}` };
}

export function kindLabel(kind: string, ko: boolean): string {
  if (ko) return kind === '전필' ? '전공필수' : kind === '전선' ? '전공선택' : '대학교양';
  return kind === '전필' ? 'Major Required' : kind === '전선' ? 'Major Elective' : 'General Education';
}

/** 격자 위 한 자리 — 어느 레인·열의 몇 번째 슬롯인지(좌표 이전 단계) */
export interface CardSlot {
  course: CurriculumCourse;
  code: string;
  laneIdx: number;
  col: number;
  row: number;
}

/** 무대에 놓인 과목 카드 한 장(픽셀 좌표까지) */
export interface Card extends CardSlot {
  x: number;
  y: number;
  x2: number;
  cx: number;
  cy: number;
}

export interface LaneBox {
  key: LaneKey;
  top: number;
  h: number;
  rows: number;
}

export interface Stage {
  cards: Card[];
  pos: Map<string, Card>;
  lanes: LaneBox[];
  /** 가로 주행이 지날 수 있는 y 목록(카드 행 사이) */
  channels: number[];
  width: number;
  height: number;
}

export interface CurriculumModel {
  byCode: Map<string, CurriculumCourse>;
  columns: { year: string; semester: string }[];
  cards: CardSlot[];
  /** 레인별 슬롯 수(레인 높이의 근거) */
  laneRows: number[];
  /** 학년 무관 개설 과목 — 격자 밖 */
  specials: CurriculumCourse[];
}

/**
 * 편람 + 슬롯 지정 → 격자 배치.
 *
 * `rowSlots`(course-flow.json 의 nodes[].row)가 칸 안 세로 순서를 정한다. 지정이
 * 없는 과목은 그 칸의 빈 앞자리에 자동으로 들어간다 — CMS 에서 과목을 새로 넣어도
 * 배치가 깨지지 않게 하는 폴백이다.
 */
export function buildCurriculumModel(
  courses: CurriculumCourse[],
  rowSlots: Map<string, number>,
): CurriculumModel {
  // 4학년 열은 3·4학년으로 접는다. 같은 코드가 두 학기에 걸치면(창의제품설계·
  // 연구논문) 마지막 열에 한 번만 놓는다 — 졸업 직전 과목이라 뒤가 맞다.
  const folded = courses.map((c) => ({ ...c, year: foldYear(c.year) }));
  const gridCourses = folded.filter((c) => !SPECIAL_CODES.has(c.code));

  const specials: CurriculumCourse[] = [];
  const seenSpecial = new Set<string>();
  for (const c of folded) {
    if (SPECIAL_CODES.has(c.code) && !seenSpecial.has(c.code)) {
      seenSpecial.add(c.code);
      specials.push(c);
    }
  }

  const seen = new Set<string>();
  const columns: { year: string; semester: string }[] = [];
  for (const c of gridCourses) {
    const id = `${c.year}__${c.semester}`;
    if (!seen.has(id)) {
      seen.add(id);
      columns.push({ year: c.year, semester: c.semester });
    }
  }
  const colIndex = (c: CurriculumCourse) =>
    columns.findIndex((col) => col.year === c.year && col.semester === c.semester);

  // 코드별로 가장 늦은 열의 기록만 남긴다(두 학기에 걸쳐 개설되는 과목 처리)
  const byCode = new Map<string, CurriculumCourse>();
  const colOfCode = new Map<string, number>();
  for (const c of gridCourses) {
    const ci = colIndex(c);
    const prev = colOfCode.get(c.code);
    if (prev === undefined || ci > prev) {
      colOfCode.set(c.code, ci);
      byCode.set(c.code, c);
    }
  }
  for (const c of specials) byCode.set(c.code, c);

  const placed = [...colOfCode.keys()].map((code) => {
    const c = byCode.get(code)!;
    return {
      course: c,
      code,
      laneIdx: LANE_KEYS.indexOf(laneOf(c)),
      col: colOfCode.get(code)!,
      row: rowSlots.get(code),
    };
  });
  const cellCursor = new Map<string, number>();
  const cards: CardSlot[] = placed.map((p) => {
    if (p.row !== undefined) return { ...p, row: p.row };
    const key = `${p.laneIdx}:${p.col}`;
    const taken = new Set(
      placed.filter((q) => q.laneIdx === p.laneIdx && q.col === p.col).map((q) => q.row),
    );
    let r = cellCursor.get(key) ?? 0;
    while (taken.has(r)) r += 1;
    cellCursor.set(key, r + 1);
    return { ...p, row: r };
  });

  // ── 슬롯 정합성 가드 ────────────────────────────────────────────────
  // 슬롯 값은 외부 데이터(DB 의 content_files 행)에서 오므로 무엇이든 들어올 수 있다.
  // 실제로 겪을 사고는 둘이다: ① 옛 스키마가 남아 슬롯이 '칸 안 순서'가 아니라 전역
  // 행 번호인 경우(레인이 17줄로 늘어난다) ② 같은 칸에 같은 슬롯이 겹쳐 카드가 포개지는
  // 경우. 화면이 무너지느니 의도한 순서만 지키고 촘촘히 다시 채운다 — 일부러 비워 둔
  // 자리는 정상 데이터에서는 그대로 살아남는다(아래 조건에 걸리지 않는다).
  const MAX_SLOT = 11;
  const cells = new Map<string, CardSlot[]>();
  for (const c of cards) {
    const key = `${c.laneIdx}:${c.col}`;
    const list = cells.get(key);
    if (list) list.push(c);
    else cells.set(key, [c]);
  }
  for (const [, list] of cells) {
    const rows = list.map((c) => c.row);
    const broken =
      rows.some((r) => !Number.isInteger(r) || r < 0 || r > MAX_SLOT) ||
      new Set(rows).size !== rows.length;
    if (!broken) continue;
    // 원래 순서(슬롯 오름차순, 동점은 등장 순)를 지키며 0부터 다시 채운다
    [...list]
      .sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || list.indexOf(a) - list.indexOf(b))
      .forEach((c, i) => {
        c.row = i;
      });
  }

  const laneRows = LANE_KEYS.map((_, li) =>
    Math.max(1, ...cards.filter((c) => c.laneIdx === li).map((c) => c.row + 1)),
  );

  return { byCode, columns, cards, laneRows, specials };
}

/**
 * 격자 배치 → 픽셀 좌표.
 *
 * 보이는 레인만 위에서부터 다시 쌓는다 — 분야 필터로 레인이 숨으면 그만큼 무대가
 * 낮아진다(숨긴 자리를 빈 판으로 남기지 않는다).
 *
 * `minLaneRows` 는 레인의 최소 슬롯 수 — 편집 화면이 "카드를 한 칸 더 아래로 옮길
 * 자리"를 만들기 위해 레인마다 여유 줄을 하나 더 요구할 때 쓴다.
 */
export function buildStage(
  model: CurriculumModel,
  opts: { isLaneVisible?: (key: LaneKey) => boolean; extraRows?: number } = {},
): Stage {
  const visible = opts.isLaneVisible ?? (() => true);
  const extra = opts.extraRows ?? 0;
  const lanes: LaneBox[] = [];
  const channels: number[] = [];
  const laneTop = new Map<number, number>();
  let y = G.HEAD;
  LANE_KEYS.forEach((key, li) => {
    if (!visible(key)) return;
    const rows = model.laneRows[li] + extra;
    const h = rows * G.PITCH - (G.PITCH - G.CARD_H) + 2 * G.PAD;
    lanes.push({ key, top: y, h, rows });
    laneTop.set(li, y);
    channels.push(y + G.PAD * 0.5);
    for (let r = 0; r < rows - 1; r += 1) {
      channels.push(y + G.PAD + r * G.PITCH + G.CARD_H + (G.PITCH - G.CARD_H) / 2);
    }
    channels.push(y + h - G.PAD * 0.5);
    y += h + 1;
  });

  const cards: Card[] = [];
  const pos = new Map<string, Card>();
  for (const b of model.cards) {
    const top = laneTop.get(b.laneIdx);
    if (top === undefined) continue; // 필터로 숨은 레인
    const x = colX(b.col) + (G.COL_W - G.CARD_W) / 2;
    const cardY = top + G.PAD + b.row * G.PITCH;
    const card: Card = {
      ...b,
      x,
      y: cardY,
      x2: x + G.CARD_W,
      cx: x + G.CARD_W / 2,
      cy: cardY + G.CARD_H / 2,
    };
    cards.push(card);
    pos.set(card.code, card);
  }

  return {
    cards,
    pos,
    lanes,
    channels,
    width: colX(Math.max(0, model.columns.length - 1)) + G.COL_W + G.TAIL,
    height: y + 6,
  };
}

/** 무대 y 좌표 → (레인 인덱스, 칸 안 슬롯). 편집 화면의 드래그 역산용. */
export function slotAt(stage: Stage, yy: number): { laneKey: LaneKey; row: number } | null {
  for (const lane of stage.lanes) {
    if (yy < lane.top || yy > lane.top + lane.h) continue;
    const raw = Math.round((yy - lane.top - G.PAD) / G.PITCH);
    return { laneKey: lane.key, row: Math.max(0, Math.min(lane.rows - 1, raw)) };
  }
  return null;
}

const dOf = (pts: [number, number][]) =>
  pts
    .map((p, i) => `${i ? 'L' : 'M'} ${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`)
    .join(' ');

/**
 * 채널 라우터 — 세로 꺾임은 열 사이 통로(GUT)의 8px 슬롯에, 가로 주행은 카드 행
 * 사이 채널에 배정한다. 이미 쓴 구간을 기억해 두고 겹치면 다음 슬롯으로 민다.
 */
function makeRouter(stage: Stage) {
  const verts = new Map<number, { x: number; a: number; b: number }[]>();
  const runs: { y: number; a: number; b: number }[] = [];
  const gutStart = (i: number) => colX(i) + G.COL_W;

  /** 열 i 오른쪽 통로에서 [y1,y2] 를 세로로 지날 x 를 잡는다(right=오른쪽부터 채움) */
  const vert = (i: number, y1: number, y2: number, right: boolean) => {
    const a = Math.min(y1, y2) - 6;
    const b = Math.max(y1, y2) + 6;
    let list = verts.get(i);
    if (!list) {
      list = [];
      verts.set(i, list);
    }
    const slots = Math.floor((G.GUT - 12) / 8) + 1;
    for (let k = 0; k < slots; k += 1) {
      const x = right ? gutStart(i) + G.GUT - 6 - k * 8 : gutStart(i) + 6 + k * 8;
      let ok = true;
      for (const u of list) {
        if (Math.abs(u.x - x) < 5 && Math.min(u.b, b) - Math.max(u.a, a) > -4) {
          ok = false;
          break;
        }
      }
      if (ok) {
        list.push({ x, a, b });
        return x;
      }
    }
    const x = gutStart(i) + G.GUT / 2 + (right ? 4 : -4);
    list.push({ x, a, b });
    return x;
  };

  /** y 높이로 [x1,x2] 를 가로지를 수 있나 — 카드 관통·다른 주행과의 중복 검사 */
  const clear = (yy: number, x1: number, x2: number) => {
    const a = Math.min(x1, x2) - 2;
    const b = Math.max(x1, x2) + 2;
    for (const c of stage.cards) {
      if (c.x2 + 2 > a && c.x - 2 < b && c.y - 5 < yy && c.y + G.CARD_H + 5 > yy) return false;
    }
    for (const r of runs) {
      if (Math.abs(r.y - yy) < 6 && Math.min(r.b, b) - Math.max(r.a, a) > 8) return false;
    }
    return true;
  };
  const claim = (yy: number, x1: number, x2: number) => {
    runs.push({ y: yy, a: Math.min(x1, x2), b: Math.max(x1, x2) });
  };
  /** target 에 가장 가까우면서 비어 있는 가로 채널 */
  const chan = (target: number, x1: number, x2: number) => {
    const sorted = [...stage.channels].sort((p, q) => Math.abs(p - target) - Math.abs(q - target));
    for (const c of sorted) if (clear(c, x1, x2)) return c;
    return target;
  };
  /** y 근처(±span)에서 비어 있는 높이 — 진입 직전 미세 조정용 */
  const pickY = (y: number, x1: number, x2: number, span: number) => {
    for (let k = 0; k <= span / 4; k += 1) {
      for (const s of k === 0 ? [0] : [k * 4, -k * 4]) {
        if (clear(y + s, x1, x2)) return y + s;
      }
    }
    return y;
  };

  return { vert, clear, claim, chan, pickY };
}

/** 한 카드에 여러 선이 드나들면 접점 y 를 7px 간격으로 부채꼴 분산 */
function fanOffsets(stage: Stage, edges: FlowEdge[]) {
  const out = new Map<string, FlowEdge[]>();
  const inn = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    const o = out.get(e.from);
    if (o) o.push(e);
    else out.set(e.from, [e]);
    const i = inn.get(e.to);
    if (i) i.push(e);
    else inn.set(e.to, [e]);
  }
  const off = new Map<string, { depart?: number; arrive?: number }>();
  const spread = (map: Map<string, FlowEdge[]>, side: 'from' | 'to', slot: 'depart' | 'arrive') => {
    for (const [, list] of map) {
      const sorted = [...list].sort(
        (p, q) => (stage.pos.get(p[side])?.cy ?? 0) - (stage.pos.get(q[side])?.cy ?? 0),
      );
      sorted.forEach((e, k) => {
        const id = edgeKey(e);
        const cur = off.get(id) ?? {};
        cur[slot] = sorted.length === 1 ? 0 : (k - (sorted.length - 1) / 2) * 7;
        off.set(id, cur);
      });
    }
  };
  spread(out, 'to', 'depart');
  spread(inn, 'from', 'arrive');
  return off;
}

/** 화살표 한 개(무대 좌표의 직각 폴리라인) */
export interface Line {
  id: string;
  type: FlowEdge['type'];
  d: string;
}

export const edgeKey = (e: { from: string; to: string }) => `${e.from}>${e.to}`;

/**
 * 고른 과목에 걸린 선만 그린다. 세로 이동은 열 사이 통로에서만, 여러 선이 겹치면
 * 통로 슬롯과 카드 사이 채널로 흩어 놓는다. 흐름은 왼쪽→오른쪽(시간 순).
 */
export function routeSet(stage: Stage, edges: FlowEdge[]): Line[] {
  const R = makeRouter(stage);
  const off = fanOffsets(stage, edges);
  const out: Line[] = [];
  const items = edges
    .map((e) => {
      const s = stage.pos.get(e.from);
      const t = stage.pos.get(e.to);
      if (!s || !t) return null;
      const o = off.get(edgeKey(e)) ?? {};
      return {
        edge: e,
        s,
        t,
        id: edgeKey(e),
        sy: s.cy + (o.depart ?? 0),
        ty: t.cy + (o.arrive ?? 0),
        same: s.col === t.col,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const rest: typeof items = [];
  for (const it of items) {
    // 같은 학기(세로 직결) — 카드 아래에서 아래 카드 위로 곧장.
    // ⚠️ 열 안의 카드는 x 범위가 모두 같아, 두 카드 사이에 다른 카드가 하나라도
    // 있으면 이 직선이 그 카드를 관통한다(관리자가 먼 두 과목을 이으면 바로 나온다).
    // 그럴 때는 왼쪽 통로로 빠져 U 자로 돌아 들어간다 — 통로에는 카드가 없으므로
    // 이 우회는 어떤 조합에서도 카드를 지나지 않는다.
    if (it.same) {
      const down = it.t.y >= it.s.y;
      const y1 = down ? it.s.y + G.CARD_H : it.s.y;
      const y2 = down ? it.t.y - 3 : it.t.y + G.CARD_H + 3;
      const lo = Math.min(y1, y2);
      const hi = Math.max(y1, y2);
      const blocked = stage.cards.some(
        (c) =>
          c.col === it.s.col &&
          c.code !== it.s.code &&
          c.code !== it.t.code &&
          c.y + G.CARD_H > lo + 1 &&
          c.y < hi - 1,
      );
      if (!blocked) {
        out.push({
          id: it.id,
          type: it.edge.type,
          d: dOf([
            [it.s.cx, y1],
            [it.s.cx, y2],
          ]),
        });
        continue;
      }
      // 왼쪽 통로 — 0열은 통로가 없으므로 레인 라벨과 카드 사이의 빈 띠를 쓴다
      const sx =
        it.s.col > 0 ? R.vert(it.s.col - 1, it.sy, it.ty, true) : G.LABEL_W - 4;
      R.claim(it.sy, sx, it.s.x);
      R.claim(it.ty, sx, it.t.x);
      out.push({
        id: it.id,
        type: it.edge.type,
        d: dOf([
          [it.s.x, it.sy],
          [sx, it.sy],
          [sx, it.ty],
          [it.t.x - 3, it.ty],
        ]),
      });
      continue;
    }
    // 같은 높이 + 사이가 비었으면 직진
    if (Math.abs(it.sy - it.ty) < 1.5 && R.clear(it.sy, it.s.x2, it.t.x)) {
      R.claim(it.sy, it.s.x2, it.t.x);
      out.push({
        id: it.id,
        type: it.edge.type,
        d: dOf([
          [it.s.x2, it.sy],
          [it.t.x - 3, it.ty],
        ]),
      });
      continue;
    }
    rest.push(it);
  }

  // 먼 것(열을 많이 건너뛰는 선)부터 통로를 잡는다 — 짧은 선이 남은 슬롯에 들어간다
  rest.sort((a, b) => b.t.col - b.s.col - (a.t.col - a.s.col) || a.s.cy - b.s.cy);
  for (const it of rest) {
    let pts: [number, number][];
    if (it.t.col - it.s.col === 1) {
      const mx = R.vert(it.s.col, it.sy, it.ty, false);
      const ty = R.pickY(it.ty, mx, it.t.x, 6);
      R.claim(it.sy, it.s.x2, mx);
      R.claim(ty, mx, it.t.x);
      pts = [
        [it.s.x2, it.sy],
        [mx, it.sy],
        [mx, ty],
        [it.t.x - 3, ty],
      ];
    } else {
      // 열을 2개 이상 건너뛰면 출발 직후 통로로 빠져 채널을 타고 도착 직전 통로로
      const bx = R.vert(it.s.col, it.sy, it.ty, false);
      const ax = R.vert(it.t.col - 1, it.sy, it.ty, true);
      const ch = R.chan(it.ty, bx, ax);
      R.claim(it.sy, it.s.x2, bx);
      R.claim(ch, bx, ax);
      R.claim(it.ty, ax, it.t.x);
      pts = [
        [it.s.x2, it.sy],
        [bx, it.sy],
        [bx, ch],
        [ax, ch],
        [ax, it.ty],
        [it.t.x - 3, it.ty],
      ];
    }
    out.push({ id: it.id, type: it.edge.type, d: dOf(pts) });
  }
  return out;
}

/** 선택 과목에서 depth 단계까지 뻗은 관계망 */
export function relationWeb(allEdges: FlowEdge[], code: string | null, depth: number) {
  const nodes = new Map<string, number>();
  const edges: FlowEdge[] = [];
  if (!code) return { nodes, edges };
  nodes.set(code, 0);
  let front = [code];
  for (let d = 1; d <= depth; d += 1) {
    const next: string[] = [];
    for (const cur of front) {
      for (const e of allEdges) {
        if (e.from !== cur && e.to !== cur) continue;
        const other = e.from === cur ? e.to : e.from;
        if (!edges.includes(e)) edges.push(e);
        if (!nodes.has(other)) {
          nodes.set(other, d);
          next.push(other);
        }
      }
    }
    front = next;
  }
  return { nodes, edges };
}

/** 관계 표시 깊이 — 1이면 직접 이웃만 */
export const FOCUS_DEPTH = 1;
