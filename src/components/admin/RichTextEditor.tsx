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
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
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

/** 글자색 팔레트 — 사이트 브랜드 + 기본색 (남용 방지를 위해 소수만) */
const COLORS: { value: string; label: string }[] = [
  { value: '#00285E', label: '네이비' },
  { value: '#0057A8', label: '블루' },
  { value: '#C8A96A', label: '골드' },
  { value: '#C0392B', label: '레드' },
  { value: '#6B7280', label: '그레이' },
];

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
  const [showColors, setShowColors] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  // 드롭/붙여넣기 핸들러(editorProps)는 에디터 생성 전에 정의되므로 ref 로 참조한다
  const editorRef = useRef<Editor | null>(null);

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
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        // 사이트 본문과 동일 타이포(prose-content) → 진짜 WYSIWYG
        class: 'prose-content rte-area',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
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

  const setLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('링크 주소 (https://…)');
    if (!url?.trim()) return;
    editor.chain().focus().setLink({ href: url.trim() }).run();
  }, [editor]);

  if (!editor) {
    // immediatelyRender:false — 첫 클라이언트 렌더 전 자리표시
    return (
      <div className="min-h-[380px] border border-surface-border bg-surface p-4 text-sm text-content-faint">
        에디터 불러오는 중…
      </div>
    );
  }

  const inTable = editor.isActive('table');

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
        {/* 글자색 — 토글 시 스와치 행 노출 */}
        <TBtn title="글자색" active={showColors || editor.isActive('textStyle')} onClick={() => setShowColors((v) => !v)}>
          <span className="border-b-2 border-current px-0.5">A</span>
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
        <TBtn title={editor.isActive('link') ? '링크 해제' : '링크'} active={editor.isActive('link')} onClick={setLink}><LinkIcon /></TBtn>
        {onUploadImage && (
          <TBtn title="이미지 삽입" disabled={uploadingCount > 0} onClick={() => fileRef.current?.click()}><ImageIcon /></TBtn>
        )}
        {/* 표 "삽입" 버튼은 제거 — 기존 글의 표를 편집하는 보조 툴바(inTable)만 유지 */}
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
      {showColors && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-surface-border bg-surface-soft px-2 py-1.5">
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

      {/* 표 안에 있을 때만 — 행/열 편집 보조 툴바 */}
      {inTable && (
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-border bg-surface-soft px-2 py-1 text-xs">
          <span className="mr-1 font-semibold text-content-faint">표:</span>
          <TBtn title="아래에 행 추가" onClick={() => editor.chain().focus().addRowAfter().run()}>행+</TBtn>
          <TBtn title="행 삭제" onClick={() => editor.chain().focus().deleteRow().run()}>행−</TBtn>
          <TBtn title="오른쪽에 열 추가" onClick={() => editor.chain().focus().addColumnAfter().run()}>열+</TBtn>
          <TBtn title="열 삭제" onClick={() => editor.chain().focus().deleteColumn().run()}>열−</TBtn>
          <TBtn title="표 삭제" onClick={() => editor.chain().focus().deleteTable().run()}>표×</TBtn>
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
