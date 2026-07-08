'use client';

// 스키마 기반 범용 편집 폼. resources.ts 의 FieldDef[] 를 읽어 필드 kind 별로
// 입력 위젯을 렌더하고, validateForm 으로 검증한다. PostForm 의 시각 언어
// (fieldClass, red alert, btn-primary/secondary)를 그대로 따른다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useState } from 'react';
import type { FieldDef, FormRecord, LocalizedPair } from '@/lib/admin/resources';
import { validateForm } from '@/lib/admin/resources';

// PostForm 과 동일한 입력 스타일
const fieldClass =
  'mt-1 w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue';

// 항목별 연결 마크다운(동아리 소개 본문 등)을 폼 하단에 함께 편집하기 위한 계약
export interface LinkedMarkdownField {
  label: string;
  hint?: string;
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
}: Props) {
  const [form, setForm] = useState<FormRecord>(initial);
  const [error, setError] = useState<string | null>(null);

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
            <label htmlFor={`${id}-en`} className="block text-sm font-semibold text-content">
              {f.label} (English)
            </label>
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
