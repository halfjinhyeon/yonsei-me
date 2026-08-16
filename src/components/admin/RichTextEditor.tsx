'use client';

// 통합 글쓰기 에디터 (Tiptap v3) — 백엔드 전환 Phase 3b.
//
// 선정 경위: 사용자가 DC(Summernote)·펨코(XpressEditor)를 리버스엔지니어링한 결과
// 둘 다 deprecated 된 execCommand 세대 → 현대적 문서모델 기반인 Tiptap 채택.
// (무료 MIT · Vercel 그대로 · 신규 서버 0대 — 기존 커스텀 CMS 안의 컴포넌트)
//
// 계약: value/onChange 는 HTML 문자열. 저장 시 서버(posts-server.sanitizeEditorHtml)가
// 화이트리스트 정화를 하므로 에디터 산출물을 그대로 보내면 된다.
// 편집 영역에 사이트 본문 타이포(prose-content)를 그대로 입혀
// "쓰는 화면 = 게시되는 화면"(진짜 WYSIWYG)을 만든다.
//
// 이미지: 툴바 버튼(파일 선택)·드래그앤드롭·붙여넣기 모두 onUploadImage(→R2 URL)를
// 거쳐 본문에 즉시 삽입된다 — 마크다운 시절의 참조식 우회 없음.

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Youtube from '@tiptap/extension-youtube';
import { Placeholder } from '@tiptap/extensions';
import {
  RteImage,
  RteTable,
  RteTableCell,
  RteTableHeader,
  RteTableRow,
  TABLE_BORDER_COLORS,
  type TableBorder,
  type TableBorderColor,
} from '@/lib/admin/rte-schema';
import { cn } from '@/lib/utils';

interface Props {
  /** HTML 문자열 (빈 문서는 '') */
  value: string;
  onChange: (html: string) => void;
  /** 파일 → 업로드 후 공개 URL. 없으면 이미지 기능 비활성 */
  onUploadImage?: (file: File) => Promise<string>;
  /** 에디터 인스턴스 노출 — 부모(이미지 풀 '본문 삽입' 등)가 명령을 내릴 때 사용 */
  onEditorReady?: (editor: Editor) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/** 글자색 팔레트 — 사이트 브랜드 + 기본색 (남용 방지를 위해 소수만).
 *  금색(#C8A96A)은 디자인 언어에서 빠져 선택지에서 제거했다. 이미 그 색으로
 *  저장된 본문은 그대로 렌더된다 — 저장 포맷·렌더는 건드리지 않고 고를 수만 없게 한다. */
const COLORS: { value: string; label: string }[] = [
  { value: '#003377', label: '네이비' },
  { value: '#0057A8', label: '블루' },
  { value: '#2E86D6', label: '스카이' },
  { value: '#C0392B', label: '레드' },
  { value: '#6B7280', label: '그레이' },
];

/** 형광펜 팔레트 — 검은 본문이 그대로 읽히는 옅은 면만. 노랑 계열은 금색과
 *  이웃해 보여 디자인 언어에서 제외했다(글자색과 같은 이유). */
const HIGHLIGHTS: { value: string; label: string }[] = [
  { value: '#DBEAFE', label: '연블루' },
  { value: '#DCFCE7', label: '연그린' },
  { value: '#FEE2E2', label: '연레드' },
  { value: '#E5E7EB', label: '연그레이' },
];

/** 표 셀 배경 — 강조 행/열용. 본문 위에 얹히는 면이라 형광펜보다 더 옅게. */
const CELL_BGS: { value: string | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: '#EAF2FB', label: '연블루' },
  { value: '#F4F5F7', label: '연그레이' },
  { value: '#FBECEA', label: '연레드' },
];

/** 표 테두리 색 스와치 — 값은 토큰 이름, 실제 색은 globals.css 가 갖는다 */
const BORDER_COLOR_SWATCHES: Record<TableBorderColor, { label: string; css: string }> = {
  navy: { label: '네이비', css: '#003377' },
  blue: { label: '블루', css: '#0057A8' },
  sky: { label: '스카이', css: '#2E86D6' },
  red: { label: '레드', css: '#C0392B' },
  gray: { label: '그레이', css: '#9CA3AF' },
};

const BORDER_OPTIONS: { value: TableBorder | null; label: string }[] = [
  { value: null, label: '기본' },
  { value: 'none', label: '없음' },
  { value: 'thin', label: '얇게' },
  { value: 'thick', label: '굵게' },
];

/** 표 삽입 격자 피커 크기 — 더 큰 표는 삽입 후 행/열 추가로 늘린다 */
const GRID_ROWS = 5;
const GRID_COLS = 8;

/** 보조 행은 한 번에 하나만 — 서로 밀어내며 툴바 높이가 널뛰지 않게 한다 */
type Panel = 'colors' | 'highlight' | 'table' | 'link' | 'youtube';

/** 툴바 아래 보조 행 공통 껍데기 */
const PANEL_ROW =
  'flex flex-wrap items-center gap-1.5 border-b border-surface-border bg-surface-soft px-2 py-1.5 text-xs';

/** 보조 행 안의 텍스트 입력 — 각진 톤 유지(폭은 쓰는 쪽에서 정한다) */
const PANEL_INPUT =
  'h-7 border border-surface-border bg-surface px-2 text-xs text-content outline-none focus:border-yonsei-blue';

/** 보조 행 안의 실행 버튼 */
const PANEL_BTN =
  'h-7 shrink-0 border border-surface-border px-2 text-xs font-medium text-content-soft hover:bg-surface hover:text-content';

/** 스킴 없는 입력을 https 로 보정 — 관리자가 'me.yonsei.ac.kr' 만 붙여넣는 일이 잦다.
 *  (mailto/anchor 는 그대로 둔다) */
function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  if (/^(https?:|mailto:|#|\/)/i.test(url)) return url;
  return `https://${url}`;
}

/**
 * 외부 붙여넣기 정화 — Word/한글/웹에서 딸려오는 서식 잡음을 버린다.
 * 남의 색·여백을 들여오면 사이트 톤이 깨지므로, 구조(표·목록·링크)만 남기고
 * 표현(class/lang/style/font)은 전부 지워 우리 팔레트로 다시 칠하게 한다.
 *
 * ⚠ 내부 복붙도 이 훅을 탄다(ProseMirror 는 transformPastedHTML 을 부른 "뒤에"
 * data-pm-slice 를 읽는다 — prosemirror-view/clipboard). 그래서 그 표식이 보이면
 * 손대지 않고 통과시킨다. 안 그러면 에디터 안에서 복사한 글자색·형광펜·표 속성이
 * 붙여넣는 순간 날아간다.
 */
function cleanPastedHtml(html: string): string {
  if (html.includes('data-pm-slice')) return html;
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // 주석 먼저 — Word 의 조건부 주석(<!--[if gte mso 9]><xml>…) 안쪽까지 한 번에 사라진다
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments: ChildNode[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as ChildNode);
  comments.forEach((c) => c.remove());
  doc.body.querySelectorAll('style, script, meta, link, xml').forEach((el) => el.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('class');
    el.removeAttribute('lang');
    el.removeAttribute('style');
  });
  // <font> 는 껍데기만 벗긴다 — 안의 글자는 살린다
  doc.body.querySelectorAll('font').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  return doc.body.innerHTML;
}

/** 툴바 버튼 — 각진 톤(관리자 게시판 영역 관례) */
function TBtn({
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

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px self-center bg-surface-border" />;
}

/* ── 툴바 SVG 아이콘 — 이모지(플랫폼별 렌더 제각각) 대신 통일된 선 아이콘 ── */

/** 표준 정렬 아이콘 — 길이가 다른 가로줄 4개 (좌/중/우 플러시) */
function AlignIcon({ variant }: { variant: 'left' | 'center' | 'right' }) {
  const rows: Record<typeof variant, [number, number][]> = {
    left: [[3, 21], [3, 13], [3, 21], [3, 13]],
    center: [[3, 21], [7, 17], [3, 21], [7, 17]],
    right: [[3, 21], [11, 21], [3, 21], [11, 21]],
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {rows[variant].map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={5 + i * 4.5} y2={5 + i * 4.5} />
      ))}
    </svg>
  );
}

/** 사진 아이콘 — 액자 + 해 + 산 */
function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="8.8" cy="9.5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5 18l4.5-4.5 3 3L16 13l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 표 아이콘 — 격자(머리행이 진한 3×3) */
function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 9h18M3 14.5h18M9 9v11M15 9v11" />
    </svg>
  );
}

/** 유튜브 아이콘 — 둥근 사각 + 재생 삼각형 */
function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
      <path d="M10.5 9.2l4.6 2.8-4.6 2.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 형광펜 아이콘 — 마커 촉 + 그어진 자국 */
function HighlightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 3.5l6 6-8 8H8l-1.5-3z" />
      <line x1="4" y1="21" x2="20" y2="21" strokeWidth="2.5" />
    </svg>
  );
}

/** 링크(사슬) 아이콘 */
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/**
 * 블록 명령(문단·제목·정렬·인용)을 "선택한 글자"에만 적용하는 실행기.
 * 한 문단 안의 부분 선택이면 선택 구간을 자체 블록으로 분리(split)한 뒤 명령을
 * 실행한다 — 문단 전체가 아니라 선택한 문장만 제목/정렬/인용이 된다.
 * 커서만 있거나(선택 없음) 여러 블록에 걸친 선택이면 기본 동작(닿은 블록 전체).
 */
function runOnSelection(
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
        // split 이 경계 토큰 2개를 끼워 넣어 선택 텍스트가 +2 밀린다
        f += 2;
        t += 2;
      }
      tr.setSelection(TextSelection.create(tr.doc, f, t));
      return true;
    });
  }
  apply(chain).run();
}

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  onEditorReady,
  placeholder,
  ariaLabel,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  // 보조 행은 한 번에 하나 — 색/형광펜/표/링크/유튜브가 서로를 닫는다
  const [openPanel, setOpenPanel] = useState<Panel | null>(null);
  // 표 격자 피커의 호버 좌표(1-base). null 이면 아직 안 짚음
  const [gridHover, setGridHover] = useState<{ rows: number; cols: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [panelError, setPanelError] = useState('');
  const [uploadingCount, setUploadingCount] = useState(0);
  const altRef = useRef<HTMLInputElement | null>(null);
  // 드롭/붙여넣기 핸들러(editorProps)는 에디터 생성 전에 정의되므로 ref 로 참조한다
  const editorRef = useRef<Editor | null>(null);

  /** 보조 행 열기/닫기 — 같은 버튼을 다시 누르면 닫힌다 */
  const togglePanel = useCallback((panel: Panel) => {
    setPanelError('');
    setOpenPanel((cur) => (cur === panel ? null : panel));
  }, []);

  /** 파일들을 업로드해 본문에 삽입 — 툴바·드롭·붙여넣기 공용 */
  const uploadAndInsert = useCallback(
    async (files: File[], pos?: number) => {
      const ed = editorRef.current;
      if (!ed || !onUploadImage) return;
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;
      setUploadingCount((n) => n + images.length);
      for (const file of images) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 순차 업로드(진행 표시 단순화)
          const url = await onUploadImage(file);
          const chain = ed.chain().focus();
          if (typeof pos === 'number') chain.insertContentAt(pos, { type: 'image', attrs: { src: url } }).run();
          else chain.setImage({ src: url }).run();
        } catch (err) {
          // 업로드 실패는 storage.ts 가 원인 메시지를 담아 던진다 — 관리자에게 그대로 알림
          window.alert(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.');
        } finally {
          setUploadingCount((n) => n - 1);
        }
      }
    },
    [onUploadImage],
  );

  const editor = useEditor({
    // Next(SSR)에서 하이드레이션 불일치 방지 — 클라이언트에서만 렌더
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        // 링크: 저장 시 서버 정화가 외부 링크에 noopener 를 강제하므로 여기선 기본값
        link: { openOnClick: false },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Superscript,
      Subscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      RteImage,
      // TableKit 대신 개별 확장 4종 — 표/셀에 우리 속성을 얹은 rte-schema 판을 쓴다
      RteTable.configure({ resizable: false }),
      RteTableRow,
      RteTableHeader,
      RteTableCell,
      // nocookie: 유튜브가 방문자에게 추적 쿠키를 심지 않게(정화 화이트리스트에도 두 호스트만)
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        // 사이트 본문과 동일 타이포(prose-content) → 진짜 WYSIWYG
        class: 'prose-content rte-area',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
      // 외부 HTML 붙여넣기 → 서식 잡음 제거(구조·링크는 보존)
      transformPastedHTML: cleanPastedHtml,
      // 이미지 드래그앤드롭 → R2 업로드 후 드롭 지점에 삽입
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files?.length) return false;
        const files = Array.from(event.dataTransfer.files);
        if (!files.some((f) => f.type.startsWith('image/'))) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void uploadAndInsert(files, coords?.pos);
        return true;
      },
      // 클립보드의 이미지(스크린샷 등) 붙여넣기 → 업로드 후 커서에 삽입
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some((f) => f.type.startsWith('image/'))) return false;
        event.preventDefault();
        void uploadAndInsert(files);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.isEmpty ? '' : ed.getHTML());
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    if (editor) onEditorReady?.(editor);
    // onEditorReady 는 식별자 변동이 잦은 인라인 함수일 수 있어 deps 에서 제외(에디터 생성 시 1회면 충분)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // 외부 value 변경(편집 대상 전환 등) → 에디터 내용 동기화(자기 입력 에코는 제외)
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  // 툴바 활성 상태 갱신 — 트랜잭션마다 리렌더(버전 독립적인 단순한 방법)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => setTick((t) => t + 1);
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  /** 링크 보조 행 열기 — 기존 링크 위에서 열면 현재 주소를 채워 수정하게 한다 */
  const openLinkPanel = useCallback(() => {
    if (!editor) return;
    if (openPanel === 'link') {
      setOpenPanel(null);
      return;
    }
    const href = (editor.getAttributes('link').href as string | undefined) ?? '';
    setLinkUrl(href);
    setPanelError('');
    setOpenPanel('link');
  }, [editor, openPanel]);

  /** 링크 적용 — extendMarkRange 로 링크 "전체"를 갈아끼운다(부분 수정 방지) */
  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = normalizeUrl(linkUrl);
    if (!href) {
      setPanelError('주소를 입력하세요.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setOpenPanel(null);
  }, [editor, linkUrl]);

  const clearLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkUrl('');
    setOpenPanel(null);
  }, [editor]);

  /** 유튜브 삽입 — URL 정규화(watch/shorts/youtu.be)는 확장이 처리하고,
   *  못 알아듣는 주소면 커맨드가 false 를 돌려준다 */
  const insertYoutube = useCallback(() => {
    if (!editor) return;
    const src = normalizeUrl(youtubeUrl);
    const ok = src ? editor.chain().focus().setYoutubeVideo({ src }).run() : false;
    if (!ok) {
      setPanelError('유튜브 주소를 확인해 주세요.');
      return;
    }
    setYoutubeUrl('');
    setOpenPanel(null);
  }, [editor, youtubeUrl]);

  if (!editor) {
    // immediatelyRender:false — 첫 클라이언트 렌더 전 자리표시
    return (
      <div className="min-h-[380px] border border-surface-border bg-surface p-4 text-sm text-content-faint">
        에디터 불러오는 중…
      </div>
    );
  }

  const inTable = editor.isActive('table');
  const onImage = editor.isActive('image');
  // 보조 행의 active 표시용 현재 값 — 트랜잭션마다 리렌더되므로 매번 새로 읽는다
  const tableAttrs = inTable ? editor.getAttributes('table') : {};
  const imageAttrs = onImage ? editor.getAttributes('image') : {};

  return (
    <div className="rte border border-surface-border bg-surface">
      {/* 툴바 — 각진 버튼, 접기 없이 한 줄 랩 */}
      <div
        role="toolbar"
        aria-label="서식"
        className="flex flex-wrap items-stretch gap-0.5 border-b border-surface-border bg-surface-soft p-1"
      >
        <TBtn title="문단" active={editor.isActive('paragraph')} onClick={() => runOnSelection(editor, (c) => c.setParagraph())}>¶</TBtn>
        <TBtn title="제목 2" active={editor.isActive('heading', { level: 2 })} onClick={() => runOnSelection(editor, (c) => c.toggleHeading({ level: 2 }))}>H2</TBtn>
        <TBtn title="제목 3" active={editor.isActive('heading', { level: 3 })} onClick={() => runOnSelection(editor, (c) => c.toggleHeading({ level: 3 }))}>H3</TBtn>
        <TBtn title="제목 4" active={editor.isActive('heading', { level: 4 })} onClick={() => runOnSelection(editor, (c) => c.toggleHeading({ level: 4 }))}>H4</TBtn>
        <Divider />
        <TBtn title="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></TBtn>
        <TBtn title="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></TBtn>
        <TBtn title="밑줄" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></TBtn>
        <TBtn title="취소선" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></TBtn>
        <TBtn title="위첨자" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
          x<sup>2</sup>
        </TBtn>
        <TBtn title="아래첨자" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>
          x<sub>2</sub>
        </TBtn>
        {/* 글자색·형광펜 — 토글 시 스와치 행 노출 */}
        <TBtn title="글자색" active={openPanel === 'colors' || editor.isActive('textStyle')} onClick={() => togglePanel('colors')}>
          <span className="border-b-2 border-current px-0.5">A</span>
        </TBtn>
        <TBtn title="형광펜" active={openPanel === 'highlight' || editor.isActive('highlight')} onClick={() => togglePanel('highlight')}>
          <HighlightIcon />
        </TBtn>
        <Divider />
        <TBtn title="왼쪽 정렬" active={editor.isActive({ textAlign: 'left' })} onClick={() => runOnSelection(editor, (c) => c.toggleTextAlign('left'))}><AlignIcon variant="left" /></TBtn>
        <TBtn title="가운데 정렬" active={editor.isActive({ textAlign: 'center' })} onClick={() => runOnSelection(editor, (c) => c.toggleTextAlign('center'))}><AlignIcon variant="center" /></TBtn>
        <TBtn title="오른쪽 정렬" active={editor.isActive({ textAlign: 'right' })} onClick={() => runOnSelection(editor, (c) => c.toggleTextAlign('right'))}><AlignIcon variant="right" /></TBtn>
        <Divider />
        <TBtn title="글머리 목록" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</TBtn>
        <TBtn title="번호 목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</TBtn>
        <TBtn title="인용" active={editor.isActive('blockquote')} onClick={() => runOnSelection(editor, (c) => c.toggleBlockquote())}>&ldquo;</TBtn>
        <TBtn title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</TBtn>
        <Divider />
        <TBtn title="링크" active={openPanel === 'link' || editor.isActive('link')} onClick={openLinkPanel}><LinkIcon /></TBtn>
        {onUploadImage && (
          <TBtn title="이미지 삽입" disabled={uploadingCount > 0} onClick={() => fileRef.current?.click()}><ImageIcon /></TBtn>
        )}
        {/* 표 삽입 — 격자 피커로 크기를 짚는다. 삽입한 표의 편집은 아래 inTable 보조 행 */}
        <TBtn title="표 삽입" active={openPanel === 'table'} onClick={() => togglePanel('table')}><TableIcon /></TBtn>
        <TBtn title="유튜브 영상" active={openPanel === 'youtube'} onClick={() => togglePanel('youtube')}><YoutubeIcon /></TBtn>
        <Divider />
        <TBtn title="실행 취소" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↺</TBtn>
        <TBtn title="다시 실행" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↻</TBtn>
        {uploadingCount > 0 && (
          <span className="ml-2 self-center text-xs font-medium text-yonsei-blue">
            이미지 업로드 중… ({uploadingCount})
          </span>
        )}
      </div>

      {/* 글자색 스와치 행 */}
      {openPanel === 'colors' && (
        <div className={PANEL_ROW}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setColor(c.value).run()}
              title={c.label}
              aria-label={`글자색 ${c.label}`}
              className={cn(
                'h-6 w-6 border',
                editor.isActive('textStyle', { color: c.value })
                  ? 'border-content ring-1 ring-content'
                  : 'border-surface-border',
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetColor().run()}
            className="ml-1 border border-surface-border px-2 py-0.5 text-xs text-content-soft hover:text-content"
          >
            기본색
          </button>
        </div>
      )}

      {/* 형광펜 스와치 행 — 글자색과 같은 문법 */}
      {openPanel === 'highlight' && (
        <div className={PANEL_ROW}>
          {HIGHLIGHTS.map((c) => (
            <button
              key={c.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleHighlight({ color: c.value }).run()}
              title={c.label}
              aria-label={`형광펜 ${c.label}`}
              className={cn(
                'h-6 w-6 border',
                editor.isActive('highlight', { color: c.value })
                  ? 'border-content ring-1 ring-content'
                  : 'border-surface-border',
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            className="ml-1 border border-surface-border px-2 py-0.5 text-xs text-content-soft hover:text-content"
          >
            형광펜 해제
          </button>
        </div>
      )}

      {/* 표 크기 격자 피커 — 짚은 만큼 하이라이트되고 클릭하면 그 크기로 삽입된다 */}
      {openPanel === 'table' && (
        <div className={cn(PANEL_ROW, 'flex-col items-start gap-2')}>
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1rem)` }}
            onMouseLeave={() => setGridHover(null)}
          >
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
              const rows = Math.floor(i / GRID_COLS) + 1;
              const cols = (i % GRID_COLS) + 1;
              const lit = !!gridHover && rows <= gridHover.rows && cols <= gridHover.cols;
              return (
                <button
                  key={i}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setGridHover({ rows, cols })}
                  onFocus={() => setGridHover({ rows, cols })}
                  onClick={() => {
                    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                    setGridHover(null);
                    setOpenPanel(null);
                  }}
                  title={`${rows} × ${cols}`}
                  aria-label={`${rows}행 ${cols}열 표 삽입`}
                  className={cn(
                    'h-4 w-4 border',
                    lit ? 'border-yonsei-navy bg-yonsei-navy' : 'border-surface-border bg-surface',
                  )}
                />
              );
            })}
          </div>
          <span className="text-content-faint">
            {gridHover ? `${gridHover.rows} × ${gridHover.cols}` : '표 크기를 짚으세요 (첫 행은 머리행)'}
          </span>
        </div>
      )}

      {/* 링크 주소 행 — window.prompt 대신 인라인 입력(기존 링크는 주소가 채워져 나온다) */}
      {openPanel === 'link' && (
        <div className={PANEL_ROW}>
          <label className="font-semibold text-content-faint" htmlFor="rte-link-url">주소</label>
          <input
            id="rte-link-url"
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') setOpenPanel(null);
            }}
            placeholder="https://… (생략하면 https 자동)"
            className={cn(PANEL_INPUT, 'min-w-0 flex-1')}
          />
          <button type="button" onClick={applyLink} className={PANEL_BTN}>적용</button>
          {editor.isActive('link') && (
            <button type="button" onClick={clearLink} className={PANEL_BTN}>해제</button>
          )}
          {panelError && <span className="text-red-600">{panelError}</span>}
        </div>
      )}

      {/* 유튜브 주소 행 — watch/shorts/youtu.be 는 확장이 임베드 주소로 바꾼다 */}
      {openPanel === 'youtube' && (
        <div className={PANEL_ROW}>
          <label className="font-semibold text-content-faint" htmlFor="rte-youtube-url">유튜브</label>
          <input
            id="rte-youtube-url"
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); insertYoutube(); }
              if (e.key === 'Escape') setOpenPanel(null);
            }}
            placeholder="https://www.youtube.com/watch?v=…"
            className={cn(PANEL_INPUT, 'min-w-0 flex-1')}
          />
          <button type="button" onClick={insertYoutube} className={PANEL_BTN}>삽입</button>
          {panelError && <span className="text-red-600">{panelError}</span>}
        </div>
      )}

      {/* 표 안에 있을 때만 — 행/열·병합·모양 보조 툴바 */}
      {inTable && (
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-border bg-surface-soft px-2 py-1 text-xs">
          <span className="mr-1 font-semibold text-content-faint">표:</span>
          <TBtn title="아래에 행 추가" onClick={() => editor.chain().focus().addRowAfter().run()}>행+</TBtn>
          <TBtn title="행 삭제" onClick={() => editor.chain().focus().deleteRow().run()}>행−</TBtn>
          <TBtn title="오른쪽에 열 추가" onClick={() => editor.chain().focus().addColumnAfter().run()}>열+</TBtn>
          <TBtn title="열 삭제" onClick={() => editor.chain().focus().deleteColumn().run()}>열−</TBtn>
          <TBtn
            title="셀 병합"
            disabled={!editor.can().mergeCells()}
            onClick={() => editor.chain().focus().mergeCells().run()}
          >
            병합
          </TBtn>
          <TBtn
            title="셀 분할"
            disabled={!editor.can().splitCell()}
            onClick={() => editor.chain().focus().splitCell().run()}
          >
            분할
          </TBtn>
          <TBtn title="머리행 켜기/끄기" active={editor.isActive('tableHeader')} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
            머리행
          </TBtn>
          <TBtn title="표 삭제" onClick={() => editor.chain().focus().deleteTable().run()}>표×</TBtn>
          <Divider />
          {/* 셀 배경 — 선택한 셀(들)에만 적용 */}
          <span className="mr-0.5 text-content-faint">셀 배경</span>
          {CELL_BGS.map((c) => (
            <button
              key={c.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', c.value).run()}
              title={`셀 배경 ${c.label}`}
              aria-label={`셀 배경 ${c.label}`}
              className={cn(
                'grid h-6 w-6 place-items-center border border-surface-border text-[10px] text-content-faint',
                c.value ? '' : 'bg-surface',
              )}
              style={c.value ? { backgroundColor: c.value } : undefined}
            >
              {c.value ? '' : '×'}
            </button>
          ))}
          <Divider />
          {/* 테두리 — 굵기·색은 표 전체 속성(data-*), 실제 색은 globals.css 가 갖는다 */}
          <span className="mr-0.5 text-content-faint">테두리</span>
          {BORDER_OPTIONS.map((b) => (
            <TBtn
              key={b.label}
              title={`표 테두리 ${b.label}`}
              active={(tableAttrs.border ?? null) === b.value}
              onClick={() => editor.chain().focus().setTableAttrs({ border: b.value }).run()}
            >
              {b.label}
            </TBtn>
          ))}
          {TABLE_BORDER_COLORS.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setTableAttrs({ borderColor: name }).run()}
              title={`테두리 색 ${BORDER_COLOR_SWATCHES[name].label}`}
              aria-label={`표 테두리 색 ${BORDER_COLOR_SWATCHES[name].label}`}
              className={cn(
                'h-6 w-6 border',
                tableAttrs.borderColor === name
                  ? 'border-content ring-1 ring-content'
                  : 'border-surface-border',
              )}
              style={{ backgroundColor: BORDER_COLOR_SWATCHES[name].css }}
            />
          ))}
        </div>
      )}

      {/* 이미지를 고른 동안만 — 정렬·폭·대체텍스트 보조 툴바 */}
      {onImage && (
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-border bg-surface-soft px-2 py-1 text-xs">
          <span className="mr-1 font-semibold text-content-faint">이미지:</span>
          {(['left', 'center', 'right'] as const).map((align) => (
            <TBtn
              key={align}
              title={`이미지 ${align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'} 정렬`}
              active={imageAttrs['data-align'] === align}
              onClick={() => editor.chain().focus().updateAttributes('image', { 'data-align': align }).run()}
            >
              <AlignIcon variant={align} />
            </TBtn>
          ))}
          <Divider />
          <TBtn
            title="원본 폭"
            active={!imageAttrs.widthPct}
            onClick={() => editor.chain().focus().updateAttributes('image', { widthPct: null }).run()}
          >
            원본
          </TBtn>
          <TBtn
            title="폭 50%"
            active={imageAttrs.widthPct === 50}
            onClick={() => editor.chain().focus().updateAttributes('image', { widthPct: 50 }).run()}
          >
            ½
          </TBtn>
          <Divider />
          {/* 대체텍스트 — 접근성(WCAG) 필수. 이미지가 바뀌면 key 로 입력을 새로 그린다 */}
          <label className="text-content-faint" htmlFor="rte-image-alt">대체텍스트</label>
          <input
            id="rte-image-alt"
            key={`${String(imageAttrs.src ?? '')}-${editor.state.selection.from}`}
            ref={altRef}
            type="text"
            defaultValue={(imageAttrs.alt as string | undefined) ?? ''}
            placeholder="사진 설명(화면 낭독기용)"
            className={cn(PANEL_INPUT, 'w-56')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              editor.chain().focus().updateAttributes('image', { alt: e.currentTarget.value.trim() || null }).run();
            }}
          />
          <button
            type="button"
            className={PANEL_BTN}
            onClick={() =>
              editor.chain().focus().updateAttributes('image', { alt: altRef.current?.value.trim() || null }).run()
            }
          >
            적용
          </button>
        </div>
      )}

      {/* 숨은 파일 입력 — 이미지 버튼용 */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void uploadAndInsert(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      <EditorContent editor={editor} />
    </div>
  );
}
