'use client';

// 팝업 공지 '자세히' — 아임웹 "팝업·배너 > 편집 및 추가" 처럼 **왼쪽 라벨 · 오른쪽 입력**의
// 세로 행 폼이다. 범용 RecordForm 의 6칸 그리드는 팝업처럼 "설정을 위에서 아래로 읽으며
// 정하는" 화면과 맞지 않아(기간·기기·페이지·닫기 규칙이 서로 떨어져 놓인다) 리소스 전용
// 편집기로 갈아 끼웠다.
//
// 입력 외형은 프로젝트의 기존 폼(PostForm·RecordForm 의 fieldClass)을 그대로 쓴다 —
// 아임웹의 밑줄 입력은 흉내 내지 않는다(각진 엣지·그림자 없음·금색 금지).
//
// 값 직렬화는 여기서 하지 않는다. 폼 값을 모아 onSubmit 으로 올리면 resources.ts 의
// fromForm 한 곳이 책임진다(DetailEditorProps 계약).
//
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useRef, useState } from 'react';
import type { FieldDef, FormRecord, LocalizedPair } from '@/lib/admin/resources';
import { validateForm } from '@/lib/admin/resources';
import type { DetailEditorProps } from './DetailEditorTypes';
import { PopupStylePicker } from './PopupStylePicker';
import { TranslateButton } from './TranslateButton';

// RecordForm·PostForm 과 동일한 입력 스타일
const fieldClass =
  'w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue';

function str(form: FormRecord, key: string): string {
  const v = form[key];
  return v == null ? '' : String(v);
}

function pair(form: FormRecord, key: string): LocalizedPair {
  return (form[key] ?? { ko: '', en: '' }) as LocalizedPair;
}

/** 한 줄 = 왼쪽 라벨(고정 폭) + 오른쪽 입력. 좁은 화면에서는 위아래로 접힌다. */
function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-6 gap-y-2 py-4 sm:grid-cols-[140px_minmax(0,1fr)]">
      <div className="sm:pt-2 sm:text-right">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm text-content-faint">
            {label}
          </label>
        ) : (
          // 라디오·체크박스 묶음은 개별 라벨이 따로 있으므로 그룹 이름만 둔다
          <span className="text-sm text-content-faint">{label}</span>
        )}
      </div>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1.5 text-xs text-content-faint">{hint}</p>}
      </div>
    </div>
  );
}

/** 라디오 한 벌 (가로 나열) */
function RadioRow({
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-content">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
            className="h-4 w-4 accent-[#003377]"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** 사진 한 칸 — 연한 회색 박스 안에 미리보기(+ 우상단 ✕), 비어 있으면 가운데 "파일 선택".
 *  업로드 규칙은 RecordForm 의 handleUpload 와 같다(용량 게이트 → onUploadImage). */
function PhotoBox({
  field,
  value,
  onChange,
  onUploadImage,
  disabled,
  caption,
  note,
}: {
  field: Extract<FieldDef, { kind: 'imageUpload' }> | undefined;
  value: string;
  onChange: (url: string) => void;
  onUploadImage?: (file: File, opts?: { maxDim?: number; folder?: string }) => Promise<string>;
  disabled?: boolean;
  caption: string;
  note?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(0);
  const has = value.trim() !== '';

  async function upload(file: File) {
    setError(null);
    if (!onUploadImage) {
      setError('업로드를 사용할 수 없습니다.');
      return;
    }
    const limitMB = field?.maxSizeMB ?? 5;
    if (file.size > limitMB * 1024 * 1024) {
      setError(`${limitMB}MB 이하 이미지만 올릴 수 있습니다.`);
      return;
    }
    setUploading(true);
    try {
      const url = await onUploadImage(file, {
        maxDim: field?.maxDim,
        // 저장 폴더 키 = 필드 folder 의 마지막 세그먼트(public/img/popup → uploads/popup/)
        folder: field?.folder.split('/').filter(Boolean).pop(),
      });
      onChange(url);
      setBust((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-xs font-bold text-content">{caption}</p>
      <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[2px] border border-surface-border bg-surface-soft p-3">
        {has ? (
          <>
            {/* 관리자 화면이라 최적화보다 즉시 반영이 중요 — next/image 대신 일반 img. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${value}${bust ? `?v=${bust}` : ''}`}
              alt=""
              className="max-h-[320px] w-auto max-w-full object-contain"
            />
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled || uploading}
              aria-label={`${caption} 지우기`}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-[2px] border border-surface-border bg-surface text-sm font-bold text-content-faint transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:opacity-50"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading || !onUploadImage}
            className="rounded-[2px] border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:opacity-50"
          >
            파일 선택
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 grid place-items-center bg-white/90 text-xs font-bold text-yonsei-navy">
            업로드 중…
          </div>
        )}
      </div>

      {has && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="mt-2 block w-full rounded-[2px] border border-surface-border bg-surface px-2 py-2 text-xs font-semibold text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:opacity-50"
        >
          사진 교체
        </button>
      )}
      {note && <p className="mt-1.5 text-[11px] leading-relaxed text-content-faint">{note}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-[#b42318]">
          {error}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function PopupDetailEditor({
  fields,
  initial,
  isEdit,
  busy,
  onSubmit,
  onCancel,
  onDirty,
  onUploadImage,
}: DetailEditorProps) {
  const [form, setForm] = useState<FormRecord>({ ...initial });
  const [error, setError] = useState<string | null>(null);
  // 노출 페이지 모드는 **화면 상태**다 — pages 에서 매번 유도하면 '홈' 하나만 고른 채로
  // '사용자 정의'를 열 수 없다(값이 그대로라 곧장 '홈 화면'으로 되돌아간다).
  const [pageMode, setPageMode] = useState<'home' | 'custom'>(() => {
    const p = (initial.pages ?? []) as string[];
    return p.length === 1 && p[0] === 'home' ? 'home' : 'custom';
  });

  function set(key: string, value: FormRecord[string]) {
    onDirty?.();
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const field = (key: string) => fields.find((f) => f.key === key);
  const imageField = field('image');
  const imageMobileField = field('imageMobile');
  const styleField = field('style');
  const pageOptions =
    field('pages')?.kind === 'checkboxGroup'
      ? (field('pages') as Extract<FieldDef, { kind: 'checkboxGroup' }>).options
      : [];
  const deviceOptions =
    field('devices')?.kind === 'checkboxGroup'
      ? (field('devices') as Extract<FieldDef, { kind: 'checkboxGroup' }>).options
      : [];
  const closeOptions =
    field('closeControl')?.kind === 'radio'
      ? (field('closeControl') as Extract<FieldDef, { kind: 'radio' }>).options
      : [];

  const devices = (form.devices ?? []) as string[];
  const pages = (form.pages ?? []) as string[];

  function toggleList(key: string, value: string, list: string[]) {
    set(key, list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function handleSubmit() {
    const msg = validateForm(fields, form);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    onSubmit(form);
  }

  const titlePair = pair(form, 'title');
  const buttonPair = pair(form, 'buttonLabel');

  const saveButton = (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={busy}
      className="btn-primary disabled:opacity-60"
    >
      {busy ? '저장 중…' : '저장'}
    </button>
  );

  return (
    <div className="rounded-[2px] border border-surface-border bg-surface">
      {/* 상단 바 — 제목 + 취소·저장 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
        <h3 className="m-0 text-base font-bold text-content">
          {isEdit ? '팝업 편집' : '새 팝업'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary disabled:opacity-60"
          >
            취소
          </button>
          {saveButton}
        </div>
      </div>

      <div className="px-5 py-2">
        {isEdit && str(form, 'id') !== '' && (
          <p className="pt-3 text-xs text-content-faint">식별자: {str(form, 'id')}</p>
        )}

        {/* 1. 제목 (한/영) */}
        <Row label="제목" hint={field('title')?.hint}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              id="popup-title-ko"
              type="text"
              value={titlePair.ko}
              disabled={busy}
              onChange={(e) => set('title', { ...titlePair, ko: e.target.value })}
              aria-label="제목 (한국어)"
              placeholder="한국어"
              className={fieldClass}
            />
            <div className="flex items-start gap-2">
              <input
                id="popup-title-en"
                type="text"
                value={titlePair.en}
                disabled={busy}
                onChange={(e) => set('title', { ...titlePair, en: e.target.value })}
                aria-label="제목 (English)"
                placeholder="English"
                className={fieldClass}
              />
              <TranslateButton
                source={titlePair.ko}
                onTranslated={(en) => set('title', { ...titlePair, en })}
                disabled={busy}
              />
            </div>
          </div>
        </Row>

        {/* 2. 기간 */}
        <Row label="기간" hint="한국 시간 기준입니다. 종료가 시작보다 빠르면 팝업이 뜨지 않습니다">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={str(form, 'start')}
              disabled={busy}
              onChange={(e) => set('start', e.target.value)}
              aria-label="게재 시작"
              className={`${fieldClass} w-auto min-w-[210px] flex-1`}
            />
            <span aria-hidden="true" className="text-sm text-content-faint">
              ~
            </span>
            <input
              type="datetime-local"
              value={str(form, 'end')}
              disabled={busy}
              onChange={(e) => set('end', e.target.value)}
              aria-label="게재 종료"
              className={`${fieldClass} w-auto min-w-[210px] flex-1`}
            />
          </div>
        </Row>

        {/* 3. 대상 기기 */}
        <Row label="대상 기기" hint={field('devices')?.hint}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {deviceOptions.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 text-sm text-content"
              >
                <input
                  type="checkbox"
                  checked={devices.includes(o.value)}
                  disabled={busy}
                  onChange={() => toggleList('devices', o.value, devices)}
                  className="h-4 w-4 accent-[#003377]"
                />
                {o.label}
              </label>
            ))}
          </div>
        </Row>

        {/* 4. 노출 페이지 */}
        <Row label="노출 페이지">
          <RadioRow
            name="popup-page-mode"
            value={pageMode}
            disabled={busy}
            options={[
              { value: 'home', label: '홈 화면' },
              { value: 'custom', label: '사용자 정의' },
            ]}
            onChange={(v) => {
              setPageMode(v === 'home' ? 'home' : 'custom');
              // '홈 화면'은 값도 홈 하나로 되돌린다. '사용자 정의'로 옮길 때는 지금 고른
              // 값을 그대로 두고 체크리스트만 펼친다(홈만 있으면 홈이 체크된 채로 시작).
              if (v === 'home') set('pages', ['home']);
            }}
          />
          {pageMode === 'custom' && (
            <div className="mt-3 border-l-4 border-yonsei-blue bg-surface-soft px-4 py-3">
              <ul className="m-0 list-none space-y-2 p-0">
                {pageOptions.map((o) => (
                  <li key={o.value}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-content">
                      <input
                        type="checkbox"
                        checked={pages.includes(o.value)}
                        disabled={busy}
                        onChange={() => toggleList('pages', o.value, pages)}
                        className="h-4 w-4 accent-[#003377]"
                      />
                      {o.label}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-content-faint">{field('pages')?.hint}</p>
            </div>
          )}
        </Row>

        {/* 5. 스타일 */}
        {styleField?.kind === 'popupStyle' && (
          <Row label="스타일" hint={styleField.hint}>
            <PopupStylePicker form={form} keys={styleField.keys} setValue={set} />
          </Row>
        )}

        {/* 6. 버튼 설정 */}
        <Row label="버튼 설정">
          <RadioRow
            name="popup-hide-today-button"
            value={form.hideTodayButton === true ? 'show' : 'hide'}
            disabled={busy}
            options={[
              { value: 'show', label: '배너 하단 버튼 표시' },
              { value: 'hide', label: '표시안함' },
            ]}
            onChange={(v) => set('hideTodayButton', v === 'show')}
          />
          <p className="mt-1.5 text-xs text-content-faint">
            팝업 아래쪽의 &ldquo;오늘 하루 보지 않기&rdquo; 버튼입니다.
          </p>
        </Row>

        {/* 7. 우측 상단 닫기 설정 */}
        <Row label="우측 상단 닫기 설정">
          <RadioRow
            name="popup-close-control"
            value={str(form, 'closeControl') || 'close'}
            disabled={busy}
            options={closeOptions}
            onChange={(v) => set('closeControl', v)}
          />
        </Row>

        {/* 8. 이미지 */}
        <Row label="이미지">
          <div className="flex flex-col gap-4 sm:flex-row">
            <PhotoBox
              field={imageField?.kind === 'imageUpload' ? imageField : undefined}
              value={str(form, 'image')}
              onChange={(url) => set('image', url)}
              onUploadImage={onUploadImage}
              disabled={busy}
              caption="PC 사진"
              note={imageField?.hint}
            />
            <PhotoBox
              field={imageMobileField?.kind === 'imageUpload' ? imageMobileField : undefined}
              value={str(form, 'imageMobile')}
              onChange={(url) => set('imageMobile', url)}
              onUploadImage={onUploadImage}
              disabled={busy}
              caption="모바일 사진"
              note="비우면 PC 사진을 씁니다."
            />
          </div>
        </Row>

        {/* 9. 이미지 링크 */}
        <Row label="이미지 링크" htmlFor="popup-link" hint={field('link')?.hint}>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="popup-link"
              type="text"
              value={str(form, 'link')}
              disabled={busy}
              onChange={(e) => set('link', e.target.value)}
              placeholder="https://"
              className={`${fieldClass} w-auto min-w-[260px] flex-1`}
            />
            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-content">
              <input
                type="checkbox"
                checked={form.newTab === true}
                disabled={busy}
                onChange={(e) => set('newTab', e.target.checked)}
                className="h-4 w-4 accent-[#003377]"
              />
              새 창에서 열기
            </label>
          </div>
        </Row>

        {/* 10. 버튼 문구 */}
        <Row label="버튼 문구" hint={field('buttonLabel')?.hint}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={buttonPair.ko}
              disabled={busy}
              onChange={(e) => set('buttonLabel', { ...buttonPair, ko: e.target.value })}
              aria-label="버튼 문구 (한국어)"
              placeholder="자세히 보기"
              className={fieldClass}
            />
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={buttonPair.en}
                disabled={busy}
                onChange={(e) => set('buttonLabel', { ...buttonPair, en: e.target.value })}
                aria-label="버튼 문구 (English)"
                placeholder="Learn more"
                className={fieldClass}
              />
              <TranslateButton
                source={buttonPair.ko}
                onTranslated={(en) => set('buttonLabel', { ...buttonPair, en })}
                disabled={busy}
              />
            </div>
          </div>
        </Row>

        {/* 11. 노출 */}
        <Row label="노출">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              checked={form.enabled === true}
              disabled={busy}
              onChange={(e) => set('enabled', e.target.checked)}
              className="h-4 w-4 accent-[#003377]"
            />
            노출
          </label>
          <p className="mt-1.5 text-xs text-content-faint">
            꺼 두면 게재 기간 안이어도 사이트에 뜨지 않습니다.
          </p>
        </Row>

        {error && (
          <p role="alert" className="pt-2 text-sm font-semibold text-[#b42318]">
            {error}
          </p>
        )}

        <div className="flex justify-end border-t border-surface-border py-4">{saveButton}</div>
      </div>
    </div>
  );
}
