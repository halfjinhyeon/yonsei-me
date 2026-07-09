'use client';

// 새 글/수정 공용 편집 폼. 게시판 종류에 따라 추가 필드(세미나 주최, 행사 기간,
// 뉴스 slug/category/요약/이미지)를 조건부로 노출한다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useState } from 'react';
import type { BoardMeta, EditRecord } from '@/lib/admin/boards';
import { emptyAttachment } from '@/lib/admin/boards';
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
}

const fieldClass =
  'mt-1 w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue';

export function PostForm({ meta, initial, isEdit, busy, onCancel, onSubmit }: Props) {
  const [rec, setRec] = useState<EditRecord>(initial);
  const [error, setError] = useState<string | null>(null);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rec.id.trim() === '') {
      setError(meta.isNews ? 'slug를 입력하세요.' : 'id를 입력하세요.');
      return;
    }
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
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor="pf-id" className="block text-sm font-semibold text-content">
            {idLabel}
          </label>
          <input
            id="pf-id"
            type="text"
            value={rec.id}
            readOnly={isEdit}
            onChange={(e) => set('id', e.target.value)}
            className={`${fieldClass} ${isEdit ? 'cursor-not-allowed opacity-70' : ''}`}
          />
          {isEdit && <p className="mt-1 text-xs text-content-faint">수정 모드에서는 {idLabel}를 변경할 수 없습니다.</p>}
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
        <label className="flex items-start gap-2.5 rounded-lg border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-content">
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
        <div>
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

      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="grid gap-4 sm:grid-cols-2">
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

      {meta.isNews && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
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
          <div>
            <label htmlFor="pf-image" className="block text-sm font-semibold text-content">
              이미지 경로
            </label>
            <input id="pf-image" type="text" value={rec.image ?? ''} onChange={(e) => set('image', e.target.value)} placeholder="/img/programs/bk21.jpg" className={fieldClass} />
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
      <p className="text-xs text-content-faint">문단은 빈 줄(엔터 두 번)로 구분됩니다. English를 비우면 저장 시 한국어 값이 복사됩니다.</p>

      {/* 첨부파일 */}
      <fieldset className="rounded-lg border border-surface-border p-4">
        <legend className="px-1 text-sm font-semibold text-content">첨부파일</legend>
        <div className="space-y-3">
          {rec.attachments.length === 0 && <p className="text-xs text-content-faint">첨부파일이 없습니다.</p>}
          {rec.attachments.map((att, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
              <input
                type="text"
                aria-label={`첨부 ${i + 1} 라벨 한국어`}
                value={att.labelKo}
                onChange={(e) => updateAtt(i, 'labelKo', e.target.value)}
                placeholder="라벨(한)"
                className="rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
              <input
                type="text"
                aria-label={`첨부 ${i + 1} 라벨 영어`}
                value={att.labelEn}
                onChange={(e) => updateAtt(i, 'labelEn', e.target.value)}
                placeholder="Label (en)"
                className="rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
              <input
                type="text"
                aria-label={`첨부 ${i + 1} 링크`}
                value={att.href}
                onChange={(e) => updateAtt(i, 'href', e.target.value)}
                placeholder="href (#)"
                className="rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
              <button type="button" onClick={() => removeAtt(i)} className="btn-secondary px-3 py-2 text-xs">
                삭제
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addAtt} className="btn-secondary mt-3 px-4 py-2 text-xs">
          첨부 추가
        </button>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-3">
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
