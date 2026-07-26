'use client';

// 인라인 편집 화면(표·카드·행 펼침·타임라인)이 공유하는 조각.
//
// 화면마다 입력의 겉모습과 aria 규칙을 따로 적으면 리소스를 옮길 때마다 조작감이
// 미묘하게 달라진다. 그래서 "셀 하나를 고치는 일"의 모양을 여기서 한 번만 정하고,
// 각 화면은 배치(표인가 카드인가)만 책임진다.
//
// 값은 어디서도 여기서 직렬화하지 않는다 — onPatch 로 경로와 값을 그대로 올리고,
// 저장 규칙은 lib/admin/inline.ts 한 곳이 정한다.

import { cn } from '@/lib/utils';
import type { InlineValue } from '@/lib/admin/inline';
import type { FormRecord, ResourceDef, SelectOption } from '@/lib/admin/resources';

/** 인라인 편집 화면 공통 입력 */
export interface InlineEditorProps {
  resource: ResourceDef;
  /** 검색까지 걸러진 표시 대상 (index = 원본 배열 위치, form = 대기 편집이 얹힌 값) */
  rows: { index: number; form: FormRecord }[];
  /** 원본 전체 항목 수 — 순서 이동 한계 판정과 "총 n개" 표기 */
  total: number;
  busy: boolean;
  /** 순서 변경 중이면 값 편집을 잠근다 */
  locked: boolean;
  /**
   * 반대 방향 잠금 — 대기 중인 값 편집이 있으면 순서 이동을 잠근다.
   * 값 편집은 배열 인덱스를 키로 들고 있어서, 저장 전에 순서가 바뀌면 그 편집이
   * 어느 항목의 것인지 특정할 수 없다(남의 값을 덮어쓸 위험).
   */
  orderLocked: boolean;
  orderable: boolean;
  /** 저장 대기 중인 편집이 있는 원본 인덱스 — 좌측 파란 막대 표시용 */
  dirtyIndices: Set<number>;
  /**
   * 비워 버린 필수 칸 — 'index:path' 키 (예: '3:name', '7:role.ko').
   * 화면은 해당 셀에 위험색 테두리만 얹는다. 저장을 잠그는 판단은 CollectionEditor 가
   * blockReason 으로 트레이에 올린다(화면마다 저장 규칙이 갈리면 안 된다).
   */
  invalidPaths: Set<string>;
  search: string;
  onSearch: (v: string) => void;
  onEditDetail: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  /** path = 'email' 또는 localized 의 한쪽 'role.ko' */
  onPatch: (index: number, path: string, value: InlineValue) => void;
}

/** 수정 대기 중인 행·카드의 배경 — 좌측 막대는 표/카드가 각자 그린다 */
export const DIRTY_SURFACE = 'bg-yonsei-blue/[0.04]';

/** 카드처럼 position:relative 를 가진 컨테이너 안에 놓는 좌측 2px 막대 */
export function DirtyBar() {
  return <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-yonsei-blue" />;
}

/** 연구 분야 배지 색 — 시안 그대로(금색 아님). 값이 없으면 회색 */
const FIELD_BADGE: Record<string, string> = {
  bioNano: '#0F766E',
  thermoFluid: '#B45309',
  dynamicsControl: '#4338CA',
  manufacturingDesign: '#A21CAF',
  computation: '#0057A8',
  mechanicsMaterials: '#166534',
};

function fieldBadgeColor(value: string): string {
  return FIELD_BADGE[value] ?? '#6E6E6E';
}

/** 분야 배지 — 카드 상단의 작은 색 라벨 */
export function FieldBadge({ value, label }: { value: string; label: string }) {
  if (!label) return null;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white"
      style={{ background: fieldBadgeColor(value) }}
    >
      {label}
    </span>
  );
}

/** 목록 상단 필터 칩 */
export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs transition-colors duration-200 ease-out-expo',
        active
          ? 'border-yonsei-navy bg-yonsei-navy font-bold text-white'
          : 'border-surface-border bg-surface font-semibold text-content-soft hover:border-yonsei-blue hover:text-yonsei-blue',
      )}
    >
      <span>{children}</span>
      {count !== undefined && <span className="tabular-nums opacity-60">{count}</span>}
    </button>
  );
}

/** 검색 + 필터 칩 + 우측 건수 — 모든 인라인 화면이 같은 줄을 쓴다 */
export function InlineToolbar({
  search,
  onSearch,
  placeholder,
  children,
  shown,
  total,
  unit,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  children?: React.ReactNode;
  shown: number;
  total: number;
  unit: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="검색"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        className="cms-input-sm w-full sm:w-[250px]"
      />
      {children}
      <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-content-faint">
        {shown}
        {unit} · 총 {total}
        {unit}
      </span>
    </div>
  );
}

/**
 * 필수인데 비어 버린 셀의 표시.
 *
 * ⚠️ 저장을 막되 입력을 되돌리지는 않는다 — 사용자가 지운 이유가 있을 수 있고,
 * 값을 강제로 복원하면 무엇이 원래 값이었는지 더 헷갈린다. 그래서 화면은 "여기가
 * 비었다"만 말하고, 다시 채우는 일은 사용자에게 남긴다.
 *
 * `.cms-cell` 은 components 레이어라 utilities 레이어인 아래 클래스가 이긴다
 * (평상시 border-transparent, 포커스 시 파란 테두리를 모두 덮는다).
 */
const INVALID_CELL = 'border-[#b42318] bg-[#b42318]/[0.04] focus:border-[#b42318]';

/** 인라인 텍스트 셀 — 평소엔 표에 녹아 있다가 포커스에서 파란 테두리가 선다 */
export function InlineText({
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
  className,
  numeric,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  numeric?: boolean;
  /** 필수인데 비었다 — 위험색 테두리 + aria-invalid */
  invalid?: boolean;
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
      className={cn('cms-cell', numeric && 'tabular-nums', className, invalid && INVALID_CELL)}
    />
  );
}

/** 인라인 select 셀 — 옵션은 FieldDef 에서 그대로 온다 */
export function InlineSelect({
  value,
  options,
  emptyOptionLabel,
  onChange,
  disabled,
  ariaLabel,
  className,
  invalid,
}: {
  value: string;
  options: SelectOption[];
  emptyOptionLabel?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  /** 필수인데 "없음"으로 비웠다 — 위험색 테두리 + aria-invalid */
  invalid?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid ? 'true' : undefined}
      className={cn('cms-cell cursor-pointer', className, invalid && INVALID_CELL)}
    >
      {emptyOptionLabel !== undefined && <option value="">{emptyOptionLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 라벨 – 값 한 줄 (카드 안의 이메일·전화 등) */
export function InlineRow({
  label,
  labelWidth = '58px',
  children,
}: {
  label: string;
  labelWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid items-center gap-1.5"
      style={{ gridTemplateColumns: `${labelWidth} minmax(0,1fr)` }}
    >
      <span className="pl-1 text-[11px] font-semibold text-content-faint">{label}</span>
      {children}
    </div>
  );
}

/** 카드 하단 바 — 수정됨 배지 / 자세히 / 삭제 */
export function CardFootBar({
  dirty,
  left,
  onDetail,
  onDelete,
  detailLabel = '자세히',
  disabled,
  className,
}: {
  dirty: boolean;
  left?: React.ReactNode;
  onDetail: () => void;
  onDelete: () => void;
  detailLabel?: string;
  disabled?: boolean;
  /** 카드 안쪽 열에 놓을 때는 전폭 면·좌우 패딩을 걷어내야 한다(교수진 가로 카드) */
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-auto flex items-center justify-between gap-2 border-t border-[#f1f4f8] bg-[#fcfdfe] px-3 py-2.5',
        className,
      )}
    >
      {left ?? (
        <span
          className={cn(
            'text-[11px] font-bold',
            dirty ? 'text-yonsei-blue' : 'text-transparent',
          )}
        >
          {dirty ? '수정됨' : '·'}
        </span>
      )}
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onDetail}
          disabled={disabled}
          className="text-xs font-semibold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:opacity-40"
        >
          {detailLabel}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="text-xs font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
        >
          삭제
        </button>
      </span>
    </div>
  );
}

/** 순서 ▲▼ — 표·카드가 같은 모양을 쓴다 */
export function MoveButtons({
  index,
  total,
  disabled,
  onMove,
}: {
  index: number;
  total: number;
  disabled: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="위로"
        title="위로"
        onClick={() => onMove(index, -1)}
        disabled={disabled || index === 0}
        className="px-1 py-0.5 text-[11px] text-content-faint transition-colors hover:text-yonsei-blue disabled:opacity-30"
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="아래로"
        title="아래로"
        onClick={() => onMove(index, 1)}
        disabled={disabled || index === total - 1}
        className="px-1 py-0.5 text-[11px] text-content-faint transition-colors hover:text-yonsei-blue disabled:opacity-30"
      >
        ▼
      </button>
    </>
  );
}
