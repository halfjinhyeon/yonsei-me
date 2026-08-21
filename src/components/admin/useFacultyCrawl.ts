'use client';

// 교수 학술활동 자동 수집의 **상태 한 벌** — 머리말 버튼 · 머리말 진행 바 · 진행 패널이
// 같은 값을 본다. 세 곳이 각자 상태를 들면 "버튼은 잠겼는데 진행 바는 멈춰 있는" 어긋남이
// 생기므로 여기 한 곳에서만 만든다(디자인 1a·1c·1d·1e·1f).
//
// 왜 브라우저가 루프를 도는가
//   서버 라우트는 교수 **한 명**만 처리한다(Vercel 함수 60초 상한). 33명을 순차로 부르는
//   주체가 이 훅이다. 응답 하나가 곧 로그 한 줄이라 스트리밍(SSE)도 폴링도 필요 없다.
//   창을 닫으면 루프는 멈추지만, 수집은 병합 전용이라 반쯤 망가진 상태가 남지 않는다 —
//   다시 눌러 이어서 하면 된다(이미 받은 행은 중복으로 붙지 않는다).

import { useCallback, useEffect, useRef, useState } from 'react';

/** 교수 한 명당 예상 소요 — 상세 1 + 리포트 5(+2쪽) 요청에 300ms 지연 (실측 3~5초) */
export const SECONDS_PER_PERSON = 4;

/** 분류 키 → 한국어 라벨. core.ts 의 SECTION_LABEL 과 같은 말을 쓴다
 *  (core 는 서버·CLI 공용 순수 모듈이라 클라이언트 번들로 끌어오지 않는다). */
export const SECTION_LABEL: Record<string, string> = {
  articles: '논문',
  fundings: '연구과제',
  patents: '지적재산권',
  awards: '수상',
  conferences: '학술활동',
};

/** 표시 순서 = 공개 상세 탭 순서 */
export const SECTION_ORDER = ['articles', 'fundings', 'patents', 'awards', 'conferences'] as const;

export interface AddedItem {
  cat: string;
  title: string;
  meta: string;
}

export type RowState = 'waiting' | 'running' | 'added' | 'same' | 'failed';

export interface LogRow {
  name: string;
  state: RowState;
  /** 새로 붙은 행 수 */
  added: number;
  /** 분류별 신규 건수 */
  addedByKey: Record<string, number>;
  /** 새로 붙은 항목 — 줄을 펼치면 보인다 */
  addedItems: AddedItem[];
  /** 받아오지 못한 분류(기존 값 유지) */
  missing: string[];
  error: string | null;
}

interface CrawlResponse {
  name: string;
  added: number;
  addedByKey: Record<string, number>;
  addedItems: AddedItem[];
  missing: string[];
  error?: string;
}

function newRow(name: string): LogRow {
  return { name, state: 'waiting', added: 0, addedByKey: {}, addedItems: [], missing: [], error: null };
}

/** "논문 3 · 연구과제 1" — 신규가 있는 분류만, 화면 순서대로 */
export function addedSummary(row: LogRow): string {
  return SECTION_ORDER.filter((k) => (row.addedByKey[k] ?? 0) > 0)
    .map((k) => `${SECTION_LABEL[k]} ${row.addedByKey[k]}`)
    .join(' · ');
}

/** 소요 시간 사람 말로 — "2분 51초" / "48초" */
export function elapsedLabel(ms: number): string {
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

export interface FacultyCrawlState {
  /** 수집 대상 명단(디렉터리 순서). null = 아직 못 받음 */
  targets: { name: string; crawledAt: string | null }[] | null;
  lastCrawledAt: string | null;
  loadError: string | null;
  running: boolean;
  /** 한 바퀴가 끝났고 결과가 남아 있는 상태 */
  finished: boolean;
  rows: LogRow[];
  /** 지금 처리 중인 교수 이름 */
  currentName: string | null;
  done: number;
  totalAdded: number;
  addedByKey: Record<string, number>;
  okCount: number;
  failedCount: number;
  failedNames: string[];
  /** 0~1. 진행 중이 아니면 null — 머리말 진행 바가 이 값으로 그려진다 */
  progress: number | null;
  /** 완료 시각·소요 시간(완료 뒤에만) */
  finishedAt: Date | null;
  elapsedMs: number;
  /** 패널 열림 */
  open: boolean;
  setOpen: (v: boolean) => void;
  /** 확인 모달 열림 */
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  startAll: () => void;
  retryFailed: () => void;
  retryOne: (name: string) => void;
  stop: () => void;
}

/** @param enabled 교수진 화면에서만 true — 다른 리소스에서 명단을 괜히 받아오지 않는다
 *  (훅은 조건부로 호출할 수 없으므로 호출은 늘 하고 네트워크만 끈다). */
export function useFacultyCrawl(enabled: boolean): FacultyCrawlState {
  const [targets, setTargets] = useState<FacultyCrawlState['targets']>(null);
  const [lastCrawledAt, setLastCrawledAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // 진행 중 중단 신호 — 루프가 매 바퀴 확인한다(보낸 요청은 끝까지 두어 서버 상태를 깨지 않는다)
  const stopRef = useRef(false);

  const loadTargets = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/faculty-crawl');
      const data = (await res.json()) as {
        targets?: { name: string; crawledAt: string | null }[];
        lastCrawledAt?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '명단을 불러오지 못했습니다.');
      setTargets(data.targets ?? []);
      setLastCrawledAt(data.lastCrawledAt ?? null);
    } catch (err) {
      setLoadError((err as Error).message);
      setTargets([]);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadTargets();
  }, [enabled, loadTargets]);

  // 진행 중에는 창을 닫지 못하게 막는다 — 닫으면 루프가 끊긴다.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [running]);

  /** 교수 한 명 수집 — 성공·실패 모두 로그 줄 상태로 환원한다 */
  const crawlOne = useCallback(async (name: string): Promise<LogRow> => {
    const base = newRow(name);
    try {
      const res = await fetch('/api/admin/faculty-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as CrawlResponse;
      if (!res.ok) {
        return { ...base, state: 'failed', error: data.error ?? `수집 실패 (HTTP ${res.status})` };
      }
      return {
        ...base,
        state: data.added > 0 ? 'added' : 'same',
        added: data.added,
        addedByKey: data.addedByKey ?? {},
        addedItems: data.addedItems ?? [],
        missing: data.missing ?? [],
      };
    } catch (err) {
      return { ...base, state: 'failed', error: (err as Error).message };
    }
  }, []);

  /** 주어진 이름들을 순차로 처리한다. 전체 수집과 "다시 시도"가 같은 길을 쓴다. */
  const runFor = useCallback(
    async (names: string[]) => {
      stopRef.current = false;
      setRunning(true);
      setOpen(true);
      const began = Date.now();
      setStartedAt(began);
      setFinishedAt(null);
      for (const name of names) {
        if (stopRef.current) break;
        setRows((prev) => prev.map((r) => (r.name === name ? { ...r, state: 'running' } : r)));
        const result = await crawlOne(name);
        setRows((prev) => prev.map((r) => (r.name === name ? result : r)));
      }
      setRunning(false);
      setFinishedAt(new Date());
      setElapsedMs(Date.now() - began);
      void loadTargets(); // 마지막 수집일 갱신
    },
    [crawlOne, loadTargets],
  );

  const startAll = useCallback(() => {
    setConfirming(false);
    const names = (targets ?? []).map((t) => t.name);
    setRows(names.map(newRow));
    void runFor(names);
  }, [runFor, targets]);

  const retryFailed = useCallback(() => {
    const names = rows.filter((r) => r.state === 'failed').map((r) => r.name);
    if (names.length === 0) return;
    setRows((prev) => prev.map((r) => (names.includes(r.name) ? newRow(r.name) : r)));
    void runFor(names);
  }, [rows, runFor]);

  const retryOne = useCallback(
    (name: string) => {
      setRows((prev) => prev.map((r) => (r.name === name ? newRow(name) : r)));
      void runFor([name]);
    },
    [runFor],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const done = rows.filter((r) => r.state !== 'waiting' && r.state !== 'running').length;
  const totalAdded = rows.reduce((sum, r) => sum + r.added, 0);
  const addedByKey: Record<string, number> = {};
  for (const row of rows) {
    for (const [key, n] of Object.entries(row.addedByKey)) {
      if (n > 0) addedByKey[key] = (addedByKey[key] ?? 0) + n;
    }
  }

  return {
    targets,
    lastCrawledAt,
    loadError,
    running,
    finished: rows.length > 0 && !running,
    rows,
    currentName: rows.find((r) => r.state === 'running')?.name ?? null,
    done,
    totalAdded,
    addedByKey,
    okCount: rows.filter((r) => r.state === 'added' || r.state === 'same').length,
    failedCount: rows.filter((r) => r.state === 'failed').length,
    failedNames: rows.filter((r) => r.state === 'failed').map((r) => r.name),
    progress: running && rows.length > 0 ? done / rows.length : null,
    finishedAt,
    elapsedMs: startedAt && running ? Date.now() - startedAt : elapsedMs,
    open,
    setOpen,
    confirming,
    setConfirming,
    startAll,
    retryFailed,
    retryOne,
    stop,
  };
}
