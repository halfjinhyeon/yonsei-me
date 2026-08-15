'use client';

// 연혁 — 연월 타임라인.
//
// 표로 두면 "1958-12 / 창설" 두 칸짜리 행이 60개 늘어서서 무엇을 고치는지 눈에
// 들어오지 않는다. 사이트의 연혁 탭이 이미 세로 룰 + 점 타임라인이라, 관리 화면도
// 같은 모양으로 두면 "지금 어느 시점을 고치는 중인지"가 위치로 읽힌다.
//
// 순서 이동 버튼을 두지 않는다 — 사이트가 연월 내림차순으로 자동 정렬하므로
// 배열 순서는 화면에 아무 영향이 없다(resources.ts 의 orderable:false 와 짝).

import { cn } from '@/lib/utils';
import { cellText } from '@/lib/admin/resources';
import { formInlineValue } from '@/lib/admin/inline';
import { DIRTY_SURFACE, InlineText, InlineToolbar, type InlineEditorProps } from './InlineFields';
import { CmsEmptyState } from './CmsEmptyState';

interface Props extends InlineEditorProps {
  dateKey: string;
  bodyKey: string;
}

/** 연월 입력은 cms-cell 을 직접 쓰므로(InlineText 가 아니다) 같은 색을 여기에 둔다 */
const INVALID_CELL = 'border-[#b42318] bg-[#b42318]/[0.04] focus:border-[#b42318]';

export function HistoryTimelineEditor({
  resource,
  rows,
  total,
  busy,
  locked,
  dirtyIndices,
  invalidPaths,
  search,
  onSearch,
  onDelete,
  onPatch,
  dateKey,
  bodyKey,
}: Props) {
  const disabled = busy || locked;
  const dateField = resource.fields.find((f) => f.key === dateKey);
  const bodyField = resource.fields.find((f) => f.key === bodyKey);

  // 요약 수치 — 사이트가 어떻게 정렬해 보여줄지를 관리자에게 미리 알려 준다
  const dates = rows.map((r) => cellText(r.form, dateKey).trim()).filter(Boolean).sort();
  const first = dates[0] ?? '—';
  const last = dates[dates.length - 1] ?? '—';

  return (
    <div>
      <InlineToolbar
        search={search}
        onSearch={onSearch}
        placeholder="연월 · 내용 검색"
        shown={rows.length}
        total={total}
        unit="개"
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative pl-7">
          {/* 세로 룰 — 금색 금지 규칙에 따라 네이비 → 블루 → sky 로 흐른다 */}
          <span
            aria-hidden="true"
            className="absolute bottom-1.5 left-[5px] top-1.5 w-0.5 bg-gradient-to-b from-yonsei-navy via-yonsei-blue to-[#2E86D6]"
          />

          {/* 필터 칩이 없는 화면이라 0건의 원인은 검색어뿐 — 초기화도 검색어만 비운다 */}
          {rows.length === 0 ? (
            <CmsEmptyState
              variant="search"
              compact
              title={
                search.trim() !== ''
                  ? `‘${search.trim()}’ 에 해당하는 항목이 없습니다`
                  : '선택한 조건에 해당하는 항목이 없습니다'
              }
              body="검색어를 지우거나 연월(예: 1958-12)만 남겨 보세요."
              actionLabel="검색 초기화"
              onAction={() => onSearch('')}
            />
          ) : (
            rows.map(({ index, form }) => {
              const dirty = dirtyIndices.has(index);
              return (
                <div
                  key={index}
                  className={cn(
                    'relative border-b border-[#f1f4f8] py-3.5 pl-2',
                    dirty && `border-l-2 border-l-yonsei-blue ${DIRTY_SURFACE}`,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="absolute -left-[26px] top-[22px] h-[11px] w-[11px] border-2 border-yonsei-navy bg-surface"
                  />
                  <div className="flex items-center gap-2.5">
                    <input
                      type="month"
                      value={String(formInlineValue(resource.fields, form, dateKey))}
                      onChange={(e) => onPatch(index, dateKey, e.target.value)}
                      disabled={disabled}
                      aria-label={dateField?.label ?? '연월'}
                      aria-invalid={
                        invalidPaths.has(`${index}:${dateKey}`) ? 'true' : undefined
                      }
                      className={cn(
                        'cms-cell w-[150px] py-1 text-[13px] font-bold tabular-nums text-yonsei-blue',
                        invalidPaths.has(`${index}:${dateKey}`) && INVALID_CELL,
                      )}
                    />
                    {/* 형식 안내를 따로 적지 않는다 — type=month 입력이 이미 자기
                        형식으로 값을 보여줘서 "YYYY-MM" 문구가 오히려 어긋나 보인다 */}
                    {dirty && (
                      <span className="text-[11px] font-bold text-yonsei-blue">수정됨</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(index)}
                      disabled={disabled}
                      className="ml-auto text-xs font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </div>

                  {/* 위험 표시는 한국어 칸에만 — 영문은 비어도 한국어가 폴백된다 */}
                  <InlineText
                    value={String(formInlineValue(resource.fields, form, `${bodyKey}.ko`))}
                    onChange={(v) => onPatch(index, `${bodyKey}.ko`, v)}
                    disabled={disabled}
                    ariaLabel={`${bodyField?.label ?? '내용'} (한국어)`}
                    invalid={invalidPaths.has(`${index}:${bodyKey}.ko`)}
                    className="mt-1 py-1 text-[15px] font-semibold tracking-tight"
                  />
                  <InlineText
                    value={String(formInlineValue(resource.fields, form, `${bodyKey}.en`))}
                    onChange={(v) => onPatch(index, `${bodyKey}.en`, v)}
                    disabled={disabled}
                    placeholder="영문 문구 없음 — 비우면 영문 페이지에 한국어가 노출됩니다"
                    ariaLabel={`${bodyField?.label ?? '내용'} (English)`}
                    className="py-1 text-xs text-content-faint"
                  />
                </div>
              );
            })
          )}
        </div>

        {/* 사이트 헤더(lg:h-20) 아래 1rem 여유 — 콘솔 사이드바와 같은 기준선 */}
        <aside className="border border-surface-border bg-[#fcfdfe] px-5 py-4 lg:sticky lg:top-24">
          <p className="cms-eyebrow">사이트 반영 방식</p>
          <p className="mt-2.5 text-xs leading-[1.8] text-content-soft">
            연월(YYYY-MM) 기준 <strong className="text-content">내림차순</strong>으로 자동
            정렬되므로 입력 순서는 신경 쓰지 않아도 됩니다. 영문 문구를 비우면 영문 페이지에
            한국어가 그대로 노출됩니다.
          </p>
          <p className="mt-3.5 text-xs leading-[1.8] text-content-soft">
            총 <strong className="text-content tabular-nums">{total}</strong>개 · 최초{' '}
            <strong className="text-content tabular-nums">{first}</strong> ~ 최근{' '}
            <strong className="text-content tabular-nums">{last}</strong>
          </p>
        </aside>
      </div>
    </div>
  );
}
