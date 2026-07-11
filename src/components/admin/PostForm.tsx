'use client';

// 새 글/수정 공용 편집 폼. 게시판 종류에 따라 추가 필드(세미나 주최, 행사 기간,
// 뉴스 slug/category/요약/이미지)를 조건부로 노출한다.
// 본 사이트와 통일감 있는 에디토리얼 톤: 각진 흰 입력 필드 + 섹션별 헤어라인 구분.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useRef, useState } from 'react';
import type { BoardMeta, EditRecord } from '@/lib/admin/boards';
import { emptyAttachment } from '@/lib/admin/boards';
import type { UploadProgress, UploadProgressHandler } from '@/lib/admin/storage';
import { TranslateButton } from './TranslateButton';

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
  onUploadFile?: (file: File, onProgress?: UploadProgressHandler) => Promise<string>;
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

/** 파일 업로드 대상: 첨부 행 인덱스 또는 대표 이미지 */
type UploadTarget = number | 'image';

/** 진행 단계 → 사용자 표시 문구 (uploading 은 실제 퍼센트 표시) */
function uploadLabel(p: UploadProgress): string {
  switch (p.phase) {
    case 'preparing':
      return '준비 중…';
    case 'requesting':
      return '연결 중…';
    case 'uploading':
      return `업로드 ${p.percent ?? 0}%`;
    case 'done':
      return '완료';
  }
}

/** 진행 바 채움 비율 — 확정 퍼센트가 없는 단계는 얇게 깔아 살아있음을 표시 */
function uploadBarWidth(p: UploadProgress): number {
  if (p.phase === 'done') return 100;
  if (p.phase === 'uploading') return Math.max(p.percent ?? 0, 4);
  return 6;
}

export function PostForm({ meta, initial, isEdit, busy, onCancel, onSubmit, onUploadFile }: Props) {
  const [rec, setRec] = useState<EditRecord>(initial);
  const [error, setError] = useState<string | null>(null);
  // 파일 업로드 진행 상태(대상 + 단계 + 퍼센트). 숨은 파일 입력은 첨부/이미지 각 1개를 공유한다.
  const [uploading, setUploading] = useState<(UploadProgress & { target: UploadTarget }) | null>(
    null,
  );
  const attInputRef = useRef<HTMLInputElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTargetRef = useRef<UploadTarget>(0);

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

  /** 파일 선택 → 외부 스토리지 업로드(단계·퍼센트 실시간 표시) → 대상 필드에 URL 기입 */
  async function handleFilePicked(file: File | null | undefined) {
    const target = pendingTargetRef.current;
    if (!file || !onUploadFile) return;
    setError(null);
    setUploading({ target, phase: 'preparing' });
    try {
      const url = await onUploadFile(file, (p) => setUploading({ target, ...p }));
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
      setError(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    } finally {
      setUploading(null);
      if (attInputRef.current) attInputRef.current.value = '';
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-body-ko" className="block text-sm font-semibold text-content">
              본문 (한국어)
            </label>
            <textarea id="pf-body-ko" rows={8} value={rec.bodyKo} onChange={(e) => set('bodyKo', e.target.value)} className={fieldClass} />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="pf-body-en" className="block text-sm font-semibold text-content">
                본문 (English)
              </label>
              <TranslateButton source={rec.bodyKo} onTranslated={(v) => set('bodyEn', v)} />
            </div>
            <textarea id="pf-body-en" rows={8} value={rec.bodyEn} onChange={(e) => set('bodyEn', e.target.value)} className={fieldClass} />
          </div>
        </div>
        <p className="mt-2 text-xs text-content-faint">문단은 빈 줄(엔터 두 번)로 구분됩니다. English를 비우면 저장 시 한국어 값이 복사됩니다.</p>
      </section>

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
          </div>
          {/* 진행 바 — 단계·퍼센트를 시각화 (불확정 단계는 얇은 펄스) */}
          {uploading?.target === 'image' && (
            <div className="mt-2 h-1 w-full overflow-hidden bg-surface-soft" aria-hidden="true">
              <div
                className={`h-full bg-yonsei-blue transition-[width] duration-200 ${uploading.phase === 'preparing' || uploading.phase === 'requesting' ? 'animate-pulse' : ''}`}
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
                    onClick={() => pickFile(i)}
                    disabled={uploading !== null}
                    className="btn-secondary whitespace-nowrap px-3 py-2 text-xs disabled:opacity-60"
                  >
                    {uploading?.target === i ? uploadLabel(uploading) : '파일'}
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
                    className={`h-full bg-yonsei-blue transition-[width] duration-200 ${uploading.phase === 'preparing' || uploading.phase === 'requesting' ? 'animate-pulse' : ''}`}
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
      </div>
    </form>
  );
}
