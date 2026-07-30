'use client';

// 스키마 기반 범용 편집 폼. resources.ts 의 FieldDef[] 를 읽어 필드 kind 별로
// 입력 위젯을 렌더하고, validateForm 으로 검증한다. PostForm 의 시각 언어
// (fieldClass, red alert, btn-primary/secondary)를 그대로 따른다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useState } from 'react';
import type { FieldDef, FormRecord, LocalizedPair } from '@/lib/admin/resources';
import { validateForm } from '@/lib/admin/resources';
import { ClubCardsEditor } from './ClubCardsEditor';
import { TranslateButton } from './TranslateButton';

// PostForm 과 동일한 입력 스타일
const fieldClass =
  'mt-1 w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue';

// 항목별 연결 마크다운(동아리 소개 본문 등)을 폼 하단에 함께 편집하기 위한 계약
export interface LinkedMarkdownField {
  label: string;
  hint?: string;
  /** 지정 시 원문 textarea 대신 전용 구조 편집기 탭을 함께 제공한다 */
  structured?: 'clubCards';
  value: string;
  loading?: boolean;
  onChange: (v: string) => void;
}

interface Props {
  fields: FieldDef[];
  initial: FormRecord;
  isEdit: boolean;
  busy: boolean;
  onSubmit: (form: FormRecord) => void;
  onCancel: () => void;
  linkedMarkdown?: LinkedMarkdownField | null;
  onDirty?: () => void;
  /** imageUpload 필드가 이미지를 올릴 때 호출 — 저장할 공개 URL 을 돌려준다
   *  (업로드 경로·파일명은 상위/스토리지가 정한다. config 를 가진 상위가 주입) */
  onUploadImage?: (file: File) => Promise<string>;
}

// 그리드 폭 → col-span 매핑 (컨테이너는 sm:grid-cols-6)
function spanClass(width: FieldDef['width']): string {
  switch (width) {
    case 'half':
      return 'sm:col-span-3';
    case 'third':
      return 'sm:col-span-2';
    default:
      return 'sm:col-span-6';
  }
}

export function RecordForm({
  fields,
  initial,
  isEdit,
  busy,
  onSubmit,
  onCancel,
  linkedMarkdown,
  onDirty,
  onUploadImage,
}: Props) {
  const [form, setForm] = useState<FormRecord>(initial);
  const [error, setError] = useState<string | null>(null);
  // 연결 마크다운이 structured 일 때의 편집 모드 (기본: 카드 편집)
  const [mdTab, setMdTab] = useState<'structured' | 'raw'>('structured');
  // imageUpload 필드별 업로드 상태 + 미리보기 캐시버스터
  const [uploadState, setUploadState] = useState<Record<string, { busy: boolean; error: string | null }>>({});
  const [previewBust, setPreviewBust] = useState(0);

  const hasLocalized = fields.some((f) => f.kind === 'localized');

  // 값 변경 시 상태 갱신 + dirty 통지
  function setValue(key: string, value: FormRecord[string]) {
    onDirty?.();
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setLocalized(key: string, part: 'ko' | 'en', value: string) {
    onDirty?.();
    setForm((prev) => {
      const cur = (prev[key] ?? { ko: '', en: '' }) as LocalizedPair;
      return { ...prev, [key]: { ...cur, [part]: value } };
    });
  }

  function setListItem(key: string, i: number, value: string) {
    onDirty?.();
    setForm((prev) => {
      const arr = ((prev[key] ?? []) as string[]).slice();
      arr[i] = value;
      return { ...prev, [key]: arr };
    });
  }

  function addListItem(key: string) {
    onDirty?.();
    setForm((prev) => {
      const arr = ((prev[key] ?? []) as string[]).slice();
      arr.push('');
      return { ...prev, [key]: arr };
    });
  }

  function removeListItem(key: string, i: number) {
    onDirty?.();
    setForm((prev) => {
      const arr = ((prev[key] ?? []) as string[]).filter((_, idx) => idx !== i);
      return { ...prev, [key]: arr };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validateForm(fields, form);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    onSubmit(form);
  }

  // 이미지 업로드: 업로드가 돌려준 공개 URL 을 그대로 필드 값으로 쓴다.
  // ⚠️ 예전에는 `<folder>/<이름>.<확장자>` 를 조립해 저장소에 커밋하고 그 경로를
  // 값으로 넣었다. 콘텐츠 저장이 Git 커밋을 떠난 뒤로는 저장 위치를 스토리지가
  // 정하므로, 화면이 경로를 만들지 않고 결과 URL 을 받아 적는다(그래서 이름을 먼저
  // 입력하라는 제약도 사라졌다 — 파일명이 더 이상 이름에 묶이지 않는다).
  async function handleUpload(
    f: Extract<FieldDef, { kind: 'imageUpload' }>,
    file: File | null | undefined,
  ) {
    if (!file) return;
    const setErr = (error: string) =>
      setUploadState((s) => ({ ...s, [f.key]: { busy: false, error } }));

    if (!onUploadImage) return setErr('업로드를 사용할 수 없습니다.');
    if (file.size > 5 * 1024 * 1024) return setErr('5MB 이하 이미지만 올릴 수 있습니다.');

    setUploadState((s) => ({ ...s, [f.key]: { busy: true, error: null } }));
    try {
      const url = await onUploadImage(file);
      setValue(f.key, url);
      setPreviewBust((n) => n + 1);
      setUploadState((s) => ({ ...s, [f.key]: { busy: false, error: null } }));
    } catch (err) {
      setErr(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    }
  }

  function renderField(f: FieldDef) {
    const id = `rf-${f.key}`;

    if (f.kind === 'localized') {
      const v = (form[f.key] ?? { ko: '', en: '' }) as LocalizedPair;
      const rows = f.rows ?? 3;
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-ko`} className="block text-sm font-semibold text-content">
              {f.label} (한국어)
              {f.required && <span className="text-red-500"> *</span>}
            </label>
            {f.multiline ? (
              <textarea
                id={`${id}-ko`}
                rows={rows}
                value={v.ko}
                onChange={(e) => setLocalized(f.key, 'ko', e.target.value)}
                placeholder={f.placeholder}
                className={fieldClass}
              />
            ) : (
              <input
                id={`${id}-ko`}
                type="text"
                value={v.ko}
                onChange={(e) => setLocalized(f.key, 'ko', e.target.value)}
                placeholder={f.placeholder}
                className={fieldClass}
              />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${id}-en`} className="block text-sm font-semibold text-content">
                {f.label} (English)
              </label>
              <TranslateButton source={v.ko} onTranslated={(en) => setLocalized(f.key, 'en', en)} />
            </div>
            {f.multiline ? (
              <textarea
                id={`${id}-en`}
                rows={rows}
                value={v.en}
                onChange={(e) => setLocalized(f.key, 'en', e.target.value)}
                className={fieldClass}
              />
            ) : (
              <input
                id={`${id}-en`}
                type="text"
                value={v.en}
                onChange={(e) => setLocalized(f.key, 'en', e.target.value)}
                className={fieldClass}
              />
            )}
          </div>
        </div>
      );
    }

    if (f.kind === 'checkbox') {
      const checked = form[f.key] === true;
      return (
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => setValue(f.key, e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-yonsei-blue"
          />
          <span className="text-sm leading-snug">
            <span className="font-semibold text-content">{f.label}</span>
            {f.hint && (
              <span className="mt-0.5 block text-xs font-normal text-content-faint">{f.hint}</span>
            )}
          </span>
        </label>
      );
    }

    const str = String(form[f.key] ?? '');

    const labelEl = (
      <label htmlFor={id} className="block text-sm font-semibold text-content">
        {f.label}
        {f.required && <span className="text-red-500"> *</span>}
      </label>
    );

    if (f.kind === 'text') {
      const locked = isEdit && f.readOnlyOnEdit;
      return (
        <div>
          {labelEl}
          <input
            id={id}
            type="text"
            value={str}
            readOnly={locked}
            onChange={(e) => setValue(f.key, e.target.value)}
            placeholder={f.placeholder}
            className={`${fieldClass} ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
          />
          {locked && (
            <p className="mt-1 text-xs text-content-faint">수정 모드에서는 {f.label}을(를) 변경할 수 없습니다.</p>
          )}
          {f.hint && !locked && <p className="mt-1 text-xs text-content-faint">{f.hint}</p>}
        </div>
      );
    }

    if (f.kind === 'textarea') {
      return (
        <div>
          {labelEl}
          <textarea
            id={id}
            rows={f.rows ?? 4}
            value={str}
            onChange={(e) => setValue(f.key, e.target.value)}
            placeholder={f.placeholder}
            className={fieldClass}
          />
          {f.hint && <p className="mt-1 text-xs text-content-faint">{f.hint}</p>}
        </div>
      );
    }

    if (f.kind === 'select') {
      // 빈 옵션 노출 조건: 값이 비었거나 emptyOptionLabel 지정 시.
      // emptyOptionLabel 없고 required면 "선택…" placeholder 로 안내한다.
      const showEmpty = str === '' || f.emptyOptionLabel !== undefined;
      const emptyLabel = f.emptyOptionLabel ?? (f.required ? '선택…' : '');
      return (
        <div>
          {labelEl}
          <select
            id={id}
            value={str}
            onChange={(e) => setValue(f.key, e.target.value)}
            className={fieldClass}
          >
            {showEmpty && <option value="">{emptyLabel}</option>}
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {f.hint && <p className="mt-1 text-xs text-content-faint">{f.hint}</p>}
        </div>
      );
    }

    if (f.kind === 'month') {
      return (
        <div>
          {labelEl}
          <input
            id={id}
            type="month"
            value={str}
            onChange={(e) => setValue(f.key, e.target.value)}
            className={fieldClass}
          />
          {f.hint && <p className="mt-1 text-xs text-content-faint">{f.hint}</p>}
        </div>
      );
    }

    if (f.kind === 'image') {
      const showPreview = str.startsWith('/');
      return (
        <div>
          {labelEl}
          <input
            id={id}
            type="text"
            value={str}
            onChange={(e) => setValue(f.key, e.target.value)}
            placeholder={f.placeholder}
            className={fieldClass}
          />
          {f.hint && <p className="mt-1 text-xs text-content-faint">{f.hint}</p>}
          {showPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={str} alt="" className="mt-2 h-20 rounded border border-surface-border" />
          )}
        </div>
      );
    }

    if (f.kind === 'imageUpload') {
      const url = str;
      const up = uploadState[f.key];
      // 값은 사이트 내부 경로(/img/faculty/…)이거나 스토리지 절대 URL(업로드 결과)이다.
      // 둘 다 미리보기를 띄운다 — 절대 URL 을 빼면 방금 올린 사진이 안 보인다.
      const hasImg = url.startsWith('/') || /^https?:\/\//.test(url);
      return (
        <div>
          {labelEl}
          <div className="mt-1 flex items-start gap-3">
            {hasImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${url}?t=${previewBust}`}
                alt=""
                className="h-24 w-24 shrink-0 rounded-lg border border-surface-border object-cover"
              />
            ) : (
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-lg border border-dashed border-surface-border text-[10px] text-content-faint">
                사진 없음
              </div>
            )}
            <div className="min-w-0 flex-1">
              <input
                id={id}
                type="file"
                accept="image/*"
                aria-label={`${f.label} 업로드`}
                disabled={busy || up?.busy || !onUploadImage}
                onChange={(e) => {
                  void handleUpload(f, e.target.files?.[0]);
                  e.target.value = '';
                }}
                className="block w-full text-sm text-content-soft file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-surface-border file:bg-surface-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-content hover:file:border-yonsei-blue disabled:opacity-60"
              />
              {up?.busy && <p className="mt-1 text-xs text-content-soft">업로드 중…</p>}
              {up?.error && <p className="mt-1 text-xs text-red-600">{up.error}</p>}
              {hasImg && !up?.busy && !up?.error && (
                <p className="mt-1 truncate text-xs text-content-faint">{url}</p>
              )}
            </div>
          </div>
          {f.hint && <p className="mt-2 text-xs text-content-faint">{f.hint}</p>}
        </div>
      );
    }

    // imageList — PostForm 첨부파일 UI 처럼 행 추가/삭제
    const list = (form[f.key] ?? []) as string[];
    return (
      <fieldset className="rounded-lg border border-surface-border p-4">
        <legend className="px-1 text-sm font-semibold text-content">{f.label}</legend>
        {f.hint && <p className="mb-3 text-xs text-content-faint">{f.hint}</p>}
        <div className="space-y-3">
          {list.length === 0 && <p className="text-xs text-content-faint">항목이 없습니다.</p>}
          {list.map((val, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                aria-label={`${f.label} ${i + 1}`}
                value={val}
                onChange={(e) => setListItem(f.key, i, e.target.value)}
                placeholder={f.placeholder ?? '/img/...'}
                className="rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
              <button
                type="button"
                onClick={() => removeListItem(f.key, i)}
                className="btn-secondary px-3 py-2 text-xs"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addListItem(f.key)}
          className="btn-secondary mt-3 px-4 py-2 text-xs"
        >
          추가
        </button>
      </fieldset>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        {fields.map((f) => (
          <div key={f.key} className={f.kind === 'localized' ? 'sm:col-span-6' : spanClass(f.width)}>
            {renderField(f)}
          </div>
        ))}
      </div>

      {hasLocalized && (
        <p className="text-xs text-content-faint">English를 비우면 저장 시 한국어 값이 복사됩니다.</p>
      )}

      {linkedMarkdown && (
        <fieldset className="rounded-lg border border-surface-border p-4">
          <legend className="px-1 text-sm font-semibold text-content">{linkedMarkdown.label}</legend>
          {linkedMarkdown.hint && (
            <p className="mb-3 text-xs text-content-faint">{linkedMarkdown.hint}</p>
          )}
          {linkedMarkdown.loading ? (
            <p className="text-sm text-content-soft">불러오는 중…</p>
          ) : linkedMarkdown.structured === 'clubCards' ? (
            <>
              {/* 카드 편집 / 원문 세그먼트 토글 (MarkdownEditor 톤) */}
              <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-surface-border">
                {(['structured', 'raw'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMdTab(t)}
                    aria-current={mdTab === t ? 'true' : undefined}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      mdTab === t
                        ? 'bg-yonsei-navy text-white'
                        : 'bg-surface-soft text-content-soft hover:bg-surface hover:text-content'
                    }`}
                  >
                    {t === 'structured' ? '카드 편집' : '원문'}
                  </button>
                ))}
              </div>
              {mdTab === 'structured' ? (
                <ClubCardsEditor
                  value={linkedMarkdown.value}
                  onChange={(v) => {
                    onDirty?.();
                    linkedMarkdown.onChange(v);
                  }}
                />
              ) : (
                <textarea
                  aria-label={linkedMarkdown.label}
                  rows={14}
                  value={linkedMarkdown.value}
                  onChange={(e) => {
                    onDirty?.();
                    linkedMarkdown.onChange(e.target.value);
                  }}
                  className={`${fieldClass} font-mono`}
                />
              )}
            </>
          ) : (
            <textarea
              aria-label={linkedMarkdown.label}
              rows={14}
              value={linkedMarkdown.value}
              onChange={(e) => {
                onDirty?.();
                linkedMarkdown.onChange(e.target.value);
              }}
              className={`${fieldClass} font-mono`}
            />
          )}
        </fieldset>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? '저장 중…' : '저장 (커밋)'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-secondary disabled:opacity-60"
        >
          취소
        </button>
      </div>
    </form>
  );
}
