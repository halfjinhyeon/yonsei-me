'use client';

// 새 글/수정 공용 편집 폼. 게시판 종류에 따라 추가 필드(세미나 주최, 행사 기간,
// 뉴스 slug/category/요약/이미지)를 조건부로 노출한다.
// 본 사이트와 통일감 있는 에디토리얼 톤: 각진 흰 입력 필드 + 섹션별 헤어라인 구분.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useRef, useState } from 'react';
import { Marked } from 'marked';
import type { BoardMeta, EditRecord } from '@/lib/admin/boards';
import { emptyAttachment } from '@/lib/admin/boards';
import { UploadCancelledError, type UploadProgress, type UploadProgressHandler } from '@/lib/admin/storage';
import { TranslateButton } from './TranslateButton';
import { PostPreviewModal } from './PostPreviewModal';

// 미리보기 렌더 — 사이트 게시물 렌더(PostArticle)와 동일 설정(breaks:true)
const previewMarked = new Marked({ gfm: true, breaks: true });

interface Props {
  meta: BoardMeta;
  /** 편집 대상 초기값 */
  initial: EditRecord;
  /** 수정 모드면 id 읽기 전용 */
  isEdit: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (rec: EditRecord) => void;
  /** 첨부·이미지 파일을 외부 스토리지에 올리고 URL 을 반환 (config 를 가진 상위가 주입) */
  onUploadFile?: (
    file: File,
    onProgress?: UploadProgressHandler,
    signal?: AbortSignal,
  ) => Promise<string>;
}

// 사이트 공통 입력 문법(BoardFilterBar 와 동일): 각진 흰 필드 + 파랑 포커스 보더
const fieldClass =
  'mt-1 w-full border border-surface-border bg-surface px-3 py-2 text-sm text-content outline-none transition-colors placeholder:text-content-faint focus:border-yonsei-blue';
const attFieldClass =
  'border border-surface-border bg-surface px-3 py-2 text-sm text-content outline-none transition-colors placeholder:text-content-faint focus:border-yonsei-blue';

/** 섹션 제목 — 본 사이트 게시판 헤더 문법(굵은 글자 + 네이비 언더라인) 축소판 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b-2 border-yonsei-navy pb-2 text-sm font-bold tracking-tight text-content">
      {children}
    </h4>
  );
}

/** 파일 업로드 대상: 첨부 행 인덱스, 대표 이미지, 또는 이미지 풀(다중) */
type UploadTarget = number | 'image' | 'pool';

/** 이미지 풀 항목 — 업로드된 사진 (본문 삽입·썸네일 지정의 재료) */
interface PoolItem {
  url: string;
  name: string;
}

/** 진행 단계 → 사용자 표시 문구 (uploading 은 실제 퍼센트, 미정이면 호환 모드 전송) */
function uploadLabel(p: UploadProgress): string {
  switch (p.phase) {
    case 'preparing':
      return '준비 중…';
    case 'requesting':
      return '연결 중…';
    case 'uploading':
      return p.percent === undefined ? '전송 중…' : `업로드 ${p.percent}%`;
    case 'done':
      return '완료';
  }
}

/** 확정 퍼센트가 없는 상태(준비·연결·호환 모드 전송)인지 — 진행 바 펄스 표시용 */
function isIndeterminate(p: UploadProgress): boolean {
  return p.phase === 'preparing' || p.phase === 'requesting' || (p.phase === 'uploading' && p.percent === undefined);
}

/** 진행 바 채움 비율 — 확정 퍼센트가 없는 단계는 얇게 깔아 살아있음을 표시 */
function uploadBarWidth(p: UploadProgress): number {
  if (p.phase === 'done') return 100;
  if (p.phase === 'uploading' && p.percent !== undefined) return Math.max(p.percent, 4);
  return 6;
}

export function PostForm({ meta, initial, isEdit, busy, onCancel, onSubmit, onUploadFile }: Props) {
  const [rec, setRec] = useState<EditRecord>(initial);
  const [error, setError] = useState<string | null>(null);
  // 저장 전 팝업 미리보기(실제 게시물과 동일 렌더) 표시 여부
  const [showPreview, setShowPreview] = useState(false);
  // 파일 업로드 진행 상태(대상 + 단계 + 퍼센트 + 다중 업로드 순번 note)
  const [uploading, setUploading] = useState<
    (UploadProgress & { target: UploadTarget; note?: string }) | null
  >(null);
  const attInputRef = useRef<HTMLInputElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const poolInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTargetRef = useRef<UploadTarget>(0);
  // 진행 중 업로드의 취소 컨트롤러 (취소 버튼이 abort)
  const abortRef = useRef<AbortController | null>(null);

  // ── 이미지 풀 + 본문 커서 상태 ──
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [poolChecked, setPoolChecked] = useState<ReadonlySet<number>>(new Set());
  const [bodyView, setBodyView] = useState<'write' | 'preview'>('write');
  const bodyKoRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyEnRef = useRef<HTMLTextAreaElement | null>(null);
  // 서식·본문 삽입이 적용될 입력칸 = 마지막으로 포커스한 본문 textarea
  const lastBodyRef = useRef<'ko' | 'en'>('ko');

  function set<K extends keyof EditRecord>(key: K, value: EditRecord[K]) {
    setRec((prev) => ({ ...prev, [key]: value }));
  }

  function updateAtt(i: number, key: 'labelKo' | 'labelEn' | 'href', value: string) {
    setRec((prev) => {
      const attachments = prev.attachments.map((a, idx) => (idx === i ? { ...a, [key]: value } : a));
      return { ...prev, attachments };
    });
  }

  function addAtt() {
    setRec((prev) => ({ ...prev, attachments: [...prev.attachments, emptyAttachment()] }));
  }

  function removeAtt(i: number) {
    setRec((prev) => ({ ...prev, attachments: prev.attachments.filter((_, idx) => idx !== i) }));
  }

  /** 업로드 버튼 → 대상 기억 후 숨은 입력 열기 */
  function pickFile(target: UploadTarget) {
    pendingTargetRef.current = target;
    (target === 'image' ? imgInputRef : attInputRef).current?.click();
  }

  /** 파일 선택 → 외부 스토리지 업로드(단계·퍼센트 실시간 표시, 취소 가능) → 대상 필드에 URL 기입 */
  async function handleFilePicked(file: File | null | undefined) {
    const target = pendingTargetRef.current;
    if (!file || !onUploadFile) return;
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setUploading({ target, phase: 'preparing' });
    try {
      const url = await onUploadFile(file, (p) => setUploading({ target, ...p }), ctrl.signal);
      if (target === 'image') {
        set('image', url);
      } else {
        setRec((prev) => {
          const attachments = prev.attachments.map((a, idx) =>
            idx === target
              ? {
                  ...a,
                  href: url,
                  // 라벨이 비어 있으면 파일명으로 채워 한 번에 입력을 끝낸다
                  labelKo: a.labelKo || file.name,
                  labelEn: a.labelEn || file.name,
                }
              : a,
          );
          return { ...prev, attachments };
        });
      }
    } catch (err) {
      // 사용자 취소는 실패가 아니라 안내로 표시
      if (err instanceof UploadCancelledError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
      }
    } finally {
      abortRef.current = null;
      setUploading(null);
      if (attInputRef.current) attInputRef.current.value = '';
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  }

  /** 진행 중 업로드 취소 (취소 버튼) */
  function cancelUpload() {
    abortRef.current?.abort();
  }

  // ── 이미지 풀: 다중 업로드 → 체크 → 본문 삽입 / 썸네일 지정 ──

  /** 여러 이미지를 순차 업로드해 풀에 쌓는다 (중간 취소 시 이미 올라간 것은 유지) */
  async function handlePoolPicked(files: FileList | null) {
    if (!files || files.length === 0 || !onUploadFile) return;
    const list = Array.from(files);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for (let i = 0; i < list.length; i += 1) {
        const f = list[i];
        const note = list.length > 1 ? `${i + 1}/${list.length}` : undefined;
        setUploading({ target: 'pool', note, phase: 'preparing' });
        // eslint-disable-next-line no-await-in-loop -- 순차 업로드(진행 표시·취소 단순화)
        const url = await onUploadFile(f, (p) => setUploading({ target: 'pool', note, ...p }), ctrl.signal);
        setPool((prev) => [...prev, { url, name: f.name }]);
      }
    } catch (err) {
      if (err instanceof UploadCancelledError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.');
      }
    } finally {
      abortRef.current = null;
      setUploading(null);
      if (poolInputRef.current) poolInputRef.current.value = '';
    }
  }

  function togglePoolCheck(i: number) {
    setPoolChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function removeCheckedFromPool() {
    setPool((prev) => prev.filter((_, i) => !poolChecked.has(i)));
    setPoolChecked(new Set());
  }

  /** 체크한 사진 1장을 대표 이미지(썸네일)로 지정 */
  function setThumbnailFromPool() {
    const idx = [...poolChecked][0];
    if (idx === undefined || !pool[idx]) return;
    set('image', pool[idx].url);
  }

  /** 마지막으로 포커스한 본문 textarea 와 대응 필드 키 */
  function activeBodyTa(): { ta: HTMLTextAreaElement | null; key: 'bodyKo' | 'bodyEn' } {
    return lastBodyRef.current === 'en'
      ? { ta: bodyEnRef.current, key: 'bodyEn' }
      : { ta: bodyKoRef.current, key: 'bodyKo' };
  }

  /** 체크한 사진들을 참조식 이미지로 본문 커서 위치에 삽입.
   *  본문에는 짧은 태그(![사진 N][img-N])만 넣고 실제 스토리지 URL 은 문서 맨 아래
   *  참조 정의([img-N]: URL)로 모은다 — 정의 줄은 렌더링에 나타나지 않는 표준 마크다운.
   *  긴 URL 이 본문 한가운데 박히지 않아 편집 중 글 흐름을 읽기 쉽다.
   *  같은 사진을 다시 넣으면 기존 번호를 재사용하고, 새 번호는 최대값+1부터 잇는다.
   *  태그 삽입(커서)과 정의 추가(문서 끝)를 한 번의 set 으로 처리한다(상태 클로버 방지). */
  function insertCheckedIntoBody() {
    const urls = pool.filter((_, i) => poolChecked.has(i)).map((p) => p.url);
    if (urls.length === 0) return;
    const { ta, key } = activeBodyTa();
    const cur = String(rec[key] ?? '');

    // 이 본문 필드에 이미 있는 참조 정의 수집 (URL → id, 번호 최대값)
    const byUrl = new Map<string, string>();
    let maxN = 0;
    for (const m of cur.matchAll(/^\[img-(\d+)\]:\s*(\S+)/gm)) {
      const n = Number(m[1]);
      if (n > maxN) maxN = n;
      if (!byUrl.has(m[2])) byUrl.set(m[2], `img-${m[1]}`);
    }

    const tags: string[] = [];
    const newDefs: string[] = [];
    for (const url of urls) {
      let id = byUrl.get(url);
      if (!id) {
        maxN += 1;
        id = `img-${maxN}`;
        byUrl.set(url, id);
        newDefs.push(`[${id}]: ${url}`);
      }
      tags.push(`![사진 ${id.slice('img-'.length)}][${id}]`);
    }

    // 커서 위치에 태그 삽입(앞뒤 빈 줄 보정) + 새 정의는 문서 끝에 덧붙임
    const snippet = tags.join('\n\n');
    const pos = ta ? ta.selectionStart : cur.length;
    const before = cur.slice(0, pos);
    const after = cur.slice(pos);
    const padL = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const padR = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    let next = before + padL + snippet + padR + after;
    if (newDefs.length > 0) {
      // 정의 블록은 앞 문단과 빈 줄로 분리돼야 문단에 흡수되지 않는다
      next = `${next.replace(/\n+$/, '')}\n\n${newDefs.join('\n')}\n`;
    }
    set(key, next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const p = (before + padL + snippet).length;
      ta.setSelectionRange(p, p);
    });
  }

  /** 서식 툴바 — 선택 영역을 마크다운 문법으로 감싼다/바꾼다 */
  function applyFormat(kind: 'bold' | 'heading' | 'list' | 'link') {
    const { ta, key } = activeBodyTa();
    if (!ta) return;
    const cur = String(rec[key] ?? '');
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = cur.slice(s, e);
    let insert: string;
    switch (kind) {
      case 'bold':
        insert = `**${sel || '굵은 텍스트'}**`;
        break;
      case 'heading':
        insert = `### ${sel || '소제목'}`;
        break;
      case 'list':
        insert = (sel || '항목').split('\n').map((l) => `- ${l}`).join('\n');
        break;
      case 'link':
        insert = `[${sel || '링크 텍스트'}](https://)`;
        break;
    }
    const before = cur.slice(0, s);
    const after = cur.slice(e);
    // 블록 서식(소제목·목록)은 줄 시작에서만 성립 → 필요 시 개행 보정
    const needsLine = kind === 'heading' || kind === 'list';
    const padL = needsLine && before !== '' && !before.endsWith('\n') ? '\n' : '';
    set(key, before + padL + insert + after);
    requestAnimationFrame(() => {
      ta.focus();
      const base = s + padL.length;
      ta.setSelectionRange(base, base + insert.length);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // id/slug 는 자동 부여(작성자 미입력) → 검증 대상 아님
    if (rec.date.trim() === '') {
      setError('날짜를 입력하세요.');
      return;
    }
    if (rec.titleKo.trim() === '') {
      setError('제목(한국어)을 입력하세요.');
      return;
    }
    onSubmit(rec);
  }

  const idLabel = meta.isNews ? 'slug' : 'id';
  // 행사 게시판, 또는 동문에서 '행사'로 체크된 글 → '날짜'를 행사 일정으로 안내(캘린더 연동)
  const dateIsEvent = meta.dateIsEvent || (meta.hasEventFlag && !!rec.isEvent);

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {/* ── 기본 정보 ── */}
      <section>
        <SectionTitle>기본 정보</SectionTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor="pf-id" className="block text-sm font-semibold text-content">
              {idLabel}
              {!isEdit && <span className="ml-1 font-normal text-content-faint">(자동 부여)</span>}
            </label>
            <input
              id="pf-id"
              type="text"
              value={rec.id}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              className={`${fieldClass} cursor-not-allowed bg-surface-soft opacity-70`}
            />
            <p className="mt-1 text-xs text-content-faint">
              {isEdit
                ? `수정 모드에서는 ${idLabel}를 변경할 수 없습니다.`
                : `${idLabel}는 저장 시 자동으로 부여됩니다.`}
            </p>
          </div>
          <div>
            <label htmlFor="pf-date" className="block text-sm font-semibold text-content">
              {dateIsEvent ? '행사 일정 (날짜)' : '날짜'}
            </label>
            <input
              id="pf-date"
              type="date"
              value={rec.date}
              onChange={(e) => set('date', e.target.value)}
              className={fieldClass}
            />
            {dateIsEvent && (
              <p className="mt-1 text-xs text-yonsei-blue">이 날짜로 금주 캘린더(일정)에 표시됩니다.</p>
            )}
          </div>
        </div>

        {/* 동문 소식·네트워크: 특정 날짜가 정해진 행사인지 체크 → 캘린더 '동문'에 표시 */}
        {meta.hasEventFlag && (
          <label className="mt-4 flex items-start gap-2.5 border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-content">
            <input
              type="checkbox"
              checked={!!rec.isEvent}
              onChange={(e) => set('isEvent', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-yonsei-blue"
            />
            <span>
              <span className="font-semibold">특정 날짜가 정해진 행사입니다</span>
              <span className="mt-0.5 block text-xs text-content-faint">
                체크하면 위 &lsquo;날짜&rsquo;가 행사일이 되어 금주 캘린더(일정)의 <b>동문</b> 카테고리에 표시됩니다. 체크하지 않으면 일반 게시물로 저장되고 캘린더에는 나오지 않습니다.
              </span>
            </span>
          </label>
        )}

        {meta.isNews && (
          <div className="mt-4">
            <label htmlFor="pf-category" className="block text-sm font-semibold text-content">
              카테고리
            </label>
            <select
              id="pf-category"
              value={rec.category ?? 'notice'}
              onChange={(e) => set('category', e.target.value as EditRecord['category'])}
              className={fieldClass}
            >
              <option value="notice">공지 (notice)</option>
              <option value="seminar">세미나 (seminar)</option>
              <option value="achievement">성과 (achievement)</option>
            </select>
          </div>
        )}
      </section>

      {/* ── 제목·부가 정보 ── */}
      <section>
        <SectionTitle>제목</SectionTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-title-ko" className="block text-sm font-semibold text-content">
              제목 (한국어)
            </label>
            <input id="pf-title-ko" type="text" value={rec.titleKo} onChange={(e) => set('titleKo', e.target.value)} className={fieldClass} />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="pf-title-en" className="block text-sm font-semibold text-content">
                제목 (English)
              </label>
              <TranslateButton source={rec.titleKo} onTranslated={(v) => set('titleEn', v)} />
            </div>
            <input id="pf-title-en" type="text" value={rec.titleEn} onChange={(e) => set('titleEn', e.target.value)} className={fieldClass} />
          </div>
        </div>

        {meta.hasHost && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-host-ko" className="block text-sm font-semibold text-content">
                주최 (한국어)
              </label>
              <input id="pf-host-ko" type="text" value={rec.hostKo ?? ''} onChange={(e) => set('hostKo', e.target.value)} className={fieldClass} />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="pf-host-en" className="block text-sm font-semibold text-content">
                  주최 (English)
                </label>
                <TranslateButton source={rec.hostKo ?? ''} onTranslated={(v) => set('hostEn', v)} />
              </div>
              <input id="pf-host-en" type="text" value={rec.hostEn ?? ''} onChange={(e) => set('hostEn', e.target.value)} className={fieldClass} />
            </div>
          </div>
        )}

        {meta.hasDateLabel && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-dl-ko" className="block text-sm font-semibold text-content">
                기간 라벨 (한국어)
              </label>
              <input id="pf-dl-ko" type="text" value={rec.dateLabelKo ?? ''} onChange={(e) => set('dateLabelKo', e.target.value)} placeholder="7/7(화)" className={fieldClass} />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="pf-dl-en" className="block text-sm font-semibold text-content">
                  기간 라벨 (English)
                </label>
                <TranslateButton source={rec.dateLabelKo ?? ''} onTranslated={(v) => set('dateLabelEn', v)} />
              </div>
              <input id="pf-dl-en" type="text" value={rec.dateLabelEn ?? ''} onChange={(e) => set('dateLabelEn', e.target.value)} placeholder="Jul 7 (Tue)" className={fieldClass} />
            </div>
          </div>
        )}
      </section>

      {/* ── 본문 (+ 뉴스 요약) ── */}
      <section>
        <SectionTitle>본문</SectionTitle>

        {meta.isNews && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-excerpt-ko" className="block text-sm font-semibold text-content">
                요약 (한국어)
              </label>
              <textarea id="pf-excerpt-ko" rows={2} value={rec.excerptKo ?? ''} onChange={(e) => set('excerptKo', e.target.value)} className={fieldClass} />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="pf-excerpt-en" className="block text-sm font-semibold text-content">
                  요약 (English)
                </label>
                <TranslateButton source={rec.excerptKo ?? ''} onTranslated={(v) => set('excerptEn', v)} />
              </div>
              <textarea id="pf-excerpt-en" rows={2} value={rec.excerptEn ?? ''} onChange={(e) => set('excerptEn', e.target.value)} className={fieldClass} />
            </div>
          </div>
        )}

        {/* 서식 툴바 + 작성/미리보기 토글 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {(
              [
                ['bold', 'B', '굵게'],
                ['heading', 'H', '소제목'],
                ['list', '≡', '목록'],
                ['link', '🔗', '링크'],
              ] as const
            ).map(([kind, glyph, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => applyFormat(kind)}
                disabled={bodyView === 'preview'}
                title={`${label} — 마지막에 클릭한 본문 칸에 적용`}
                className="grid h-8 w-8 place-items-center border border-surface-border text-sm font-bold text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:opacity-40"
              >
                <span aria-hidden="true">{glyph}</span>
                <span className="sr-only">{label}</span>
              </button>
            ))}
            <span className="ml-1 text-xs text-content-faint">
              서식·본문 삽입은 마지막에 클릭한 본문 칸에 적용됩니다
            </span>
          </div>
          <div className="flex border border-surface-border text-xs font-semibold">
            {(
              [
                ['write', '작성'],
                ['preview', '미리보기'],
              ] as const
            ).map(([view, label]) => (
              <button
                key={view}
                type="button"
                onClick={() => setBodyView(view)}
                className={`px-3 py-1.5 transition-colors ${
                  bodyView === view ? 'bg-yonsei-navy text-white' : 'text-content-soft hover:text-content'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {bodyView === 'write' ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-body-ko" className="block text-sm font-semibold text-content">
                본문 (한국어)
              </label>
              <textarea
                id="pf-body-ko"
                ref={bodyKoRef}
                rows={14}
                value={rec.bodyKo}
                onChange={(e) => set('bodyKo', e.target.value)}
                onFocus={() => {
                  lastBodyRef.current = 'ko';
                }}
                className={fieldClass}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="pf-body-en" className="block text-sm font-semibold text-content">
                  본문 (English)
                </label>
                <TranslateButton source={rec.bodyKo} onTranslated={(v) => set('bodyEn', v)} />
              </div>
              <textarea
                id="pf-body-en"
                ref={bodyEnRef}
                rows={14}
                value={rec.bodyEn}
                onChange={(e) => set('bodyEn', e.target.value)}
                onFocus={() => {
                  lastBodyRef.current = 'en';
                }}
                className={fieldClass}
              />
            </div>
          </div>
        ) : (
          /* 미리보기 — 실제 게시물 렌더(PostArticle)와 동일한 마크다운·타이포 */
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(
              [
                ['한국어', rec.bodyKo],
                ['English', rec.bodyEn],
              ] as const
            ).map(([label, text]) => (
              <div key={label} className="border border-surface-border">
                <p className="border-b border-surface-border bg-surface-soft px-3 py-1.5 text-xs font-bold text-content-faint">
                  {label}
                </p>
                <div
                  className="prose-content min-h-[10rem] px-4 py-3 text-sm"
                  dangerouslySetInnerHTML={{
                    __html: previewMarked.parse(text || '_(내용 없음)_') as string,
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-content-faint">
          빈 줄 = 문단 구분 · **굵게** · ### 소제목 · - 목록 · [텍스트](링크) — 사진은 아래
          이미지 풀에서 &lsquo;본문 삽입&rsquo;. English를 비우면 저장 시 한국어 값이 복사됩니다.
        </p>
      </section>

      {/* ── 이미지 풀 — 여러 장 올려두고 체크해서 본문 삽입 / 썸네일 지정 ── */}
      {onUploadFile && (
        <section>
          <SectionTitle>이미지</SectionTitle>
          <input
            ref={poolInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void handlePoolPicked(e.target.files)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => poolInputRef.current?.click()}
              disabled={uploading !== null}
              className="btn-secondary px-4 py-2 text-xs disabled:opacity-60"
            >
              {uploading?.target === 'pool'
                ? `${uploadLabel(uploading)}${uploading.note ? ` (${uploading.note})` : ''}`
                : '사진 업로드 (여러 장 가능)'}
            </button>
            {uploading?.target === 'pool' && (
              <button
                type="button"
                onClick={cancelUpload}
                className="border border-surface-border px-3 py-2 text-xs font-medium text-content-soft transition-colors hover:border-red-400 hover:text-red-600"
              >
                취소
              </button>
            )}
            {pool.length > 0 && (
              <>
                <span className="mx-1 h-5 w-px bg-surface-border" aria-hidden="true" />
                <button type="button" onClick={() => setPoolChecked(new Set(pool.map((_, i) => i)))} className="btn-secondary px-3 py-2 text-xs">
                  전체 선택
                </button>
                <button type="button" onClick={() => setPoolChecked(new Set())} className="btn-secondary px-3 py-2 text-xs">
                  전체 해제
                </button>
                <button
                  type="button"
                  onClick={insertCheckedIntoBody}
                  disabled={poolChecked.size === 0}
                  className="btn-primary px-3 py-2 text-xs disabled:opacity-50"
                >
                  본문 삽입
                </button>
                {meta.isNews && (
                  <button
                    type="button"
                    onClick={setThumbnailFromPool}
                    disabled={poolChecked.size !== 1}
                    title="체크한 사진 1장을 대표 이미지로 지정"
                    className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
                  >
                    썸네일 지정
                  </button>
                )}
                <button
                  type="button"
                  onClick={removeCheckedFromPool}
                  disabled={poolChecked.size === 0}
                  className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
                >
                  선택 삭제
                </button>
              </>
            )}
          </div>
          {uploading?.target === 'pool' && (
            <div className="mt-2 h-1 w-full overflow-hidden bg-surface-soft" aria-hidden="true">
              <div
                className={`h-full bg-yonsei-blue transition-[width] duration-200 ${isIndeterminate(uploading) ? 'animate-pulse' : ''}`}
                style={{ width: `${uploadBarWidth(uploading)}%` }}
              />
            </div>
          )}
          {pool.length === 0 ? (
            <p className="mt-3 text-xs text-content-faint">
              사진을 올린 뒤 체크하고 &lsquo;본문 삽입&rsquo;(커서 위치에 사진 배치)
              {meta.isNews && ' 또는 ‘썸네일 지정’(대표 이미지)'} 을 누르세요. 이미지는 자동
              압축(1600px·WebP)되어 외부 스토리지에 저장됩니다.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {pool.map((item, i) => {
                const checked = poolChecked.has(i);
                const isThumb = meta.isNews && rec.image === item.url;
                return (
                  <li key={item.url}>
                    <label
                      className={`relative block cursor-pointer border transition-colors ${
                        checked ? 'border-yonsei-blue ring-2 ring-yonsei-blue/40' : 'border-surface-border hover:border-yonsei-blue/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePoolCheck(i)}
                        className="absolute left-1.5 top-1.5 z-10 h-4 w-4 accent-yonsei-blue"
                        aria-label={`${item.name} 선택`}
                      />
                      {isThumb && (
                        <span className="absolute right-0 top-0 z-10 bg-yonsei-gold px-1.5 py-0.5 text-[10px] font-bold text-yonsei-navy">
                          썸네일
                        </span>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element -- 관리자 풀 미리보기 */}
                      <img src={item.url} alt="" className="h-20 w-full object-cover" />
                      <span className="block truncate px-1.5 py-1 text-[11px] text-content-faint">
                        {item.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── 대표 이미지 (뉴스) — 직접 업로드 또는 경로/링크 입력 ── */}
      {meta.isNews && (
        <section>
          <SectionTitle>대표 이미지</SectionTitle>
          {onUploadFile && (
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => void handleFilePicked(e.target.files?.[0])}
            />
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              id="pf-image"
              type="text"
              aria-label="대표 이미지 경로 또는 링크"
              value={rec.image ?? ''}
              onChange={(e) => set('image', e.target.value)}
              placeholder="/img/programs/bk21.jpg 또는 https://… — 업로드 시 자동 기입"
              className={`${attFieldClass} min-w-0 flex-1`}
            />
            {onUploadFile && (
              <button
                type="button"
                onClick={() => pickFile('image')}
                disabled={uploading !== null}
                className="btn-secondary shrink-0 px-4 py-2 text-xs disabled:opacity-60"
              >
                {uploading?.target === 'image' ? uploadLabel(uploading) : '이미지 업로드'}
              </button>
            )}
            {uploading?.target === 'image' && (
              <button
                type="button"
                onClick={cancelUpload}
                className="shrink-0 border border-surface-border px-3 py-2 text-xs font-medium text-content-soft transition-colors hover:border-red-400 hover:text-red-600"
              >
                취소
              </button>
            )}
          </div>
          {/* 진행 바 — 단계·퍼센트를 시각화 (불확정 단계는 얇은 펄스) */}
          {uploading?.target === 'image' && (
            <div className="mt-2 h-1 w-full overflow-hidden bg-surface-soft" aria-hidden="true">
              <div
                className={`h-full bg-yonsei-blue transition-[width] duration-200 ${isIndeterminate(uploading) ? 'animate-pulse' : ''}`}
                style={{ width: `${uploadBarWidth(uploading)}%` }}
              />
            </div>
          )}
          {rec.image?.trim() && (
            <div className="mt-3 flex items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- 관리자 미리보기(임의 외부 URL 허용) */}
              <img
                src={rec.image}
                alt="대표 이미지 미리보기"
                className="h-24 w-36 border border-surface-border object-cover"
              />
              <p className="text-xs text-content-faint">미리보기 — 목록·상세 카드에 이 비율로 잘려 표시될 수 있습니다.</p>
            </div>
          )}
        </section>
      )}

      {/* ── 첨부파일 — 파일 업로드(href 자동 기입) 또는 외부 링크 직접 입력 ── */}
      <section>
        <SectionTitle>첨부파일</SectionTitle>
        {onUploadFile && (
          <input
            ref={attInputRef}
            type="file"
            accept="image/*,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void handleFilePicked(e.target.files?.[0])}
          />
        )}
        <div className="mt-4 space-y-3">
          {rec.attachments.length === 0 && <p className="text-xs text-content-faint">첨부파일이 없습니다.</p>}
          {rec.attachments.map((att, i) => (
            <div key={i}>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto_auto]">
                <input
                  type="text"
                  aria-label={`첨부 ${i + 1} 라벨 한국어`}
                  value={att.labelKo}
                  onChange={(e) => updateAtt(i, 'labelKo', e.target.value)}
                  placeholder="라벨(한)"
                  className={attFieldClass}
                />
                <input
                  type="text"
                  aria-label={`첨부 ${i + 1} 라벨 영어`}
                  value={att.labelEn}
                  onChange={(e) => updateAtt(i, 'labelEn', e.target.value)}
                  placeholder="Label (en)"
                  className={attFieldClass}
                />
                <input
                  type="text"
                  aria-label={`첨부 ${i + 1} 링크`}
                  value={att.href}
                  onChange={(e) => updateAtt(i, 'href', e.target.value)}
                  placeholder="href — 파일 업로드 시 자동 기입"
                  className={attFieldClass}
                />
                {onUploadFile && (
                  <button
                    type="button"
                    onClick={() => (uploading?.target === i ? cancelUpload() : pickFile(i))}
                    disabled={uploading !== null && uploading.target !== i}
                    className={`whitespace-nowrap px-3 py-2 text-xs disabled:opacity-60 ${
                      uploading?.target === i
                        ? 'border border-surface-border font-medium text-content-soft transition-colors hover:border-red-400 hover:text-red-600'
                        : 'btn-secondary'
                    }`}
                    title={uploading?.target === i ? '클릭하면 업로드를 취소합니다' : undefined}
                  >
                    {uploading?.target === i ? `${uploadLabel(uploading)} ✕` : '파일'}
                  </button>
                )}
                <button type="button" onClick={() => removeAtt(i)} className="btn-secondary px-3 py-2 text-xs">
                  삭제
                </button>
              </div>
              {/* 진행 바 — 업로드 중인 행 아래에만 표시 */}
              {uploading?.target === i && (
                <div className="mt-1.5 h-1 w-full overflow-hidden bg-surface-soft" aria-hidden="true">
                  <div
                    className={`h-full bg-yonsei-blue transition-[width] duration-200 ${isIndeterminate(uploading) ? 'animate-pulse' : ''}`}
                    style={{ width: `${uploadBarWidth(uploading)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addAtt} className="btn-secondary mt-3 px-4 py-2 text-xs">
          첨부 추가
        </button>
        {onUploadFile && (
          <p className="mt-2 text-xs text-content-faint">
            파일은 외부 스토리지(Vercel Blob)에 저장되고 게시물에는 링크만 기록됩니다. 이미지 최대
            20MB(자동 압축), 문서 20MB.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-3 border-t border-surface-border pt-6">
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? '저장 중…' : '저장 (커밋)'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary disabled:opacity-60">
          취소
        </button>
        {/* 미리보기는 저장과 무관하므로 업로드/저장 중(busy)에도 활성. ml-auto 로 우측 분리 */}
        <button type="button" onClick={() => setShowPreview(true)} className="btn-secondary ml-auto">
          미리보기
        </button>
      </div>

      {showPreview && (
        <PostPreviewModal meta={meta} rec={rec} onClose={() => setShowPreview(false)} />
      )}
    </form>
  );
}
