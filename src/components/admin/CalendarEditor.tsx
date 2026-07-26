'use client';

// 일정(캘린더) 편집 화면 — 월 그리드 + 편집 패널.
//
// 다른 리소스는 "목록을 훑으며 고친다"가 기본 동작이라 표·카드가 맞지만, 일정은
// "이 달에 무엇이 있나"를 먼저 보고 빈 날짜에 만든다. 그래서 목록을 아예 달력으로
// 바꾸고, 날짜 칸의 `+ 일정` 이 곧 새 항목 만들기가 되게 했다.
//
// 화면에는 두 종류의 일정이 함께 뜬다.
//  - 캘린더 전용(content/calendar.json): 여기서 만들고 고치고 지운다.
//  - 게시판 연동(행사 · 동문 행사 게시판 글): **읽기 전용**. 관리자가 한 화면에서
//    "이 달에 뭐가 있나"를 보려면 함께 보여야 하지만, 원본은 Supabase 의 게시글이라
//    여기서 고치면 두 곳에 진실이 생긴다. 그래서 기울임 회색 칩으로 구분하고 누르면
//    해당 게시판으로 보낸다.
//
// 기간 일정은 **시작일 칩에 ▸ 를 붙이고 기간 내 모든 칸에 반복** 노출한다(가로 스팬
// 아님). 스팬은 주 경계에서 조각내야 하고, 겹치는 일정마다 행 슬롯을 배정해야 해서
// 칸마다 `+ 일정` 버튼의 위치가 흔들린다. 반복 칩은 각 칸이 독립적이라 어느 날짜를
// 눌러도 같은 동작이 나오고, 구현도 DOM 도 단순하다.
//
// 저장 자체는 하지 않는다 — 추가·수정·삭제 모두 상위(CollectionEditor)의 초안 배열을
// 갈아 끼우고, 변경 트레이에 쌓였다가 한 번에 커밋된다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { civilFromDays, daysInMonth, isoToDays, toIso } from '@/lib/calendar';
import { getBoard, type BoardKey } from '@/lib/admin/boards';
import { itemId, newCalendarItem } from '@/lib/admin/calendar-draft';
import {
  CALENDAR_CATEGORY_OPTIONS,
  type FormRecord,
  type LocalizedPair,
  type ResourceDef,
} from '@/lib/admin/resources';
import { useAdminShell } from './AdminShellContext';
import { CmsModal } from './CmsModal';

/**
 * 분류 색.
 * ⚠️ 시안은 '모집·신청'에 금색(#8A6D2F)을 쓰지만 이 프로젝트는 금색이 금지되어
 * sky(#2E86D6)로 대체했다 — 네이비·블루·스카이가 한 계열로 이어지고 시험(붉은색)만
 * 대비로 튀어 위계도 오히려 또렷하다.
 */
const CATEGORY_COLOR: Record<string, string> = {
  academic: '#003377',
  event: '#0057A8',
  recruit: '#2E86D6',
  exam: '#b42318',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 요일 색 — 일요일 붉은색, 토요일 블루, 평일 회색(사이트 학사일정 표기 관례) */
const WEEKDAY_COLOR = ['#b42318', '#6e6e6e', '#6e6e6e', '#6e6e6e', '#6e6e6e', '#6e6e6e', '#0057A8'];

/** 캘린더에 함께 그리는 게시판 글 — 읽기 전용 */
const BOARD_SOURCES: BoardKey[] = ['events', 'alumniEvents'];

interface BoardEvent {
  key: string;
  boardKey: BoardKey;
  title: string;
  start: string;
  end: string;
}

/** /api/admin/posts 응답 중 캘린더가 쓰는 필드만 */
interface ApiPost {
  id: string;
  date?: string;
  endDate?: string;
  titleKo?: string;
  isEvent?: boolean;
}

interface Props {
  resource: ResourceDef;
  /** 현재 초안(원본 + 대기 변경이 반영된 전체 목록) */
  items: FormRecord[];
  /** 대기 변경이 걸린 항목 id — 칩에 옅은 파란 면으로 표시한다 */
  dirtyIds: Set<string>;
  busy: boolean;
  onChange: (next: FormRecord[]) => void;
}

/** 시작·종료(ISO). 종료가 없거나 시작보다 앞서면 하루로 축약 */
function rangeOf(form: FormRecord): { start: string; end: string } {
  const start = String(form.start ?? '').trim();
  const end = String(form.end ?? '').trim();
  return { start, end: end && end > start ? end : start };
}

function titleOf(form: FormRecord): string {
  const pair = (form.title ?? { ko: '', en: '' }) as LocalizedPair;
  return pair.ko.trim();
}

export function CalendarEditor({ resource, items, dirtyIds, busy, onChange }: Props) {
  const { openEntry } = useAdminShell();

  // '오늘'은 KST 기준 — 서버 시간대와 무관하게 한국 날짜 경계를 쓴다(홈 캘린더와 동일).
  const today = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    [],
  );
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m };
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardNotice, setBoardNotice] = useState<BoardEvent | null>(null);
  const [boardEvents, setBoardEvents] = useState<BoardEvent[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);
  // `+ 일정` 으로 만든 항목만 제목에 포커스를 준다(기존 칩을 눌러 연 경우는 제외 —
  // 읽으려고 연 패널에서 커서가 잡히면 화면이 스크롤되어 달력이 시야에서 밀린다).
  const focusIdRef = useRef<string | null>(null);

  // 게시판 연동 일정 조회 — BoardEditor 가 쓰는 목록 조회 경로를 그대로 재사용한다.
  // ⚠️ 실패해도 조용히 비운다. 게시판(Supabase)이 막혀 있다고 해서 캘린더 전용 일정
  //    편집까지 막히면 안 된다(둘은 저장소가 다르다).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const out: BoardEvent[] = [];
      for (const boardKey of BOARD_SOURCES) {
        try {
          const res = await fetch(`/api/admin/posts?board=${boardKey}`);
          if (!res.ok) continue;
          const data = (await res.json()) as { items?: ApiPost[] };
          for (const p of data.items ?? []) {
            // 동문 게시판은 '행사로 표시'한 글만 캘린더에 오른다(page.tsx 와 같은 규칙)
            if (boardKey === 'alumniEvents' && p.isEvent !== true) continue;
            const start = (p.date ?? '').trim();
            if (!start) continue;
            const end = (p.endDate ?? '').trim();
            out.push({
              key: `${boardKey}:${p.id}`,
              boardKey,
              title: (p.titleKo ?? '').trim() || '(제목 없음)',
              start,
              end: end && end > start ? end : start,
            });
          }
        } catch {
          /* 조회 실패는 무시 — 캘린더 전용 일정은 그대로 동작해야 한다 */
        }
      }
      if (alive) setBoardEvents(out);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 새로 만든 항목의 제목에 포커스 (패널이 그려진 뒤)
  useEffect(() => {
    if (selectedId && focusIdRef.current === selectedId) {
      titleRef.current?.focus();
      focusIdRef.current = null;
    }
  }, [selectedId]);

  // ---- 월 그리드 계산 (Date 객체를 거치지 않는 순수 정수 연산 — lib/calendar) ----

  const grid = useMemo(() => {
    const firstOrd = isoToDays(toIso(cursor.y, cursor.m, 1));
    // 일련번호 0 = 1970-01-01 = 목요일 기준 산술 요일(0=일 … 6=토)
    const lead = (((firstOrd + 4) % 7) + 7) % 7;
    const total = daysInMonth(cursor.y, cursor.m);
    const cells = Math.ceil((lead + total) / 7) * 7;
    return Array.from({ length: cells }, (_, i) => {
      const c = civilFromDays(firstOrd - lead + i);
      return {
        iso: toIso(c.y, c.m, c.d),
        day: c.d,
        dow: i % 7,
        inMonth: c.y === cursor.y && c.m === cursor.m,
      };
    });
  }, [cursor]);

  const monthStart = toIso(cursor.y, cursor.m, 1);
  const monthEnd = toIso(cursor.y, cursor.m, daysInMonth(cursor.y, cursor.m));
  /** 기간이 이 달과 겹치는가 — 8월에 시작해 9월에 끝나는 일정은 두 달 모두에서 센다 */
  const overlapsMonth = (r: { start: string; end: string }) =>
    r.start <= monthEnd && r.end >= monthStart;

  const monthItems = items.filter((f) => overlapsMonth(rangeOf(f)));
  const monthBoard = boardEvents.filter(overlapsMonth);

  const legend = CALENDAR_CATEGORY_OPTIONS.map((o) => ({
    ...o,
    count: monthItems.filter((f) => String(f.category ?? '') === o.value).length,
  }));

  // ---- 편집 동작 (전부 상위 초안 배열 교체) ----

  const selected = items.find((f) => itemId(f) === selectedId) ?? null;

  const addAt = useCallback(
    (iso: string) => {
      const created = newCalendarItem(iso, items.map(itemId));
      focusIdRef.current = itemId(created);
      onChange([...items, created]);
      setSelectedId(itemId(created));
    },
    [items, onChange],
  );

  const patch = useCallback(
    (key: string, value: string, sub?: 'ko' | 'en') => {
      if (!selectedId) return;
      onChange(
        items.map((f) => {
          if (itemId(f) !== selectedId) return f;
          if (sub) {
            const cur = (f[key] ?? { ko: '', en: '' }) as LocalizedPair;
            return { ...f, [key]: { ...cur, [sub]: value } };
          }
          return { ...f, [key]: value };
        }),
      );
      // 시작일을 다른 달로 옮기면 그 달로 따라간다 — 방금 고친 일정이 화면에서
      // 사라지면 어디로 갔는지 확인할 방법이 없다.
      if (key === 'start' && !Number.isNaN(isoToDays(value))) {
        const [y, m] = value.split('-').map(Number);
        setCursor({ y, m });
      }
    },
    [items, onChange, selectedId],
  );

  // 삭제도 트레이에 담긴다 — 확인 모달을 두지 않는 이유가 이것이다. 잘못 눌러도
  // 트레이에서 되돌릴 수 있고, 커밋 전까지 저장소에는 아무 일도 일어나지 않는다.
  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    onChange(items.filter((f) => itemId(f) !== selectedId));
    setSelectedId(null);
  }, [items, onChange, selectedId]);

  const moveMonth = (delta: number) => {
    setCursor((c) => {
      const total = c.y * 12 + (c.m - 1) + delta;
      return { y: Math.floor(total / 12), m: (total % 12) + 1 };
    });
  };

  return (
    <div>
      {/* ---- 월 이동 · 건수 · 범례 ---- */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label="이전 달"
            className="cms-btn cms-btn-sm px-3.5 font-bold"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="다음 달"
            className="cms-btn cms-btn-sm px-3.5 font-bold"
          >
            ›
          </button>
        </span>
        <strong className="text-[20px] font-bold tracking-tight tabular-nums text-content">
          {cursor.y}년 {cursor.m}월
        </strong>
        <button
          type="button"
          onClick={() => {
            const [y, m] = today.split('-').map(Number);
            setCursor({ y, m });
          }}
          className="cms-btn cms-btn-sm"
        >
          오늘
        </button>
        <span className="text-xs tabular-nums text-content-faint">
          이 달 {monthItems.length + monthBoard.length}건 · 캘린더 전용 {monthItems.length}건 ·
          게시판 연동 {monthBoard.length}건
        </span>
        <span className="flex flex-wrap items-center gap-3.5 sm:ml-auto">
          {legend.map((l) => (
            <span key={l.value} className="flex items-center gap-1.5 text-xs text-content">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0"
                style={{ backgroundColor: CATEGORY_COLOR[l.value] }}
              />
              {l.label}
              <span className="tabular-nums text-content-faint">{l.count}</span>
            </span>
          ))}
        </span>
      </div>

      {/* ---- 월 그리드 ---- */}
      <div className="mt-4 overflow-x-auto border-l border-t-2 border-l-[#f1f4f8] border-t-yonsei-navy">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-7 bg-[#fcfdfe]">
            {WEEKDAYS.map((w, i) => (
              <span
                key={w}
                className="border-b border-r border-b-surface-border border-r-[#f1f4f8] px-2 py-2.5 text-[11px] font-bold"
                style={{ color: WEEKDAY_COLOR[i] }}
              >
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const dayItems = items.filter((f) => {
                const r = rangeOf(f);
                return r.start <= cell.iso && cell.iso <= r.end;
              });
              const dayBoard = boardEvents.filter(
                (e) => e.start <= cell.iso && cell.iso <= e.end,
              );
              const isToday = cell.iso === today;
              return (
                <div
                  key={cell.iso}
                  className={cn(
                    'min-h-[116px] border-b border-r border-[#f1f4f8] p-1.5',
                    // 이번 달이 아닌 칸은 흐리게 — 눈이 이번 달 영역을 먼저 잡도록
                    !cell.inMonth && 'bg-[#fcfdfe] opacity-50',
                  )}
                >
                  <span className="mb-1.5 block">
                    <span
                      className={cn(
                        'inline-flex h-[18px] min-w-[18px] items-center justify-center px-1 text-[11px] font-bold tabular-nums',
                        isToday && 'bg-yonsei-navy text-white',
                      )}
                      style={isToday ? undefined : { color: WEEKDAY_COLOR[cell.dow] }}
                    >
                      {cell.day}
                    </span>
                  </span>

                  {dayItems.map((f) => {
                    const id = itemId(f);
                    const r = rangeOf(f);
                    const isStart = r.start === cell.iso;
                    const isRange = r.end > r.start;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedId(id)}
                        title={titleOf(f) || '(제목 없음)'}
                        style={{ borderLeftColor: CATEGORY_COLOR[String(f.category ?? '')] ?? '#003377' }}
                        className={cn(
                          'mb-1 block w-full truncate border-l-[3px] px-1.5 py-1 text-left text-[11px] font-semibold text-content transition-colors hover:bg-yonsei-blue/10',
                          dirtyIds.has(id) ? 'bg-yonsei-blue/[0.08]' : 'bg-surface-soft',
                          // 기간 중간 날짜는 옅게 — 어디서 시작했는지가 한눈에 보이도록
                          !isStart && 'opacity-60',
                          selectedId === id && 'outline outline-1 -outline-offset-1 outline-yonsei-blue',
                        )}
                      >
                        {isStart && isRange ? '▸ ' : ''}
                        {titleOf(f) || '(제목 없음)'}
                      </button>
                    );
                  })}

                  {dayBoard.map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => setBoardNotice(e)}
                      title={`${e.title} — ${getBoard(e.boardKey).label} 게시판`}
                      className="mb-1 block w-full truncate border-l-[3px] border-l-[#c9d2dd] bg-[#fcfdfe] px-1.5 py-1 text-left text-[11px] italic text-content-faint transition-colors hover:text-yonsei-blue"
                    >
                      {e.title}
                    </button>
                  ))}

                  {cell.inMonth && (
                    <button
                      type="button"
                      onClick={() => addAt(cell.iso)}
                      disabled={busy}
                      className="block w-full border border-dashed border-surface-border px-1.5 py-1 text-[10px] font-semibold text-content-faint transition-colors duration-200 ease-out-expo hover:border-yonsei-blue hover:text-yonsei-blue disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      + 일정
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- 편집 패널 ---- */}
      {selected && (
        <div className="anim-panel mt-5 border border-yonsei-navy bg-surface">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-surface-border bg-[#fcfdfe] px-4 py-2.5">
            <strong className="text-[13px] font-bold text-content">일정 편집</strong>
            <span className="text-[11px] text-content-faint">
              게시글 없이 캘린더에만 노출됩니다
            </span>
            <span className="ml-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={removeSelected}
                className="border-0 bg-transparent text-xs font-semibold text-[#b42318] transition-opacity hover:opacity-70"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="cms-btn cms-btn-sm"
              >
                닫기
              </button>
            </span>
          </div>

          <div className="px-5 pb-6 pt-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                일정명 (한국어) <span className="text-[#b42318]">*</span>
              </span>
              <input
                ref={titleRef}
                type="text"
                value={(selected.title as LocalizedPair).ko}
                onChange={(e) => patch('title', e.target.value, 'ko')}
                placeholder="예: 수강신청 확인 및 변경"
                className="cms-input font-semibold"
              />
            </label>
            <label className="mt-3.5 block">
              <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                일정명 (English)
              </span>
              <input
                type="text"
                value={(selected.title as LocalizedPair).en}
                onChange={(e) => patch('title', e.target.value, 'en')}
                placeholder="비우면 영문 페이지에 한국어가 노출됩니다"
                className="cms-input-sm"
              />
            </label>

            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-surface-border pt-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                  시작일 <span className="text-[#b42318]">*</span>
                </span>
                <input
                  type="date"
                  value={String(selected.start ?? '')}
                  onChange={(e) => patch('start', e.target.value)}
                  className="cms-input-sm w-auto"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                  종료일 (하루 일정이면 비움)
                </span>
                <input
                  type="date"
                  value={String(selected.end ?? '')}
                  onChange={(e) => patch('end', e.target.value)}
                  className="cms-input-sm w-auto"
                />
              </label>
              <span className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-content-faint">분류</span>
                <span className="flex flex-wrap gap-1.5">
                  {CALENDAR_CATEGORY_OPTIONS.map((o) => {
                    const on = String(selected.category ?? '') === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => patch('category', o.value)}
                        style={
                          on
                            ? { backgroundColor: CATEGORY_COLOR[o.value], borderColor: CATEGORY_COLOR[o.value] }
                            : undefined
                        }
                        className={cn(
                          'inline-flex items-center gap-1.5 border px-2.5 py-2 text-xs font-semibold transition-colors duration-200 ease-out-expo',
                          on
                            ? 'text-white'
                            : 'border-surface-border bg-surface text-content hover:border-yonsei-blue hover:text-yonsei-blue',
                        )}
                      >
                        {!on && (
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0"
                            style={{ backgroundColor: CATEGORY_COLOR[o.value] }}
                          />
                        )}
                        {o.label}
                      </button>
                    );
                  })}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs leading-[1.8] text-content-faint">
        빈 날짜의 <strong className="text-content">+ 일정</strong> 을 누르면 그 날짜로 새 일정이
        만들어지고 바로 편집 패널이 열립니다. 기울임체 칩은{' '}
        <strong className="text-content">행사 게시판에서 자동으로 올라온 일정</strong>이라 여기서
        고칠 수 없고, 해당 게시판에서 수정합니다. 추가·수정·삭제는 모두 아래 변경 트레이에 모였다가
        한 번에 저장됩니다 ({resource.file}).
      </p>

      {boardNotice && (
        <CmsModal
          title="이 일정은 게시판 글에서 옵니다"
          confirmLabel="게시판으로 이동"
          cancelLabel="닫기"
          body={
            <>
              <p className="font-semibold text-content">{boardNotice.title}</p>
              <p className="mt-2">
                이 일정은 〈{getBoard(boardNotice.boardKey).label}〉 게시판의 글에서 옵니다. 거기서
                수정하세요.
              </p>
            </>
          }
          onConfirm={() => {
            const target = boardNotice.boardKey;
            setBoardNotice(null);
            openEntry({ type: 'board', boardKey: target });
          }}
          onCancel={() => setBoardNotice(null)}
        />
      )}
    </div>
  );
}
