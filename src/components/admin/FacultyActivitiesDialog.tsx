'use client';

// 교수 한 명의 학술활동(논문·연구과제·지적재산권·수상·학술활동)을 팝업에서 통째로 관리한다.
//
// 한 교수의 실적은 content/faculty-profiles/<한글이름>.json 한 파일에 다섯 배열로 들어 있고,
// 그 파일은 교수진 카드가 다루는 faculty-directory 레코드와 별개다. 그래서 카드 편집기의
// 트레이(값 patch → 한 번에 저장)에 얹지 않고, 이 다이얼로그가 자기 파일을 직접 로드·저장한다.
//
// 편집은 화면에서 모아 뒀다가 [저장] 한 번에 파일 전체를 PUT 한다(행 단위 API 가 없다).
// 그래서 미저장 변경 수를 세어 헤더 배지와 닫기 가드에 쓴다.
//
// ⚠️ 행 객체의 키 순서는 크롤러 산출물과 똑같이 맞춘다 — 재크롤 diff 도구가 직렬화된
// 문자열을 비교하기 때문에, 키 순서가 달라지면 고치지도 않은 행이 변경으로 잡힌다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  commitJson,
  loadJsonOptional,
  savedBanner,
  type RepoConfig,
} from '@/lib/admin/content-api';
import type {
  FacultyProfile,
  FacultyProfileArticleRow,
  FacultyProfileAwardRow,
  FacultyProfileConferenceRow,
  FacultyProfileFundingRow,
  FacultyProfilePatentRow,
} from '@/lib/faculty';

/** content-api 의 cfg 인자는 구 GitHub 커밋 경로와의 시그니처 호환용으로만 남아 있고
 *  함수 안에서 쓰이지 않는다(인증은 서버 세션이 한다). 그래서 더미 하나를 돌려쓴다. */
const CFG: RepoConfig = { token: '', owner: '', repo: '', branch: '' };

/** 지마켓 산스(연도 숫자) — 공개 상세(FacultyActivityTabs)와 같은 관례 */
const HERO_FONT = { fontFamily: 'var(--font-hero), var(--font-sans), sans-serif' } as const;

const DANGER = '#b42318';

/** 파일명이 곧 교수 한글 이름이자 공개 상세의 slug 다(관리 API allowlist 도 이 꼴만 받는다) */
function profilePath(name: string): string {
  return `content/faculty-profiles/${name}.json`;
}

type CategoryId = 'articles' | 'fundings' | 'patents' | 'awards' | 'conferences';

type ProfileRow =
  | FacultyProfileArticleRow
  | FacultyProfileAwardRow
  | FacultyProfileConferenceRow
  | FacultyProfileFundingRow
  | FacultyProfilePatentRow;

interface CategoryDef {
  id: CategoryId;
  label: string;
  /** 시점이 담기는 필드 이름 — 분류마다 date / period 로 갈린다 */
  timeKey: 'date' | 'period';
  /** 시점 입력 방식: 년+월 / 년+월+일 / 시작~종료 텍스트 */
  time: 'ym' | 'ymd' | 'period';
  /** 기간 저장 구분자 — 크롤 원문 표기를 분류별로 그대로 유지한다 */
  periodSep: '-' | '.';
  /** 제목 외 세부 필드(특허만 2개) */
  detail: { key: string; label: string }[];
  /** 기간 칸 placeholder */
  periodHint: string;
}

/** 탭 순서는 공개 상세와 같다: 논문 → 연구과제 → 지적재산권 → 수상 → 학술활동 */
const CATEGORIES: CategoryDef[] = [
  {
    id: 'articles',
    label: '논문',
    timeKey: 'date',
    time: 'ym',
    periodSep: '-',
    detail: [{ key: 'journal', label: '저널명' }],
    periodHint: '',
  },
  {
    id: 'fundings',
    label: '연구과제',
    timeKey: 'period',
    time: 'period',
    periodSep: '-',
    detail: [{ key: 'org', label: '지원기관' }],
    periodHint: '2026-03-01',
  },
  {
    id: 'patents',
    label: '지적재산권',
    timeKey: 'date',
    time: 'ymd',
    periodSep: '-',
    detail: [
      { key: 'type', label: '구분' },
      { key: 'applicant', label: '출원인' },
    ],
    periodHint: '',
  },
  {
    id: 'awards',
    label: '수상',
    timeKey: 'date',
    time: 'ymd',
    periodSep: '-',
    detail: [{ key: 'contents', label: '수상 내용' }],
    periodHint: '',
  },
  {
    id: 'conferences',
    label: '학술활동',
    timeKey: 'period',
    time: 'period',
    periodSep: '.',
    detail: [{ key: 'conference', label: '학회명' }],
    periodHint: '2023.08.21',
  },
];

function defOf(id: CategoryId): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

/** 분류마다 필드 이름이 달라 한 코드 경로로 다루려면 이름으로 읽어야 한다
 *  (다섯 배열이 서로 다른 인터페이스라 인덱스 접근에 캐스팅이 필요하다). */
function readField(row: ProfileRow, key: string): string {
  return (row as unknown as Record<string, string | null | undefined>)[key] ?? '';
}

function rowsOf(profile: FacultyProfile, cat: CategoryId): ProfileRow[] {
  return profile[cat];
}

/** 다섯 배열 중 하나만 갈아 끼운다 — 나머지 필드(name·sourceUrl·aiSummary…)는 그대로 보존된다 */
function withRows(profile: FacultyProfile, cat: CategoryId, rows: ProfileRow[]): FacultyProfile {
  switch (cat) {
    case 'articles':
      return { ...profile, articles: rows as FacultyProfileArticleRow[] };
    case 'fundings':
      return { ...profile, fundings: rows as FacultyProfileFundingRow[] };
    case 'patents':
      return { ...profile, patents: rows as FacultyProfilePatentRow[] };
    case 'awards':
      return { ...profile, awards: rows as FacultyProfileAwardRow[] };
    case 'conferences':
      return { ...profile, conferences: rows as FacultyProfileConferenceRow[] };
  }
}

/** 크롤러 산출물과 같은 키 순서로 행을 조립한다(위 파일 머리말 참고) */
function buildRow(
  cat: CategoryId,
  title: string,
  time: string | null,
  d1: string | null,
  d2: string | null,
): ProfileRow {
  switch (cat) {
    case 'articles':
      return { date: time, title, journal: d1 };
    case 'awards':
      return { title, contents: d1, date: time };
    case 'conferences':
      return { title, conference: d1, period: time };
    case 'fundings':
      return { title, org: d1, period: time };
    case 'patents':
      return { title, type: d1, applicant: d2, date: time };
  }
}

/* ── 시점 문자열 ↔ 입력 칸 ───────────────────────────────────────────────── */

const DATE_RE = /^(\d{4})(?:[-.](\d{1,2}))?(?:[-.](\d{1,2}))?$/;

/** "2024-04-18" → 년·월·일 칸. 형식이 다르면 원문을 첫 칸에 남겨 사람이 고치게 한다 */
function splitDate(raw: string): { year: string; month: string; day: string } {
  const m = raw.match(DATE_RE);
  if (!m) return { year: raw, month: '', day: '' };
  return { year: m[1], month: m[2] ?? '', day: m[3] ?? '' };
}

function splitPeriod(raw: string): { from: string; to: string } {
  const [from = '', to = ''] = raw.split('~');
  return { from, to };
}

/** 년·월·일 칸 → 저장 문자열. 년이 비면 시점 없음(null)으로 저장한다 */
function joinDate(year: string, month: string, day: string, withDay: boolean): string | null {
  const y = year.trim();
  if (!y) return null;
  const m = month.trim();
  if (!m) return y;
  const head = `${y}-${m.padStart(2, '0')}`;
  const d = day.trim();
  return withDay && d ? `${head}-${d.padStart(2, '0')}` : head;
}

/** 기간 한 조각을 분류의 저장 표기로 정규화. 인식 못 하면 입력 원문 그대로 둔다(막지 않는다) */
function normalizePiece(raw: string, sep: '-' | '.'): string {
  const s = raw.trim();
  if (!s) return '';
  const m = s.match(DATE_RE);
  if (!m) return s;
  const parts = [m[1]];
  if (m[2]) parts.push(m[2].padStart(2, '0'));
  if (m[3]) parts.push(m[3].padStart(2, '0'));
  return parts.join(sep);
}

function joinPeriod(from: string, to: string, sep: '-' | '.'): string | null {
  const a = normalizePiece(from, sep);
  const b = normalizePiece(to, sep);
  if (!a && !b) return null;
  if (!b) return a;
  if (!a) return b;
  return `${a}~${b}`;
}

/** "2025-12" → "2025.12". 형식이 다르면 원문 한 줄 (공개 상세와 같은 규칙) */
function monthStamp(raw: string): string[] {
  if (!raw) return [];
  const m = raw.match(/^(\d{4})[-.](\d{1,2})/);
  return m ? [`${m[1]}.${m[2].padStart(2, '0')}`] : [raw];
}

/** "2023.08.21~2023.08.25" → 시작·끝 연도. 같은 해면 한 줄로 접는다 (공개 상세와 같은 규칙) */
function periodYears(raw: string): string[] {
  if (!raw) return [];
  const [head, tail] = raw.split('~');
  const start = head?.match(/\d{4}/)?.[0];
  if (!start) return [raw];
  const end = tail?.match(/\d{4}/)?.[0];
  return !end || end === start ? [start] : [start, end];
}

/** 최신순 삽입 자리를 찾기 위한 정렬 키(시작 연·월·일). 인식 못 하는 값은 null */
function sortKey(time: string): number | null {
  if (!time) return null;
  const m = (time.split('~')[0] ?? '').match(/^(\d{4})(?:[-.](\d{1,2}))?(?:[-.](\d{1,2}))?/);
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2] ?? 0) * 100 + Number(m[3] ?? 0);
}

/** 새 실적이 들어갈 자리 — 자기보다 오래된 첫 행 앞(= 목록의 최신순 유지). 시점이 없으면 맨 위 */
function insertIndex(rows: ProfileRow[], def: CategoryDef, time: string | null): number {
  const key = sortKey(time ?? '');
  if (key == null) return 0;
  const at = rows.findIndex((r) => {
    const k = sortKey(readField(r, def.timeKey));
    return k != null && k < key;
  });
  return at === -1 ? rows.length : at;
}

/** 숫자 칸 입력 필터 — 붙여넣기까지 포함해 숫자만 남기고 자리수를 자른다 */
function digits(value: string, max: number): string {
  return value.replace(/[^0-9]/g, '').slice(0, max);
}

/* ── 아이콘 ──────────────────────────────────────────────────────────────── */

function Icon({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/* ── 폼 ─────────────────────────────────────────────────────────────────── */

interface FormState {
  cat: CategoryId;
  title: string;
  year: string;
  month: string;
  day: string;
  from: string;
  to: string;
  d1: string;
  d2: string;
}

const EMPTY_FORM: Omit<FormState, 'cat'> = {
  title: '',
  year: '',
  month: '',
  day: '',
  from: '',
  to: '',
  d1: '',
  d2: '',
};

const INPUT =
  'w-full rounded-none border border-surface-border bg-white px-2.5 py-2 text-[13.5px] text-content outline-none transition-colors focus:border-yonsei-blue';
const FIELD_LABEL = 'mb-1 block text-[12px] font-bold text-content';

function ActivityForm({
  value,
  caption,
  titleInvalid,
  timeInvalid,
  onChange,
  onCategory,
  onSubmit,
  onCancel,
}: {
  value: FormState;
  /** 추가 폼에만 붙는 분류별 세부 필드 안내 */
  caption?: string;
  titleInvalid: boolean;
  timeInvalid: boolean;
  onChange: (patch: Partial<FormState>) => void;
  onCategory: (cat: CategoryId) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const def = defOf(value.cat);
  const titleRef = useRef<HTMLInputElement>(null);

  // 폼이 열리면 바로 제목부터 — 다섯 분류 모두 제목이 유일한 필수 값이다
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      className="border-b border-b-surface-border border-l-[3px] border-l-yonsei-navy bg-surface-soft px-7 py-5 pl-[25px]"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        } else if (e.key === 'Escape') {
          // 폼 취소가 다이얼로그 닫기로 번지지 않게 막는다
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {caption && <p className="mb-4 text-[11.5px] text-content-faint">{caption}</p>}

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className={FIELD_LABEL} htmlFor="activity-category">
            카테고리
          </label>
          <select
            id="activity-category"
            value={value.cat}
            onChange={(e) => onCategory(e.target.value as CategoryId)}
            className={INPUT}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={FIELD_LABEL}>시점</span>
          {def.timeKey === 'date' ? (
            <div className="flex items-center gap-1.5">
              <input
                value={value.year}
                onChange={(e) => onChange({ year: digits(e.target.value, 4) })}
                inputMode="numeric"
                aria-label="년"
                placeholder="2026"
                // cn 은 tailwind-merge 가 아니라 단순 join — INPUT 의 border 색과 충돌하므로 ! 로 덮는다
                className={cn(INPUT, 'w-[74px]', timeInvalid && '!border-[#b42318]')}
              />
              <span className="text-[12px] text-content-faint">년</span>
              <input
                value={value.month}
                onChange={(e) => onChange({ month: digits(e.target.value, 2) })}
                inputMode="numeric"
                aria-label="월"
                placeholder="03"
                className={cn(INPUT, 'w-[56px]')}
              />
              <span className="text-[12px] text-content-faint">월</span>
              {def.time === 'ymd' && (
                <>
                  <input
                    value={value.day}
                    onChange={(e) => onChange({ day: digits(e.target.value, 2) })}
                    inputMode="numeric"
                    aria-label="일"
                    placeholder="18"
                    className={cn(INPUT, 'w-[56px]')}
                  />
                  <span className="text-[12px] text-content-faint">일</span>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                value={value.from}
                onChange={(e) => onChange({ from: e.target.value })}
                aria-label="시작"
                placeholder={def.periodHint}
                className={cn(INPUT, 'min-w-0 flex-1')}
              />
              <span className="text-[12px] text-content-faint">~</span>
              <input
                value={value.to}
                onChange={(e) => onChange({ to: e.target.value })}
                aria-label="종료"
                placeholder={def.periodHint}
                className={cn(INPUT, 'min-w-0 flex-1')}
              />
            </div>
          )}
        </div>

        <div className="col-span-2">
          <label className={FIELD_LABEL} htmlFor="activity-title">
            제목
          </label>
          <input
            id="activity-title"
            ref={titleRef}
            value={value.title}
            onChange={(e) => onChange({ title: e.target.value })}
            // cn 은 tailwind-merge 가 아니라 단순 join — INPUT 의 border 색과 충돌하므로 ! 로 덮는다
            className={cn(INPUT, titleInvalid && '!border-[#b42318]')}
          />
          {titleInvalid && (
            <p className="mt-1 text-[12px]" style={{ color: DANGER }}>
              제목은 반드시 입력해야 합니다.
            </p>
          )}
        </div>

        {def.detail.map((field, i) => (
          <div key={field.key}>
            <label className={FIELD_LABEL} htmlFor={`activity-detail-${i}`}>
              {field.label}
            </label>
            <input
              id={`activity-detail-${i}`}
              value={i === 0 ? value.d1 : value.d2}
              onChange={(e) => onChange(i === 0 ? { d1: e.target.value } : { d2: e.target.value })}
              className={INPUT}
            />
          </div>
        ))}

        {/* 안내문은 폼 하단에 고정 — 세부 필드가 1칸이든(논문) 2칸이든(특허) 같은 자리에 온다 */}
        <div className="col-span-2 flex items-end justify-between gap-5">
          <p className="text-[11.5px] leading-snug text-content-faint">
            시점이 비어 있으면 목록에 연도 없이 표시됩니다
          </p>
          <span className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="text-[13px] font-semibold text-content-faint transition-colors hover:text-content"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="bg-yonsei-navy px-[18px] py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              저장
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 다이얼로그 ─────────────────────────────────────────────────────────── */

type EditTarget = { mode: 'add' } | { mode: 'edit'; cat: CategoryId; index: number };

interface Snack {
  text: string;
  /** 삭제 스낵바에만 있는 실행취소 */
  undo: (() => void) | null;
}

const CAPTION =
  '카테고리별 세부 필드 — 논문=저널명 · 연구과제=지원기관(기간) · 지적재산권=구분+출원인 · 수상=수상 내용 · 학술활동=학회명(기간)';

export function FacultyActivitiesDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const [draft, setDraft] = useState<FacultyProfile | null>(null);
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 404 — 아직 프로필 파일이 없는 교수 */
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<CategoryId>('articles');
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(0);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [form, setForm] = useState<FormState>({ cat: 'articles', ...EMPTY_FORM });
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  /** 이 교수만 재수집 중 — 3~5초짜리라 진행률 대신 버튼 자리가 바뀐다 */
  const [crawling, setCrawling] = useState(false);
  /** 수집 직후 몇 초간 '방금 갱신됨' 표시 — 그 뒤 평상시 버튼으로 돌아온다 */
  const [justCrawled, setJustCrawled] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const file = await loadJsonOptional<FacultyProfile>(CFG, profilePath(name));
      setDraft(file ? file.data : null);
      setSha(file ? file.sha : '');
      setMissing(!file);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '실적을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  // 팝업 뒤 페이지가 같이 스크롤되면 목록을 잃는다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(
    () => () => {
      if (snackTimer.current) clearTimeout(snackTimer.current);
    },
    [],
  );

  function showSnack(text: string, undo: (() => void) | null, ms: number) {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack({ text, undo });
    snackTimer.current = setTimeout(() => setSnack(null), ms);
  }

  /** 이 교수 한 명만 교원정보시스템에서 다시 받아온다(병합 — 지우지 않는다).
   *  서버가 파일을 갱신하므로 화면은 저장된 최신본을 통째로 다시 읽는다. */
  const crawlThis = useCallback(async () => {
    if (dirty > 0) {
      showSnack('먼저 저장한 뒤 불러오세요 — 미저장 변경이 덮어써질 수 있습니다.', null, 4000);
      return;
    }
    setCrawling(true);
    try {
      const res = await fetch('/api/admin/faculty-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as {
        added?: number;
        addedByKey?: Record<string, number>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `수집 실패 (HTTP ${res.status})`);
      await load();
      const added = data.added ?? 0;
      setJustCrawled(true);
      setTimeout(() => setJustCrawled(false), 5000);
      if (added === 0) {
        showSnack('변경 없음 — 새로 추가된 실적이 없습니다.', null, 3000);
      } else {
        const parts = CATEGORIES.filter((c) => (data.addedByKey?.[c.id] ?? 0) > 0).map(
          (c) => `${c.label} ${data.addedByKey?.[c.id]}건`,
        );
        showSnack(`${parts.join(' · ')} 추가됨 · 기존 기록은 그대로입니다`, null, 5000);
      }
    } catch (err) {
      showSnack(err instanceof Error ? err.message : '실적을 불러오지 못했습니다.', null, 5000);
    } finally {
      setCrawling(false);
    }
    // showSnack 은 렌더마다 새로 만들어지는 일반 함수라 의존성에 넣지 않는다
    // (넣으면 이 콜백이 매 렌더 새로 생긴다 — 동작은 같다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, load, name]);

  const attemptClose = useCallback(() => {
    if (dirty > 0) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);

  // Esc — 확인 모달 › 편집 폼 › 다이얼로그 순으로 가장 안쪽 것부터 닫는다
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (confirmClose) setConfirmClose(false);
      else if (editing) setEditing(null);
      else attemptClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmClose, editing, attemptClose]);

  const counts = useMemo(() => {
    const map = {} as Record<CategoryId, number>;
    for (const c of CATEGORIES) map[c.id] = draft ? rowsOf(draft, c.id).length : 0;
    return map;
  }, [draft]);
  const total = CATEGORIES.reduce((n, c) => n + counts[c.id], 0);

  const def = defOf(tab);
  const rows = draft ? rowsOf(draft, tab) : [];
  const keyword = query.trim().toLowerCase();
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (!keyword) return true;
      const hay = [readField(row, 'title'), ...def.detail.map((d) => readField(row, d.key))]
        .join(' ')
        .toLowerCase();
      return hay.includes(keyword);
    });

  /** 년 칸에 4자리가 아닌 값이 남아 있으면(옛 데이터 프리필) 저장을 막는다 */
  const timeInvalid =
    defOf(form.cat).timeKey === 'date' && form.year !== '' && !/^\d{4}$/.test(form.year);

  function openAdd() {
    setTitleInvalid(false);
    setForm({ cat: tab, ...EMPTY_FORM });
    setEditing({ mode: 'add' });
  }

  function openEdit(cat: CategoryId, index: number) {
    if (!draft) return;
    const row = rowsOf(draft, cat)[index];
    const d = defOf(cat);
    const time = readField(row, d.timeKey);
    setTitleInvalid(false);
    setForm({
      cat,
      ...EMPTY_FORM,
      title: readField(row, 'title'),
      ...(d.timeKey === 'date' ? splitDate(time) : splitPeriod(time)),
      d1: readField(row, d.detail[0].key),
      d2: d.detail[1] ? readField(row, d.detail[1].key) : '',
    });
    setEditing({ mode: 'edit', cat, index });
  }

  /** 분류 전환 — 제목과 이미 입력한 연·월은 살리고 세부 필드만 비운다.
   *  시점 입력 방식(년월 ↔ 기간)이 바뀌는 조합에서는 값을 서로 옮겨 담는다. */
  function changeCategory(next: CategoryId) {
    setForm((prev) => {
      const from = defOf(prev.cat);
      const to = defOf(next);
      const carried = { ...prev, cat: next, d1: '', d2: '' };
      if (from.timeKey === 'date' && to.timeKey === 'period' && !prev.from.trim()) {
        carried.from = [prev.year, prev.month, prev.day].filter(Boolean).join('.');
      }
      if (from.timeKey === 'period' && to.timeKey === 'date' && !prev.year.trim()) {
        Object.assign(carried, splitDate(normalizePiece(prev.from, '-')));
      }
      return carried;
    });
  }

  function submitForm() {
    if (!draft || !editing) return;
    const title = form.title.trim();
    if (!title) {
      setTitleInvalid(true);
      return;
    }
    if (timeInvalid) return;

    const d = defOf(form.cat);
    const time =
      d.timeKey === 'date'
        ? joinDate(form.year, form.month, form.day, d.time === 'ymd')
        : joinPeriod(form.from, form.to, d.periodSep);
    const row = buildRow(form.cat, title, time, form.d1.trim() || null, form.d2.trim() || null);

    setDraft((prev) => {
      if (!prev) return prev;
      let next = prev;
      // 분류를 바꿨을 수 있으니 제거와 삽입을 나눠 처리한다
      if (editing.mode === 'edit') {
        const src = rowsOf(next, editing.cat).slice();
        src.splice(editing.index, 1);
        next = withRows(next, editing.cat, src);
      }
      const dst = rowsOf(next, form.cat).slice();
      const at =
        editing.mode === 'edit' && editing.cat === form.cat
          ? editing.index // 같은 분류면 원래 자리를 지킨다(정렬이 흐트러지지 않게)
          : insertIndex(dst, d, time);
      dst.splice(at, 0, row);
      return withRows(next, form.cat, dst);
    });

    setDirty((n) => n + 1);
    setEditing(null);
    setTab(form.cat);
  }

  function removeRow(cat: CategoryId, index: number) {
    if (!draft) return;
    const row = rowsOf(draft, cat)[index];
    setDraft((prev) => {
      if (!prev) return prev;
      const next = rowsOf(prev, cat).slice();
      next.splice(index, 1);
      return withRows(prev, cat, next);
    });
    setDirty((n) => n + 1);
    // 뒤 행들의 인덱스가 밀리므로 열려 있던 폼은 닫는다
    setEditing(null);
    showSnack(
      '실적 1건을 삭제했습니다',
      () => {
        setDraft((prev) => {
          if (!prev) return prev;
          const next = rowsOf(prev, cat).slice();
          next.splice(index, 0, row);
          return withRows(prev, cat, next);
        });
        setDirty((n) => Math.max(0, n - 1));
        setTab(cat);
        setSnack(null);
      },
      6000,
    );
  }

  function createEmpty() {
    setDraft({
      name,
      nameEn: null,
      email: null,
      phone: null,
      office: null,
      homepage: null,
      sourceUrl: null,
      crawledAt: null,
      articles: [],
      awards: [],
      conferences: [],
      fundings: [],
      patents: [],
    });
    setSha(''); // 빈 sha = 신규 insert
    setMissing(false);
    setDirty((n) => n + 1);
  }

  async function save() {
    if (!draft || dirty === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await commitJson(CFG, profilePath(name), draft, sha, `교수 학술활동 수정 — ${name}`);
      setSha(res.sha);
      setDirty(0);
      showSnack(savedBanner(CFG).message, null, 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`학술활동 관리 — ${name}`}
          className="relative flex h-[min(810px,calc(100vh-48px))] w-[min(1080px,calc(100vw-48px))] flex-col overflow-hidden bg-surface"
        >
          <div className="flex items-center justify-between gap-5 px-7 pb-5 pt-[22px]">
            <h2 className="flex items-baseline gap-2.5 text-[19px] font-bold text-content">
              학술활동 관리 — {name}
              <span className="text-[13px] font-medium text-content-faint">총 {total}건</span>
              {/* 이 교수만 다시 받아오기 — 한 명은 3~5초라 확인 모달도 진행률도 없다.
                  버튼 자리에서 그대로 로딩 → '방금 갱신됨' 으로 바뀌고, 결과는 스낵바가 말한다.
                  ⚠️ 미저장 변경이 있으면 막는다: 수집이 서버 파일을 갱신하는데 그 뒤에
                  이 화면의 옛 원본을 저장하면 방금 받아온 행이 통째로 사라진다. */}
              {crawling ? (
                <span className="inline-flex cursor-not-allowed items-center gap-[7px] border border-surface-border bg-surface-soft px-2.5 py-[5px] text-xs font-semibold text-content-soft">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-surface-border border-t-yonsei-blue"
                  />
                  받아오는 중…
                </span>
              ) : justCrawled ? (
                <span className="inline-flex items-center gap-1.5 border border-yonsei-blue px-2.5 py-[5px] text-xs font-bold text-yonsei-blue">
                  <span aria-hidden="true">✓</span>방금 갱신됨
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void crawlThis()}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-1.5 border border-surface-border bg-surface px-2.5 py-[5px] text-xs font-semibold text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden="true" className="text-[13px] leading-none">
                    ↻
                  </span>
                  최신 실적 받아오기
                </button>
              )}
            </h2>
            <span className="flex shrink-0 items-center gap-2.5">
              {dirty > 0 && (
                <span className="bg-yonsei-sky/10 px-[9px] py-[5px] text-xs font-bold text-yonsei-blue">
                  미저장 변경 {dirty}건
                </span>
              )}
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || dirty === 0}
                className="bg-yonsei-navy px-[18px] py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={attemptClose}
                className="border border-surface-border px-[17px] py-[9px] text-[13px] font-semibold text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue"
              >
                닫기
              </button>
            </span>
          </div>

          {saveError && (
            <p role="alert" className="px-7 pb-3 text-[13px]" style={{ color: DANGER }}>
              {saveError}
              {saveError.includes('409') &&
                ' 다른 곳에서 같은 파일이 수정되었습니다. 닫았다가 다시 열면 최신본을 불러옵니다.'}
            </p>
          )}

          <div role="tablist" className="flex gap-7 border-b border-surface-border px-7">
            {CATEGORIES.map((c) => {
              const active = c.id === tab;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(c.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 pb-3 pt-1 text-[13.5px] transition-colors',
                    active
                      ? 'font-bold text-yonsei-navy'
                      : 'font-semibold text-content-faint hover:text-yonsei-navy',
                  )}
                >
                  {c.label}
                  <span className="text-[12px] tabular-nums">{counts[c.id]}</span>
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-px h-[2px] bg-yonsei-navy"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-7 py-3.5">
            <div className="relative w-[320px]">
              <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.35-4.35" />
              </Icon>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목·내용 검색…"
                aria-label="실적 검색"
                className="w-full rounded-none border border-surface-border bg-white py-2 pl-[34px] pr-2.5 text-[13px] text-content outline-none transition-colors placeholder:text-content-faint focus:border-yonsei-blue"
              />
            </div>
            <button
              type="button"
              // 추가 폼이 이미 열려 있으면 토글로 닫는다(폼은 한 번에 하나만 연다)
              onClick={() => (editing?.mode === 'add' ? setEditing(null) : openAdd())}
              disabled={!draft}
              className={cn(
                'inline-flex items-center gap-1.5 border border-yonsei-blue px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40',
                editing?.mode === 'add' ? 'bg-yonsei-blue text-white' : 'text-yonsei-blue',
              )}
            >
              <Icon className="h-3.5 w-3.5">
                <path d="M12 5v14M5 12h14" />
              </Icon>
              실적 추가
            </button>
          </div>

          <div className="flex-1 overflow-y-auto border-t border-surface-border">
            {loading ? (
              <p className="py-24 text-center text-[13px] text-content-faint">불러오는 중…</p>
            ) : loadError ? (
              <div className="py-24 text-center">
                <p className="text-[13px]" style={{ color: DANGER }}>
                  {loadError}
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-4 border border-surface-border px-[17px] py-[9px] text-[13px] font-semibold text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue"
                >
                  다시 시도
                </button>
              </div>
            ) : missing ? (
              <div className="mx-auto max-w-[420px] py-24 text-center">
                <p className="text-[15px] font-semibold text-content">
                  이 교수의 실적 프로필이 아직 없습니다
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-content-faint">
                  ‘빈 프로필 만들기’로 시작하면 실적을 직접 등록할 수 있습니다. 새 프로필의 공개
                  페이지 연결은 다음 배포부터 노출됩니다.
                </p>
                <button
                  type="button"
                  onClick={createEmpty}
                  className="mt-5 bg-yonsei-navy px-[18px] py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  빈 프로필 만들기
                </button>
              </div>
            ) : (
              <>
                {editing?.mode === 'add' && (
                  <ActivityForm
                    value={form}
                    caption={CAPTION}
                    titleInvalid={titleInvalid}
                    timeInvalid={timeInvalid}
                    onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
                    onCategory={changeCategory}
                    onSubmit={submitForm}
                    onCancel={() => setEditing(null)}
                  />
                )}

                {visible.length === 0 ? (
                  <div className="py-24 text-center">
                    {keyword ? (
                      <p className="text-[15px] font-semibold text-content">
                        ‘{query.trim()}’에 해당하는 실적이 없습니다
                      </p>
                    ) : (
                      <>
                        <p className="text-[15px] font-semibold text-content">
                          이 분류에 등록된 실적이 없습니다
                        </p>
                        <p className="mt-2 text-[13px] text-content-faint">
                          위의 ‘실적 추가’로 첫 실적을 등록하세요.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <ul>
                    {visible.map(({ row, index }) => {
                      const time = readField(row, def.timeKey);
                      const years = def.timeKey === 'date' ? monthStamp(time) : periodYears(time);
                      const meta =
                        def.detail
                          .map((d) => readField(row, d.key))
                          .filter(Boolean)
                          .join(' · ') || null;
                      const isEditing =
                        editing?.mode === 'edit' && editing.cat === tab && editing.index === index;
                      return (
                        <li key={`${tab}-${index}`}>
                          <div
                            className={cn(
                              'group grid grid-cols-[72px_minmax(0,1fr)_72px] items-center gap-5 border-b border-surface-border px-7 py-[13px] transition-colors',
                              isEditing ? 'bg-surface-soft' : 'hover:bg-surface-soft',
                            )}
                          >
                            <div
                              style={HERO_FONT}
                              className="flex flex-col text-[15px] font-bold leading-tight tabular-nums text-yonsei-navy"
                            >
                              {years.map((y, i) => (
                                <span key={i} className={i === 0 ? undefined : 'text-yonsei-blue'}>
                                  {i === 0 ? y : `–${y}`}
                                </span>
                              ))}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-content">
                                {readField(row, 'title')}
                              </p>
                              {meta && (
                                <p className="mt-0.5 truncate text-[13px] text-content-faint">
                                  {meta}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                              <button
                                type="button"
                                aria-label="실적 수정"
                                onClick={() => openEdit(tab, index)}
                                className={cn(
                                  'flex h-[30px] w-[30px] items-center justify-center border text-yonsei-blue transition-colors hover:border-yonsei-blue',
                                  isEditing ? 'border-yonsei-blue' : 'border-surface-border',
                                )}
                              >
                                <Icon className="h-[15px] w-[15px]">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </Icon>
                              </button>
                              <button
                                type="button"
                                aria-label="실적 삭제"
                                onClick={() => removeRow(tab, index)}
                                className="flex h-[30px] w-[30px] items-center justify-center border border-surface-border text-content-faint transition-colors hover:border-[#b42318] hover:text-[#b42318]"
                              >
                                <Icon className="h-[15px] w-[15px]">
                                  <path d="M6 6l12 12M18 6 6 18" />
                                </Icon>
                              </button>
                            </div>
                          </div>
                          {isEditing && (
                            <ActivityForm
                              value={form}
                              titleInvalid={titleInvalid}
                              timeInvalid={timeInvalid}
                              onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
                              onCategory={changeCategory}
                              onSubmit={submitForm}
                              onCancel={() => setEditing(null)}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          {snack && (
            <div className="absolute bottom-[76px] left-1/2 flex -translate-x-1/2 items-center gap-[18px] bg-yonsei-navy px-5 py-[13px] text-[13.5px] text-white">
              <span>{snack.text}</span>
              {snack.undo && (
                <>
                  <span aria-hidden="true" className="h-3.5 w-px bg-white/30" />
                  <button
                    type="button"
                    onClick={snack.undo}
                    className="text-[13.5px] font-bold text-[#9CCDF2] underline underline-offset-[3px]"
                  >
                    실행취소
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(15,23,42,.4)] p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="저장하지 않은 변경"
            className="w-[min(480px,100%)] bg-surface p-7"
          >
            <h3 className="text-[18px] font-bold text-content">
              저장하지 않은 변경 {dirty}건이 있습니다.
            </h3>
            <p className="mt-3 text-[13px] text-content-soft">저장하지 않고 닫을까요?</p>
            <div className="mt-7 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border border-surface-border px-[17px] py-[9px] text-[13px] font-semibold transition-colors hover:border-[#b42318]"
                style={{ color: DANGER }}
              >
                저장 안 함
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="bg-yonsei-navy px-[18px] py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                계속 편집
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
