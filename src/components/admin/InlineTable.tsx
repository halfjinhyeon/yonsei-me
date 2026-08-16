'use client';

// 표 셀을 그 자리에서 고치는 목록 — 학부/대학원 교과목, 교직원, 장학금.
//
// 이들 리소스는 값이 짧고 항목이 많아, 카드로 펼치면 한 화면에 몇 개 못 담는다.
// 그래서 표 모양을 유지하되 셀 자체를 입력으로 만든다("보면서 그 자리에서 고친다").
// Tab 으로 옆 칸까지 이어서 고칠 수 있는 게 표 모드의 핵심 이점이다.
//
// 한·영 쌍(localized)은 열을 둘로 쪼개지 않고 한 셀에 위아래로 겹친다 — 담당/이름/
// 위치가 각각 두 열이 되면 교직원 표가 10열이 되어 가로 스크롤 없이는 못 읽는다.

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { cellText, type FieldDef, type FormRecord } from '@/lib/admin/resources';
import { formInlineValue } from '@/lib/admin/inline';
import {
  DIRTY_SURFACE,
  FilterChip,
  InlineSelect,
  InlineText,
  InlineTextArea,
  InlineToolbar,
  MoveButtons,
  type InlineEditorProps,
} from './InlineFields';
import { CmsEmptyState } from './CmsEmptyState';

/** 열 폭 — 값의 성격에 맞춘 고정폭. 여기 없는 키는 남은 폭을 나눠 갖는다(교과목명 등) */
const COLUMN_WIDTH: Record<string, number> = {
  year: 64,
  semester: 56,
  // select 두 개는 옵션 라벨이 길다("대교 (대학교양)", "기초·공통 (분야 없음)") —
  // 좁게 두면 드롭다운 화살표가 글자를 덮는다.
  kind: 150,
  code: 112,
  credits: 60,
  hours: 92,
  field: 190,
  role: 190,
  phone: 150,
  location: 200,
  // 장학금 — 추천기준(criteria)만 폭을 정하지 않아 남은 폭을 전부 가져간다(가장 긴 열)
  section: 128,
  timing: 128,
  count: 132,
  amount: 220,
};

/** 폭을 정하지 않은 열이 가져갈 최소 폭 — 이 값이 크면 4열짜리 표에도 가로 스크롤이 생긴다 */
const FLEX_MIN_WIDTH = 190;

interface Props extends InlineEditorProps {
  inlineKeys: string[];
  filterKeys?: string[];
}

export function InlineTable({
  resource,
  rows,
  total,
  busy,
  locked,
  orderLocked,
  orderable,
  dirtyIndices,
  invalidPaths,
  search,
  onSearch,
  onEditDetail,
  onDelete,
  onMove,
  onPatch,
  inlineKeys,
  filterKeys,
}: Props) {
  // 필터 값은 데이터에서 뽑는다 — 표기가 바뀌어도 칩이 따라간다
  const [filters, setFilters] = useState<Record<string, string>>({});

  /** 0건 안내의 "초기화" — 검색어와 칩을 함께 비운다. 둘 중 하나만 지우면 화면은
   *  여전히 0건이고, 사용자는 무엇이 더 남았는지 알 수 없다. */
  function resetQuery() {
    onSearch('');
    setFilters({});
  }
  const filtered = Object.values(filters).some((v) => v);

  const columns = useMemo(
    () =>
      inlineKeys
        .map((key) => resource.fields.find((f) => f.key === key))
        .filter((f): f is FieldDef => Boolean(f)),
    [inlineKeys, resource.fields],
  );

  const filterDefs = useMemo(
    () =>
      (filterKeys ?? [])
        .map((key) => resource.fields.find((f) => f.key === key))
        .filter((f): f is FieldDef => Boolean(f)),
    [filterKeys, resource.fields],
  );

  /** 칩 후보 — select 면 옵션 순서를, 아니면 등장 순서를 따른다 */
  const chipsOf = (field: FieldDef): { value: string; label: string }[] => {
    if (field.kind === 'select') {
      return field.options.map((o) => ({ value: o.value, label: o.label }));
    }
    const seen: string[] = [];
    for (const r of rows) {
      const v = cellText(r.form, field.key).trim();
      if (v && !seen.includes(v)) seen.push(v);
    }
    return seen.sort().map((v) => ({ value: v, label: v }));
  };

  const visible = rows.filter((r) =>
    filterDefs.every((f) => {
      const want = filters[f.key];
      if (!want) return true;
      return cellText(r.form, f.key).trim() === want;
    }),
  );

  const minWidth =
    columns.reduce((sum, f) => sum + (COLUMN_WIDTH[f.key] ?? FLEX_MIN_WIDTH), 0) + 110;
  const cellDisabled = busy || locked;

  return (
    <div>
      <InlineToolbar
        search={search}
        onSearch={onSearch}
        placeholder={`${resource.searchKeys.map((k) => labelFor(resource.fields, k)).join(' · ')} 검색`}
        shown={visible.length}
        total={total}
        unit="개"
      >
        {filterDefs.map((f) => {
          const chips = chipsOf(f);
          if (chips.length < 2) return null;
          return (
            <span key={f.key} className="flex flex-wrap items-center gap-1.5">
              <span className="ml-1 mr-0.5 text-[11px] font-bold tracking-wide text-content-faint">
                {f.label}
              </span>
              <FilterChip
                active={!filters[f.key]}
                onClick={() => setFilters((p) => ({ ...p, [f.key]: '' }))}
              >
                전체
              </FilterChip>
              {chips.map((c) => {
                const n = rows.filter((r) => cellText(r.form, f.key).trim() === c.value).length;
                if (n === 0) return null;
                return (
                  <FilterChip
                    key={c.value}
                    active={filters[f.key] === c.value}
                    count={n}
                    onClick={() =>
                      setFilters((p) => ({ ...p, [f.key]: p[f.key] === c.value ? '' : c.value }))
                    }
                  >
                    {c.label}
                  </FilterChip>
                );
              })}
            </span>
          );
        })}
      </InlineToolbar>

      {visible.length === 0 ? (
        <CmsEmptyState
          variant="search"
          compact
          title={
            search.trim() !== ''
              ? `‘${search.trim()}’ 에 해당하는 항목이 없습니다`
              : '선택한 조건에 해당하는 항목이 없습니다'
          }
          body={
            filtered && search.trim() !== ''
              ? '검색어를 지우거나 다른 조건을 골라 보세요.'
              : search.trim() !== ''
                ? '검색어의 일부만 남겨 보세요.'
                : '위 칩에서 다른 조건을 골라 보세요.'
          }
          actionLabel="검색 초기화"
          onAction={resetQuery}
        />
      ) : (
        // 네이비 2px 룰은 헤더 "위" — 사이트 본문 표와 같은 문법이다.
        // 전역 Lenis 부드러운 스크롤이 휠을 가로채면 표 안쪽이 스크롤되지 않는다.
        <div className="overflow-x-auto border-t-2 border-yonsei-navy" data-lenis-prevent>
          <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
            <thead>
              <tr>
                {columns.map((f) => (
                  <th
                    key={f.key}
                    scope="col"
                    style={{ width: COLUMN_WIDTH[f.key] }}
                    className="border-b border-surface-border px-2 py-3 text-left text-xs font-bold text-content-faint"
                  >
                    {f.kind === 'localized' ? `${f.label} (한국어 / English)` : f.label}
                  </th>
                ))}
                <th scope="col" className="border-b border-surface-border px-2 py-3" style={{ width: 110 }}>
                  <span className="sr-only">동작</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ index, form }) => {
                const dirty = dirtyIndices.has(index);
                return (
                  <tr key={index} className={cn(dirty && DIRTY_SURFACE)}>
                    {columns.map((f, col) => (
                      <td
                        key={f.key}
                        className={cn(
                          'border-b border-[#f1f4f8] p-0 align-top',
                          // 좌측 파란 막대 — 첫 열에만. 평상시에도 같은 두께를 비워
                          // 두어야 수정 표시가 붙을 때 표가 흔들리지 않는다
                          col === 0 && 'border-l-2',
                          col === 0 && (dirty ? 'border-l-yonsei-blue' : 'border-l-transparent'),
                        )}
                      >
                        <Cell
                          field={f}
                          form={form}
                          index={index}
                          disabled={cellDisabled}
                          bold={col === 0 || f.key === 'code' || f.key === 'name'}
                          invalidPaths={invalidPaths}
                          onPatch={onPatch}
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap border-b border-[#f1f4f8] px-2 py-1.5 text-right align-middle">
                      {orderable && (
                        <MoveButtons
                          index={index}
                          total={total}
                          disabled={busy || orderLocked}
                          onMove={onMove}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onEditDetail(index)}
                        disabled={cellDisabled}
                        className="px-1.5 text-[11px] font-semibold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:opacity-40"
                      >
                        자세히
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(index)}
                        disabled={cellDisabled}
                        title="삭제"
                        aria-label="삭제"
                        className="px-1 text-xs font-bold text-[#b42318] transition-opacity hover:opacity-70 disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-content-faint">
        셀을 클릭해 바로 고칩니다. Tab 으로 다음 칸으로 넘어가고, 고친 행은 왼쪽에 파란 표시가
        붙어 아래 트레이에 모입니다.
      </p>
    </div>
  );
}

/** 한 셀 — localized 는 한·영 두 줄, select 는 드롭다운, 나머지는 텍스트 */
function Cell({
  field,
  form,
  index,
  disabled,
  bold,
  invalidPaths,
  onPatch,
}: {
  field: FieldDef;
  form: FormRecord;
  index: number;
  disabled: boolean;
  bold: boolean;
  invalidPaths: Set<string>;
  onPatch: (index: number, path: string, value: string) => void;
}) {
  const numeric = field.key === 'phone' || field.key === 'code' || field.key === 'credits';
  const isInvalid = (path: string) => invalidPaths.has(`${index}:${path}`);

  if (field.kind === 'localized') {
    return (
      <div className="px-0.5 py-1">
        {/* 위험색은 한국어 칸에만 — 영문은 비어도 localizedValue 가 한국어를 복사한다 */}
        <InlineText
          value={String(formInlineValue([field], form, `${field.key}.ko`))}
          onChange={(v) => onPatch(index, `${field.key}.ko`, v)}
          disabled={disabled}
          ariaLabel={`${field.label} (한국어)`}
          invalid={isInvalid(`${field.key}.ko`)}
          className={cn('py-1', bold && 'font-bold')}
        />
        <InlineText
          value={String(formInlineValue([field], form, `${field.key}.en`))}
          onChange={(v) => onPatch(index, `${field.key}.en`, v)}
          disabled={disabled}
          placeholder="English"
          ariaLabel={`${field.label} (English)`}
          className="py-1 text-[11px] text-content-faint"
        />
      </div>
    );
  }

  if (field.kind === 'select') {
    return (
      <InlineSelect
        value={String(formInlineValue([field], form, field.key))}
        options={field.options}
        emptyOptionLabel={field.emptyAs ? (field.emptyOptionLabel ?? '없음') : undefined}
        onChange={(v) => onPatch(index, field.key, v)}
        disabled={disabled}
        ariaLabel={field.label}
        invalid={isInvalid(field.key)}
        className="py-2.5"
      />
    );
  }

  // 여러 줄 셀(장학금 추천기준·장학금액) — 줄바꿈이 사이트에서도 줄바꿈으로 표시된다
  if (field.kind === 'textarea') {
    return (
      <InlineTextArea
        value={String(formInlineValue([field], form, field.key))}
        onChange={(v) => onPatch(index, field.key, v)}
        disabled={disabled}
        placeholder={field.placeholder}
        ariaLabel={field.label}
        invalid={isInvalid(field.key)}
        className="py-3"
      />
    );
  }

  return (
    <InlineText
      value={String(formInlineValue([field], form, field.key))}
      onChange={(v) => onPatch(index, field.key, v)}
      disabled={disabled}
      placeholder={field.placeholder}
      ariaLabel={field.label}
      numeric={numeric}
      invalid={isInvalid(field.key)}
      className={cn('py-3', bold && 'font-semibold')}
    />
  );
}

function labelFor(fields: FieldDef[], key: string): string {
  return fields.find((f) => f.key === key)?.label ?? key;
}
