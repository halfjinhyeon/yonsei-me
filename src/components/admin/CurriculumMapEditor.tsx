'use client';

// 교과목 체계도 편집 화면 — "학생이 보는 그림 위에서 그대로 고친다".
//
// 다른 리소스처럼 목록+폼으로 만들 수 없는 데이터다. course-flow.json 은 배열도
// 키-객체도 아닌 {nodes, edges} 한 덩어리이고, 무엇보다 "어느 카드가 어디 있고 어떤
// 선으로 이어지는가"는 표로 봐서는 알 수 없다. 그래서 판·라우터를 사이트와 같은
// 모듈(@/lib/curriculum-map)에서 가져와 같은 좌표계로 그리고, 그 위에서 조작한다.
//
// 여기서 고치는 것 두 가지:
//   1. 화살표 — 선수·직결(실선) / 연계·권장(점선). 카드 두 장을 이어서 만든다.
//   2. 카드의 칸 안 세로 자리(nodes[].row) — 끌어 옮기거나 ↑↓ 키로.
// 여기서 고치지 않는 것: 과목 추가·삭제와 학년·학기·분야. 그건 편람 데이터
// (courses-undergraduate.json)이고 '학부 교과목' 화면의 몫이다 — 체계도에서 바꾸면
// 개설 교과목 표까지 함께 흔들린다.
//
// (내부 운영 도구라 한국어 UI 문자열을 컴포넌트에 직접 둔다.)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { commitJson, loadJson, type RepoConfig } from '@/lib/admin/content-api';
import { MANAGED_FILES } from '@/lib/admin/managed-content';
import type { ScreenDef } from '@/lib/admin/resources';
import {
  buildCurriculumModel,
  buildStage,
  colX,
  columnLabel,
  edgeKey,
  G,
  isRequired,
  kindLabel,
  LANE_KEYS,
  laneOf,
  relationWeb,
  routeSet,
  type CurriculumCourse,
  type CurriculumMapData,
  type FlowEdge,
} from '@/lib/curriculum-map';
import { useAdminShell } from './AdminShellContext';
import { useRegisterTray, type PendingChange } from './ChangeTrayContext';
import { CmsPanelHead } from './CmsPanelHead';

/** 레인 라벨 — 사이트는 messages/*.json 을 쓰지만 콘솔은 한국어 고정이라 여기 둔다 */
const LANE_LABEL: Record<string, string> = {
  basics: '기초·공통',
  mechanicsMaterials: '역학 · 소재',
  designManufacturing: '설계 · 제조',
  roboticsControl: '로보틱스 · 제어',
  energyThermofluid: '에너지 · 열유체',
  microNano: '마이크로 · 나노',
  bioPhotonics: '바이오 · 포토닉스',
};

const TYPE_LABEL: Record<FlowEdge['type'], string> = {
  prereq: '선수 · 직결 (실선)',
  soft: '연계 · 권장 (점선)',
};

type Mode = 'move' | 'link';

interface Props {
  config: RepoConfig;
  screen: ScreenDef;
  onDirtyChange: (dirty: boolean) => void;
}

export function CurriculumMapEditor({ config, screen, onDirtyChange }: Props) {
  const { showToast } = useAdminShell();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CurriculumCourse[]>([]);
  /** 로드 시점 원본 — 되돌리기·차이 계산의 기준이자 `_comment` 보존처 */
  const [base, setBase] = useState<CurriculumMapData | null>(null);
  const [sha, setSha] = useState('');

  /** 현재 값 — 과목 전체를 덮는 슬롯 표(원본에 없던 과목도 자동 배치 결과로 채운다) */
  const [rows, setRows] = useState<Record<string, number>>({});
  const [baseRows, setBaseRows] = useState<Record<string, number>>({});
  const [edges, setEdges] = useState<FlowEdge[]>([]);

  const [mode, setMode] = useState<Mode>('move');
  const [linkType, setLinkType] = useState<FlowEdge['type']>('prereq');
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // ── 로드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [flow, cs] = await Promise.all([
          loadJson<CurriculumMapData>(config, screen.file),
          loadJson<CurriculumCourse[]>(config, MANAGED_FILES.coursesUndergraduate),
        ]);
        if (!alive) return;
        const slots = new Map<string, number>(
          (flow.data.nodes ?? [])
            .filter((n) => typeof n.row === 'number')
            .map((n) => [n.code, n.row as number] as const),
        );
        // 원본 배치를 한 번 계산해 "자동으로 놓인 자리"까지 포함한 완전한 표를 만든다 —
        // 그래야 되돌리기의 기준값이 언제나 구체적인 숫자가 된다.
        const seeded = buildCurriculumModel(cs.data, slots);
        const table: Record<string, number> = {};
        for (const c of seeded.cards) table[c.code] = c.row;
        setCourses(cs.data);
        setBase(flow.data);
        setSha(flow.sha);
        setRows(table);
        setBaseRows(table);
        setEdges((flow.data.edges ?? []).map((e) => ({ ...e })));
      } catch (err) {
        if (alive) setLoadError(err instanceof Error ? err.message : '불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [config, screen.file]);

  // ── 판 계산 — 사이트와 같은 모듈. 레인마다 한 줄씩 여유를 둬 "한 칸 더 아래"로
  //    끌어 내릴 자리를 만든다(사이트에는 없는 편집 전용 여유). ─────────────
  const model = useMemo(
    () => buildCurriculumModel(courses, new Map(Object.entries(rows))),
    [courses, rows],
  );
  const stage = useMemo(() => buildStage(model, { extraRows: 1 }), [model]);

  const nameOf = useCallback(
    (code: string) => model.byCode.get(code)?.name ?? code,
    [model.byCode],
  );

  // 선택(또는 잇는 중)한 과목의 관계만 그린다 — 사이트와 같은 포커스 문법.
  // '화살표 모두 보기'를 켜면 전부 그린다(편집 중 전체 그림을 확인하는 용도).
  const focus = linkFrom ?? selected;
  const web = useMemo(() => relationWeb(edges, focus, 1), [edges, focus]);
  const lines = useMemo(() => {
    const drawn = (showAll ? edges : web.edges).filter(
      (e) => stage.pos.has(e.from) && stage.pos.has(e.to),
    );
    if (drawn.length === 0) return [];
    return routeSet(stage, drawn);
  }, [showAll, edges, web.edges, stage]);
  /** 선 하나가 어떤 관계인지 — 클릭 삭제용 역인덱스 */
  const edgeByKey = useMemo(() => new Map(edges.map((e) => [edgeKey(e), e])), [edges]);

  // ── 조작 ────────────────────────────────────────────────────────────
  const laneRowsOf = useCallback(
    (laneIdx: number) => stage.lanes.find((l) => l.key === LANE_KEYS[laneIdx])?.rows ?? 1,
    [stage.lanes],
  );

  /** 카드를 칸 안 targetRow 로. 이미 그 자리에 다른 카드가 있으면 자리를 맞바꾼다. */
  const moveCard = useCallback(
    (code: string, targetRow: number) => {
      const me = model.cards.find((c) => c.code === code);
      if (!me) return;
      const max = laneRowsOf(me.laneIdx) - 1;
      const row = Math.max(0, Math.min(max, targetRow));
      if (row === me.row) return;
      const occupant = model.cards.find(
        (c) => c.code !== code && c.laneIdx === me.laneIdx && c.col === me.col && c.row === row,
      );
      setRows((prev) => {
        const next = { ...prev, [code]: row };
        if (occupant) next[occupant.code] = me.row;
        return next;
      });
    },
    [model.cards, laneRowsOf],
  );

  /** 카드 두 장을 잇는다. 방향은 시간 순(왼쪽 열 → 오른쪽 열)으로 자동 결정한다. */
  const linkCards = useCallback(
    (aCode: string, bCode: string) => {
      const a = stage.pos.get(aCode);
      const b = stage.pos.get(bCode);
      if (!a || !b || aCode === bCode) return;
      // 같은 열이면 위에 있는 카드가 앞 과목이다(체계도는 위→아래도 시간 순으로 읽힌다).
      // row 가 아니라 y 로 비교한다 — 레인이 다르면 row 0 끼리도 위아래가 갈린다.
      const forward = a.col !== b.col ? a.col < b.col : a.y <= b.y;
      const from = forward ? aCode : bCode;
      const to = forward ? bCode : aCode;
      const key = `${from}>${to}`;
      const existing = edgeByKey.get(key);
      if (existing && existing.type === linkType) {
        showToast(`${nameOf(from)} → ${nameOf(to)} 은 이미 이어져 있습니다.`);
        return;
      }
      setEdges((prev) =>
        existing
          ? prev.map((e) => (edgeKey(e) === key ? { ...e, type: linkType } : e))
          : [...prev, { from, to, type: linkType }],
      );
      showToast(
        existing
          ? `${nameOf(from)} → ${nameOf(to)} 관계를 ${TYPE_LABEL[linkType]} 로 바꿨습니다.`
          : `${nameOf(from)} → ${nameOf(to)} 를 이었습니다.`,
      );
    },
    [stage.pos, edgeByKey, linkType, nameOf, showToast],
  );

  const removeEdge = useCallback(
    (key: string) => {
      setEdges((prev) => prev.filter((e) => edgeKey(e) !== key));
    },
    [],
  );

  // ── 카드 드래그 — 세로로만, 슬롯에 스냅 ────────────────────────────────
  // 라이브러리 없이 포인터 이벤트로 처리한다. 끌기 중에도 rows 를 그대로 갱신하므로
  // 화살표까지 실시간으로 다시 그려진다("옮기면 어떻게 되는지"를 놓기 전에 본다).
  const drag = useRef<{ code: string; startY: number; startRow: number; moved: boolean } | null>(
    null,
  );

  const onCardPointerDown = (e: React.PointerEvent<HTMLButtonElement>, code: string, row: number) => {
    if (mode !== 'move' || e.button !== 0) return;
    drag.current = { code, startY: e.clientY, startRow: row, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onCardPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((e.clientY - d.startY) / G.PITCH);
    if (delta !== 0) d.moved = true;
    moveCard(d.code, d.startRow + delta);
  };
  const endDrag = (e: React.PointerEvent<HTMLButtonElement>, code: string) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // 움직이지 않았으면 그냥 클릭이다 — 선택으로 처리한다
    if (d && !d.moved) selectCard(code);
  };

  const selectCard = (code: string) => {
    if (mode === 'link') {
      if (!linkFrom) {
        setLinkFrom(code);
        setSelected(code);
        return;
      }
      linkCards(linkFrom, code);
      setLinkFrom(null);
      return;
    }
    setSelected((cur) => (cur === code ? null : code));
  };

  const onCardKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, code: string, row: number) => {
    if (mode !== 'move') return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveCard(code, row - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveCard(code, row + 1);
    }
  };

  // Esc — 잇기 취소 / 선택 해제
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (linkFrom) setLinkFrom(null);
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkFrom]);

  // 도구를 바꾸면 잇던 것은 취소한다 — 모드가 섞여 엉뚱한 관계가 생기지 않게
  useEffect(() => {
    setLinkFrom(null);
  }, [mode]);

  // ── 변경 목록(트레이) ────────────────────────────────────────────────
  const changes = useMemo<PendingChange[]>(() => {
    if (!base) return [];
    const out: PendingChange[] = [];
    for (const card of model.cards) {
      const before = baseRows[card.code];
      if (before === undefined || before === card.row) continue;
      out.push({
        id: `row:${card.code}`,
        scopeLabel: '교과목 체계도',
        itemLabel: card.course.name,
        fieldLabel: '세로 자리',
        before: `${before + 1}번째 줄`,
        after: `${card.row + 1}번째 줄`,
      });
    }
    const orig = new Map((base.edges ?? []).map((e) => [edgeKey(e), e.type]));
    const cur = new Map(edges.map((e) => [edgeKey(e), e.type]));
    for (const [key, type] of cur) {
      const was = orig.get(key);
      if (was === type) continue;
      const [from, to] = key.split('>');
      out.push({
        id: `edge:${key}`,
        scopeLabel: '교과목 체계도',
        itemLabel: `${nameOf(from)} → ${nameOf(to)}`,
        fieldLabel: '관계',
        before: was ? TYPE_LABEL[was] : '없음',
        after: TYPE_LABEL[type],
      });
    }
    for (const [key, type] of orig) {
      if (cur.has(key)) continue;
      const [from, to] = key.split('>');
      out.push({
        id: `edge:${key}`,
        scopeLabel: '교과목 체계도',
        itemLabel: `${nameOf(from)} → ${nameOf(to)}`,
        fieldLabel: '관계',
        before: TYPE_LABEL[type],
        after: '없음',
      });
    }
    return out;
  }, [base, baseRows, model.cards, edges, nameOf]);

  useEffect(() => {
    onDirtyChange(changes.length > 0);
  }, [changes.length, onDirtyChange]);

  const revert = useCallback(
    (id: string) => {
      if (!base) return;
      if (id.startsWith('row:')) {
        const code = id.slice(4);
        const was = baseRows[code];
        if (was === undefined) return;
        const me = model.cards.find((c) => c.code === code);
        setRows((prev) => {
          const next = { ...prev, [code]: was };
          // 옮기기는 자리 맞바꿈이었다 — 한쪽만 되돌리면 두 카드가 같은 슬롯에
          // 겹친다. 돌아갈 자리를 지금 차지한 카드를 이 카드가 있던 자리로 보낸다.
          if (me) {
            const occupant = model.cards.find(
              (c) =>
                c.code !== code &&
                c.laneIdx === me.laneIdx &&
                c.col === me.col &&
                prev[c.code] === was,
            );
            if (occupant) next[occupant.code] = prev[code];
          }
          return next;
        });
        return;
      }
      const key = id.slice(5);
      const was = (base.edges ?? []).find((e) => edgeKey(e) === key);
      setEdges((prev) => {
        const rest = prev.filter((e) => edgeKey(e) !== key);
        return was ? [...rest, { ...was }] : rest;
      });
    },
    [base, baseRows, model.cards],
  );

  const revertAll = useCallback(() => {
    if (!base) return;
    setRows(baseRows);
    setEdges((base.edges ?? []).map((e) => ({ ...e })));
  }, [base, baseRows]);

  const save = useCallback(async () => {
    if (!base) return;
    // nodes 순서는 원본을 최대한 지킨다 — 파일 디프가 "바꾼 줄"만 남게 하려는 것.
    const seen = new Set<string>();
    const nodes: { code: string; row: number }[] = [];
    for (const n of base.nodes ?? []) {
      const row = rows[n.code];
      if (row === undefined || seen.has(n.code)) continue;
      seen.add(n.code);
      nodes.push({ code: n.code, row });
    }
    for (const c of model.cards) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      nodes.push({ code: c.code, row: c.row });
    }
    const next: CurriculumMapData = { ...base, nodes, edges };
    const res = await commitJson(config, screen.file, next, sha, '교과목 체계도 수정');
    setSha(res.sha);
    setBase(next);
    setBaseRows(rows);
    showToast('저장했습니다 — 사이트에 곧(수 초 내) 반영됩니다.');
  }, [base, rows, edges, model.cards, config, screen.file, sha, showToast]);

  useRegisterTray(
    changes.length > 0
      ? { changes, revert, revertAll, save, saveLabel: `${changes.length}건` }
      : null,
  );

  // ── 선택 과목 패널 ──────────────────────────────────────────────────
  const selCourse = selected ? model.byCode.get(selected) ?? null : null;
  const relations = useMemo(() => {
    if (!selected) return { prev: [] as FlowEdge[], next: [] as FlowEdge[] };
    return {
      prev: edges.filter((e) => e.to === selected),
      next: edges.filter((e) => e.from === selected),
    };
  }, [edges, selected]);

  if (loading) {
    return (
      <div>
        <CmsPanelHead kind="collection" title={screen.label} description={screen.description} />
        <p className="text-sm text-content-faint">불러오는 중…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div>
        <CmsPanelHead kind="collection" title={screen.label} description={screen.description} />
        <p className="border border-[#b42318] bg-[#fdf3f2] p-4 text-sm text-[#b42318]">
          {loadError}
        </p>
      </div>
    );
  }

  const statusText = linkFrom
    ? `${nameOf(linkFrom)} 에서 출발 — 이을 과목을 누르세요 (Esc 취소)`
    : mode === 'link'
      ? '이을 두 과목을 차례로 누르세요. 화살표 방향은 학기 순서대로 자동 결정됩니다.'
      : selected
        ? `${nameOf(selected)} 선택됨 — 카드를 끌거나 ↑↓ 키로 자리를 옮깁니다`
        : '카드를 끌어 칸 안 자리를 옮기거나, 눌러서 관계를 확인하세요';

  return (
    <div>
      <CmsPanelHead
        kind="collection"
        title={screen.label}
        description={screen.description}
        siteUrl="/ko/undergraduate/curriculum"
      />

      {/* 도구 — 무엇을 고치는 중인지가 곧 클릭의 의미를 바꾸므로 판 바로 위에 둔다 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-content-faint">편집 도구</span>
          <div className="flex">
            {(
              [
                ['move', '카드 자리 옮기기'],
                ['link', '관계 잇기'],
              ] as const
            ).map(([id, label], i) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={cn(
                  'border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue',
                  i > 0 && '-ml-px',
                  mode === id
                    ? 'border-yonsei-navy bg-yonsei-navy text-white'
                    : 'border-surface-border bg-surface text-content hover:border-yonsei-blue hover:text-yonsei-blue',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'link' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-content-faint">관계 종류</span>
            <div className="flex">
              {(
                [
                  ['prereq', '선수 · 직결'],
                  ['soft', '연계 · 권장'],
                ] as const
              ).map(([id, label], i) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLinkType(id)}
                  aria-pressed={linkType === id}
                  className={cn(
                    'flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue',
                    i > 0 && '-ml-px',
                    linkType === id
                      ? 'border-yonsei-navy bg-yonsei-navy text-white'
                      : 'border-surface-border bg-surface text-content hover:border-yonsei-blue hover:text-yonsei-blue',
                  )}
                >
                  <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
                    <line
                      x1="1"
                      y1="4"
                      x2="15"
                      y2="4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeDasharray={id === 'soft' ? '3 3' : undefined}
                    />
                    <path d="M14 1.6 L18.5 4 L14 6.4 Z" fill="currentColor" />
                  </svg>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs font-semibold text-content">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#003377]"
          />
          화살표 모두 보기
        </label>
      </div>

      <p
        aria-live="polite"
        className={cn(
          'mb-3 text-xs',
          linkFrom ? 'font-semibold text-yonsei-blue' : 'text-content-faint',
        )}
      >
        {statusText}
      </p>

      {/* 판 — 사이트와 같은 좌표계·같은 라우터. 넘치면 이 래퍼가 횡스크롤한다. */}
      <div className="overflow-x-auto border border-surface-border bg-surface p-4">
        <div className="relative" style={{ width: stage.width, height: stage.height }}>
          <svg
            aria-hidden="true"
            width={stage.width}
            height={stage.height}
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
          >
            <defs>
              <marker
                id="cme-arrow"
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
                strokeWidth={1.8}
                strokeDasharray={ln.type === 'soft' ? '3 3' : undefined}
                markerEnd="url(#cme-arrow)"
                opacity={showAll && focus && !edgeByKey.has(ln.id) ? 0.3 : 1}
              />
            ))}
          </svg>

          {/* 열 머리글 */}
          {model.columns.map((col, i) => {
            const label = columnLabel(col.year, col.semester, true);
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

          {/* 레인 라벨 */}
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
                {LANE_LABEL[lane.key] ?? lane.key}
              </span>
            </div>
          ))}

          {/* 과목 카드 */}
          {stage.cards.map((card) => {
            const c = card.course;
            const filled = isRequired(c.kind);
            const isSel = selected === c.code;
            const isSource = linkFrom === c.code;
            const near = focus !== null && web.nodes.has(c.code) && !isSel && !isSource;
            return (
              <button
                key={c.code}
                type="button"
                onPointerDown={(e) => onCardPointerDown(e, c.code, card.row)}
                onPointerMove={onCardPointerMove}
                onPointerUp={(e) => endDrag(e, c.code)}
                onPointerCancel={(e) => endDrag(e, c.code)}
                onClick={(e) => {
                  // 옮기기 모드의 클릭은 endDrag 가 처리한다(끌기와 구분하기 위해).
                  if (mode === 'move') {
                    e.preventDefault();
                    return;
                  }
                  selectCard(c.code);
                }}
                onKeyDown={(e) => onCardKeyDown(e, c.code, card.row)}
                aria-pressed={isSel}
                title={`${c.code} · ${c.credits}학점 · ${kindLabel(c.kind, true)} · ${LANE_LABEL[LANE_KEYS[card.laneIdx]]}`}
                className={cn(
                  'absolute box-border flex touch-none select-none items-center justify-center rounded-[2px] border px-1.5 text-xs font-semibold leading-tight -tracking-[0.03em] outline-none transition-[box-shadow,background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-yonsei-blue',
                  mode === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair',
                  filled
                    ? 'border-yonsei-navy bg-yonsei-navy text-white'
                    : 'border-yonsei-navy/35 bg-surface text-content',
                  isSource && 'z-[16] ring-2 ring-[#b42318] ring-offset-1 ring-offset-surface',
                  isSel && !isSource && 'z-[14] ring-2 ring-yonsei-blue/60 ring-offset-1 ring-offset-surface',
                  near && 'z-[12] border-yonsei-blue',
                  !isSel && !isSource && !near && 'z-10',
                )}
                style={{ left: card.x, top: card.y, width: G.CARD_W, height: G.CARD_H }}
              >
                <span className="block max-w-full truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 과목 — 관계 목록과 삭제. 화살표를 지우는 유일한 자리다. */}
      <div className="mt-6 border-t-2 border-yonsei-navy pt-4">
        {selCourse ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-base font-bold text-content">{selCourse.name}</h3>
              <span className="text-xs font-semibold tabular-nums text-yonsei-navy">
                {selCourse.code}
              </span>
              <span className="text-xs text-content-faint">
                {selCourse.credits}학점 · {kindLabel(selCourse.kind, true)} ·{' '}
                {LANE_LABEL[laneOf(selCourse)]} ·{' '}
                {(() => {
                  const l = columnLabel(selCourse.year, selCourse.semester, true);
                  return `${l.top} ${l.bottom}`;
                })()}
              </span>
            </div>

            <div className="mt-4 grid gap-x-10 gap-y-5 md:grid-cols-2">
              {(
                [
                  ['먼저 듣는 과목 (선수 · 연계)', relations.prev, 'from'],
                  ['이어지는 과목 (후속)', relations.next, 'to'],
                ] as const
              ).map(([heading, list, side]) => (
                <div key={side}>
                  <p className="text-[11px] font-bold tracking-[0.08em] text-content-faint">
                    {heading}
                  </p>
                  {list.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {list.map((e) => (
                        <li
                          key={edgeKey(e)}
                          className={cn(
                            'flex items-center gap-1 rounded-[2px] border px-2 py-1 text-xs font-semibold text-content',
                            e.type === 'soft'
                              ? 'border-dashed border-yonsei-navy/45'
                              : 'border-yonsei-navy/35',
                          )}
                        >
                          {nameOf(e[side])}
                          <button
                            type="button"
                            onClick={() => removeEdge(edgeKey(e))}
                            aria-label={`${nameOf(e.from)} → ${nameOf(e.to)} 관계 삭제`}
                            title="이 관계 삭제"
                            className="-mr-1 ml-0.5 p-0.5 text-content-faint transition-colors hover:text-[#b42318] focus-visible:outline focus-visible:outline-2 focus-visible:outline-yonsei-blue"
                          >
                            <svg
                              viewBox="0 0 12 12"
                              className="h-2.5 w-2.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <path d="M1 1l10 10M11 1L1 11" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-content-faint">없음</p>
                  )}
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-content-faint">
              관계를 더하려면 위에서 <strong className="font-semibold">관계 잇기</strong> 를 고른
              뒤 두 과목을 차례로 누르세요.
            </p>
          </>
        ) : (
          <p className="text-sm text-content-faint">
            과목을 누르면 그 과목의 선수 · 후속 관계가 여기에 표시되고, 하나씩 지울 수 있습니다.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-content-faint">
        ※ 과목을 새로 만들거나 지우는 일, 학년 · 학기 · 분야(어느 칸에 놓일지)를 바꾸는 일은{' '}
        <strong className="font-semibold text-content-soft">학부 교과목</strong> 화면에서 합니다.
        여기서 새 과목은 칸의 빈 자리에 자동으로 들어가며, 그 뒤 자리를 옮기면 됩니다.
      </p>
    </div>
  );
}
