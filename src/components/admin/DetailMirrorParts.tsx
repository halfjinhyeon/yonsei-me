'use client';

// '자세히' 미러 편집기(교수·연구실)가 공유하는 조각.
//
// 미러 편집기의 규칙: **사이트에서 그 값이 놓인 자리에, 그 크기로** 입력을 둔다.
// 그래서 입력은 평소 화면에 녹아 있다가(테두리 투명) 호버에 점선, 포커스에 파란 실선이
// 선다(인라인 표의 .cms-cell 과 같은 조작감). 폼처럼 라벨을 붙이지 않으므로 aria-label
// 은 필수다 — 시각적 맥락(자리)이 곧 라벨인 화면이라 낭독기에는 그 맥락이 없다.
//
// 값은 여기서 직렬화하지 않는다. 편집기가 FormRecord 를 들고 onSubmit 으로 올리면
// 도메인 직렬화는 resources.ts 의 fromForm 한 곳이 책임진다(RecordForm 과 같은 계약).

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** 미러 입력 공통 — 사이트 타이포를 그대로 입고 그 자리에서 고친다 */
export function MirrorInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  disabled,
  invalid,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid ? 'true' : undefined}
      style={style}
      className={cn('cms-mirror', invalid && 'cms-mirror-invalid', className)}
    />
  );
}

/** 미러 select — 직급·연구 분야처럼 값 집합이 정해진 자리 */
export function MirrorSelect({
  value,
  onChange,
  options,
  emptyLabel,
  ariaLabel,
  disabled,
  invalid,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  emptyLabel: string;
  ariaLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid ? 'true' : undefined}
      className={cn('cms-mirror cursor-pointer', invalid && 'cms-mirror-invalid', className)}
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 미러 여러 줄 입력 — 내용에 맞춰 높이가 자란다(셀 안 스크롤 금지) */
export function MirrorTextArea({
  value,
  onChange,
  ariaLabel,
  placeholder,
  disabled,
  minRows = 6,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        'cms-mirror resize-none overflow-hidden border-surface-border bg-surface leading-[1.8]',
        className,
      )}
    />
  );
}

/** 구역 머리 — 파란 소문자 러닝헤드 + 설명. "이 값이 사이트 어디에 나오는지"를 말한다 */
export function MirrorSectionHead({ eyebrow, note }: { eyebrow: string; note: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-yonsei-blue">
        {eyebrow}
      </p>
      <p className="text-xs text-content-faint">{note}</p>
    </div>
  );
}

/** 사이트가 자동으로 채우거나 여기서 못 고치는 값임을 밝히는 꼬리표 */
export function LockedTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 text-[10px] font-bold text-content-faint">{children}</span>
  );
}

/** AI 연구요약 토글 버튼 — 사이트의 그 버튼 모습 그대로(그라데이션은 이 버튼만의 예외) */
export function AiSummaryButton({
  onClick,
  open,
  size = 'lg',
  disabled,
}: {
  onClick: () => void;
  open: boolean;
  size?: 'lg' | 'sm';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      className={cn(
        'inline-flex items-center gap-2 border-0 font-semibold text-white transition-opacity disabled:opacity-50',
        'bg-[linear-gradient(135deg,#003377,#0057A8_55%,#2E86D6)]',
        size === 'lg' ? 'px-5 py-2.5 text-[13px]' : 'px-4 py-2 text-xs',
      )}
    >
      <span aria-hidden="true" className="relative inline-flex h-[18px] w-[18px]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-full w-full">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" strokeLinecap="round" />
        </svg>
        <svg viewBox="0 0 24 24" fill="currentColor" className="ai-sparkle absolute -right-1.5 -top-1.5 h-2.5 w-2.5">
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="ai-sparkle ai-sparkle-delay absolute -bottom-1 -left-1.5 h-1.5 w-1.5"
        >
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
        </svg>
      </span>
      AI 연구요약
      <span aria-hidden="true" className="text-[10px]">
        {open ? '▴' : '▾'}
      </span>
    </button>
  );
}

/** 사진·이미지 한 칸 — 실제 표시 비율 그대로 미리보고 그 아래에서 교체를 끝낸다.
 *  업로드 통로는 RecordForm 과 같은 onUploadImage 하나다(히어로·동아리 편집기와 동일). */
export function MirrorPhoto({
  src,
  onChange,
  onUploadImage,
  folder,
  disabled,
  ariaLabel,
  replaceLabel,
  emptyTitle,
  emptyHint,
  /** 프레임 비율 — 사이트에서 이 사진이 잘리는 비율 그대로 */
  frameClassName,
  note,
}: {
  src: string;
  onChange: (url: string) => void;
  onUploadImage?: (file: File, opts?: { maxDim?: number; folder?: string }) => Promise<string>;
  folder: string;
  disabled?: boolean;
  ariaLabel: string;
  replaceLabel: string;
  emptyTitle: string;
  emptyHint: string;
  frameClassName: string;
  note: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(0);
  const has = src.trim() !== '';

  async function upload(file: File) {
    setError(null);
    if (!onUploadImage) {
      setError('업로드를 사용할 수 없습니다.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('5MB 이하 이미지만 올릴 수 있습니다.');
      return;
    }
    setUploading(true);
    try {
      const url = await onUploadImage(file, { folder });
      onChange(url);
      setBust((b) => b + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-w-0">
      <div
        className={cn(
          'relative w-full overflow-hidden border bg-[#eef1f5] transition-colors',
          frameClassName,
          dragOver ? 'border-yonsei-blue' : 'border-transparent',
        )}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('image/')) void upload(f);
        }}
      >
        {has ? (
          // 관리자 화면이라 최적화보다 즉시 반영이 중요 — next/image 대신 일반 img.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${src}${bust ? `?v=${bust}` : ''}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1.5 border border-dashed border-[#9fb3c8] p-4 text-center">
            <span className="text-xs font-bold text-content-faint">{emptyTitle}</span>
            <span className="font-mono text-[10px] leading-relaxed text-[#a8b0ba]">{emptyHint}</span>
          </span>
        )}

        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 px-4">
            <span className="text-xs font-bold text-yonsei-navy">올리는 중…</span>
            <span className="block h-1 w-full max-w-[140px] bg-surface-border">
              <span className="block h-full w-1/3 animate-pulse bg-yonsei-blue" />
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
        aria-label={ariaLabel}
        className="mt-2 block w-full border border-surface-border bg-surface px-2 py-2 text-xs font-semibold text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:opacity-50"
      >
        {replaceLabel}
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-content-faint">{note}</p>
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

/** 저장·취소 — RecordForm 과 같은 자리·같은 문구(저장 규칙도 그대로 상위가 쥔다) */
export function MirrorActions({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="btn-primary disabled:opacity-60"
      >
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
  );
}
