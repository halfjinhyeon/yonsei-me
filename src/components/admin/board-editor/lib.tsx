'use client';

// BoardEditor 공유 헬퍼·데이터 — 원본은 RichTextEditor.tsx(스왑 후 원본 삭제 예정).
//
// 구형(Froala 2.5.0, devcms2) 파리티 데이터는 2026-08-18 실측 리버스엔지니어링 값:
// 글꼴 12종 · 크기 10~50px · 색 27+해제(7열, 글자/배경 두 탭) · 표 기본 1px #DDD 격자.
// 구형에 없던 컨트롤(형식·줄간격·인용·첨자·찾기·브랜드 스와치)은 사용자 지시로 제거.

import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { cn } from '@/lib/utils';
import type { TableBorderColor } from '@/lib/admin/rte-schema';

export type SelectOption = { value: string; label: string };

/** 글꼴 — 구형(Froala) 12종 실측 파리티. 저장 정화(sanitize.ts)는 안전 문자클래스로 허용. */
export const FONT_FAMILIES: SelectOption[] = [
  { value: '', label: '기본 글꼴' },
  { value: "'Nanum Gothic', '나눔고딕', sans-serif", label: '나눔고딕' },
  { value: "'Nanum Square', '나눔스퀘어', sans-serif", label: '나눔스퀘어' },
  { value: "'Noto Sans KR', '노토산스KR', sans-serif", label: '노토산스KR' },
  { value: "'돋움', '돋움체', Dotum, sans-serif", label: '돋움' },
  { value: "'굴림', '굴림체', Gulim, sans-serif", label: '굴림' },
  { value: "'궁서', '궁서체', Gungsuh, serif", label: '궁서' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Impact, Charcoal, sans-serif', label: 'Impact' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
];

/** 글자 크기 — 구형 실측 목록(10~25 연속 + 30~50 5단위) */
export const FONT_SIZES: SelectOption[] = [
  { value: '', label: '기본 크기' },
  ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 30, 35, 40, 45, 50].map(
    (n) => ({ value: `${n}px`, label: `${n}px` }),
  ),
];

/** 색 팔레트 — 구형 Froala colorsText/colorsBackground 실측(동일 27색, 7열 그리드).
 *  글자색·배경색 두 탭이 같은 팔레트를 쓰고, 마지막 셀은 해제(✕)다. */
export const FROALA_COLORS: string[] = [
  '#61BD6D', '#1ABC9C', '#54ACD2', '#2C82C9', '#9365B8', '#475577', '#CCCCCC',
  '#41A85F', '#00A885', '#3D8EB9', '#2969B0', '#553982', '#28324E', '#000000',
  '#F7DA64', '#FBA026', '#EB6B56', '#E25041', '#A38F84', '#EFEFEF', '#FFFFFF',
  '#FAC51C', '#F37934', '#D14841', '#B8312F', '#7C706B', '#D1D5D8',
];
export const COLORS_STEP = 7;

/** 표 셀 배경 — 표 보조 바(구판 기능 유지)용 옅은 면 */
export const CELL_BGS: { value: string | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: '#EAF2FB', label: '연블루' },
  { value: '#F4F5F7', label: '연그레이' },
  { value: '#FBECEA', label: '연레드' },
];

/** 표 테두리 색 스와치 — 값은 토큰 이름, 실제 색은 globals.css.
 *  lightgray(#DDD)는 구형 기본 테두리색 파리티로 추가된 토큰. */
export const BORDER_COLOR_SWATCHES: Record<TableBorderColor, { label: string; css: string }> = {
  black: { label: '검정', css: '#232323' },
  navy: { label: '네이비', css: '#003377' },
  blue: { label: '블루', css: '#0057A8' },
  sky: { label: '스카이', css: '#2E86D6' },
  red: { label: '레드', css: '#C0392B' },
  gray: { label: '그레이', css: '#9CA3AF' },
  lightgray: { label: '연회색(구형 기본)', css: '#DDDDDD' },
};

/** 테두리 굵기 — px 토큰 select */
export const BORDER_WIDTHS: SelectOption[] = [
  { value: '0', label: '0px (없음)' },
  { value: '1', label: '1px' },
  { value: '2', label: '2px' },
  { value: '3', label: '3px' },
  { value: '4', label: '4px' },
  { value: '', label: '이전 기본(줄무늬)' },
];

/** 셀 여백 — 기본(보통)은 py-5 에디토리얼, 좁게/넓게는 globals.css 열거 */
export const CELLPAD_OPTIONS: SelectOption[] = [
  { value: '', label: '보통' },
  { value: 'narrow', label: '좁게' },
  { value: 'wide', label: '넓게' },
];

/** 표 삽입 격자 피커 크기 */
export const GRID_ROWS = 5;
export const GRID_COLS = 8;

/** 보조 바 공통 스타일 (표/이미지 컨텍스트 바) */
export const PANEL_INPUT =
  'h-7 border border-surface-border bg-surface px-2 text-xs text-content outline-none focus:border-yonsei-blue';
export const PANEL_BTN =
  'h-7 shrink-0 border border-surface-border px-2 text-xs font-medium text-content-soft hover:bg-surface hover:text-content';

/** 스킴 없는 입력을 https 로 보정 */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  if (/^(https?:|mailto:|#|\/)/i.test(url)) return url;
  return `https://${url}`;
}

/**
 * 외부 붙여넣기 정화 — 구조(표·목록·링크)만 남기고 표현(class/style/font)은 지운다.
 * 내부 복붙(data-pm-slice)은 통과. 동작 근거 주석은 원본(RichTextEditor.tsx) 참조.
 */
export function cleanPastedHtml(html: string): string {
  if (html.includes('data-pm-slice')) return html;
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments: ChildNode[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as ChildNode);
  comments.forEach((c) => c.remove());
  doc.body.querySelectorAll('style, script, meta, link, xml').forEach((el) => el.remove());
  const KEEP_ALIGN = /^(left|right|center|justify)$/;
  doc.body.querySelectorAll('*').forEach((el) => {
    const align =
      ((el as HTMLElement).style?.textAlign || el.getAttribute('align') || '').toLowerCase();
    el.removeAttribute('class');
    el.removeAttribute('lang');
    el.removeAttribute('style');
    if (KEEP_ALIGN.test(align)) {
      if (el.matches('td, th')) el.setAttribute('data-keep-align', align);
      else if (el.matches('p, h1, h2, h3, h4, h5')) (el as HTMLElement).style.textAlign = align;
    }
  });
  doc.body.querySelectorAll('td[data-keep-align], th[data-keep-align]').forEach((cell) => {
    const align = cell.getAttribute('data-keep-align')!;
    cell.removeAttribute('data-keep-align');
    const p = doc.createElement('p');
    p.style.textAlign = align;
    while (cell.firstChild) p.appendChild(cell.firstChild);
    cell.appendChild(p);
  });
  doc.body.querySelectorAll('table:not([data-border])').forEach((t) => {
    t.setAttribute('data-border', '1');
  });
  doc.body.querySelectorAll('font').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  return doc.body.innerHTML;
}

/**
 * 부분 선택에 블록 명령 적용 — 선택 구간만 잘라(split) 명령을 건다.
 * (정렬을 문장 일부에 걸 때 문단 전체가 변하는 것을 막는 워드 관례)
 */
export function runOnSelection(
  editor: Editor,
  apply: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>,
) {
  const { selection, doc } = editor.state;
  const { from, to, empty } = selection;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  const partial =
    !empty &&
    $from.sameParent($to) &&
    $from.parent.isTextblock &&
    !($from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size);

  let chain = editor.chain().focus();
  if (partial) {
    chain = chain.command(({ tr }) => {
      const selFrom = tr.selection.from;
      const selTo = tr.selection.to;
      // 뒤를 먼저 자른다 — 앞을 먼저 자르면 뒤 위치가 밀린다
      const $t = tr.doc.resolve(selTo);
      if ($t.parentOffset < $t.parent.content.size) tr.split(selTo);
      const $f = tr.doc.resolve(selFrom);
      let f = selFrom;
      let t = selTo;
      if ($f.parentOffset > 0) {
        tr.split(selFrom);
        f += 2;
        t += 2;
      }
      tr.setSelection(TextSelection.create(tr.doc, f, t));
      return true;
    });
  }
  apply(chain).run();
}

/* ── 보조 바(표/이미지 컨텍스트)용 소형 프레젠테이션 — 구판 각진 톤 유지 ── */

export function TBtn({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault() /* 에디터 포커스 유지 */}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'grid h-8 min-w-8 place-items-center px-1.5 text-sm font-semibold transition-colors disabled:opacity-40',
        active
          ? 'bg-yonsei-navy text-white'
          : 'text-content-soft hover:bg-surface-soft hover:text-content',
      )}
    >
      {children}
    </button>
  );
}

export function TSelect({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <select
      title={title}
      aria-label={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cms-select h-8 border border-surface-border bg-surface pl-2.5 text-xs text-content outline-none focus:border-yonsei-blue"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {!known && <option value={value}>{value}</option>}
    </select>
  );
}

export function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px self-center bg-surface-border" />;
}

/* ── 인라인 아이콘 — Froala 아이콘 형태를 따른 선 아이콘 ── */

/** 표준 정렬 아이콘 — 이미지 보조 바에서 사용(1차 툴바는 tiptap-icons) */
export function AlignIcon({ variant }: { variant: 'left' | 'center' | 'right' }) {
  const rows: Record<'left' | 'center' | 'right', [number, number][]> = {
    left: [
      [3, 21],
      [3, 13],
      [3, 21],
      [3, 13],
    ],
    center: [
      [3, 21],
      [7, 17],
      [3, 21],
      [7, 17],
    ],
    right: [
      [3, 21],
      [11, 21],
      [3, 21],
      [11, 21],
    ],
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {rows[variant].map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={5 + i * 4.6} y2={5 + i * 4.6} />
      ))}
    </svg>
  );
}

/** 유튜브(비디오) 아이콘 */
export function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M10.5 9.2l4.6 2.8-4.6 2.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 표 아이콘 */
export function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.5" y="4.5" width="17" height="15" />
      <line x1="3.5" y1="10" x2="20.5" y2="10" />
      <line x1="3.5" y1="15" x2="20.5" y2="15" />
      <line x1="12" y1="4.5" x2="12" y2="19.5" />
    </svg>
  );
}

/** 내어/들여쓰기 아이콘 */
export function IndentIcon({ direction }: { direction: 'in' | 'out' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="5" x2="21" y2="5" />
      <line x1="11" y1="10" x2="21" y2="10" />
      <line x1="11" y1="14" x2="21" y2="14" />
      <line x1="3" y1="19" x2="21" y2="19" />
      {direction === 'in' ? <path d="M3 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none" /> : <path d="M7 9.5l-4 2.5 4 2.5z" fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** 색 버튼 아이콘 — Froala 의 물방울(droplet) 형태 */
export function DropletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3.5c3.2 4 6 7.2 6 10.3a6 6 0 0 1-12 0c0-3.1 2.8-6.3 6-10.3z" />
    </svg>
  );
}

/** 인쇄 아이콘 */
export function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 8V3.5h10V8" />
      <rect x="3.5" y="8" width="17" height="9" rx="1.5" />
      <path d="M7 13.5h10V21H7z" />
    </svg>
  );
}

/** 서식 지우기(지우개) 아이콘 */
export function EraserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16.5l9.5-9.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 19.5H8L4 16.5z" />
      <line x1="8" y1="19.5" x2="20.5" y2="19.5" />
    </svg>
  );
}

/** 코드뷰(</>) 아이콘 */
export function CodeViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8.5 7 3.5 12 8.5 17" />
      <polyline points="15.5 7 20.5 12 15.5 17" />
    </svg>
  );
}

/** 전체 선택 아이콘 — 점선 사각형 */
export function SelectAllIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tiptap-button-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.5">
      <rect x="4.5" y="4.5" width="15" height="15" />
    </svg>
  );
}
