'use client';

// 행을 펼쳐 긴 텍스트를 고치는 목록 — 교과목 설명.
//
// 과목 설명은 2~4문장이라 표 셀에 담기지 않는다. 그렇다고 폼 화면으로 왕복하면
// "다음 과목 설명"을 이어서 채우는 흐름이 끊긴다. 그래서 요약 행을 눌러 그 자리에서
// 아래로 펼치고, 다 고치면 접는다. 여러 행을 동시에 펼쳐 둘 수 있다(비교하며 쓰기).
//
// 학정번호(code)는 학부 교과목과의 연결 키라 읽기 전용이다 — 여기서 고치면 체계도의
// 링크가 조용히 끊긴다. 바꿔야 하면 '자세히' 폼에서 항목을 새로 만드는 게 맞다.

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { cellText, type FieldDef } from '@/lib/admin/resources';
import { formInlineValue } from '@/lib/admin/inline';
import { DIRTY_SURFACE, InlineToolbar, type InlineEditorProps } from './InlineFields';

interface Props extends InlineEditorProps {
  summaryKeys: string[];
  expandKeys: string[];
}

export function ExpandRowsEditor({
  resource,
  rows,
  total,
  busy,
  locked,
  dirtyIndices,
  search,
  onSearch,
  onEditDetail,
  onDelete,
  onPatch,
  summaryKeys,
  expandKeys,
}: Props) {
  const [open, setOpen] = useState<number[]>([]);
  const disabled = busy || locked;

  const expandFields = expandKeys
    .map((k) => resource.fields.find((f) => f.key === k))
    .filter((f): f is FieldDef => Boolean(f));

  return (
    <div>
      <InlineToolbar
        search={search}
        onSearch={onSearch}
        placeholder="학정번호 · 영문 과목명 · 설명 검색"
        shown={rows.length}
        total={total}
        unit="개"
      />

      {rows.length === 0 ? (
        <p className="border border-dashed border-surface-border bg-[#fcfdfe] px-6 py-16 text-center text-sm text-content-faint">
          조건에 맞는 항목이 없습니다.
        </p>
      ) : (
        // 목록 첫 행 위에 네이비 2px 룰 (표 헤더와 같은 문법)
        <div className="border-t-2 border-yonsei-navy">
          {rows.map(({ index, form }) => {
            const expanded = open.includes(index);
            const dirty = dirtyIndices.has(index);
            const code = cellText(form, summaryKeys[0] ?? 'code');
            const desc = cellText(form, 'desc').trim();
            const panelId = `desc-panel-${index}`;
            return (
              <div
                key={index}
                className={cn(
                  'border-b border-surface-border border-l-2',
                  dirty ? `border-l-yonsei-blue ${DIRTY_SURFACE}` : 'border-l-transparent',
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpen((p) => (p.includes(index) ? p.filter((i) => i !== index) : [...p, index]))
                  }
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className="flex w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-soft"
                >
                  <span className="w-[92px] shrink-0 text-[13px] font-bold tabular-nums text-content">
                    {code}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 px-1.5 py-0.5 text-[10px] font-extrabold',
                      desc
                        ? 'bg-[#166534]/10 text-[#166534]'
                        : 'bg-[#b42318]/10 text-[#b42318]',
                    )}
                  >
                    {desc ? '설명 있음' : '설명 없음'}
                  </span>
                  <span className="w-[220px] shrink-0 truncate text-[13px] font-semibold text-content">
                    {cellText(form, summaryKeys[1] ?? 'nameEn')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-content-faint">
                    {desc || '—'}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-yonsei-blue">
                    {expanded ? '접기 ▲' : '펼쳐서 편집 ▼'}
                  </span>
                </button>

                {expanded && (
                  <div id={panelId} className="anim-panel bg-[#fcfdfe] px-4 pb-6 pt-1">
                    <div className="grid max-w-[1100px] gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                          학정번호
                        </span>
                        <input
                          type="text"
                          value={code}
                          readOnly
                          className="w-full border border-surface-border bg-surface-soft px-3 py-2.5 text-[13px] tabular-nums text-content-faint outline-none"
                        />
                        <span className="mt-1.5 block text-[11px] text-content-faint">
                          학정번호는 학부 교과목과의 연결 키라 수정할 수 없습니다.
                        </span>
                      </label>

                      {expandFields
                        .filter((f) => f.kind === 'text')
                        .map((f) => (
                          <label key={f.key} className="block">
                            <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                              {f.label}
                            </span>
                            <input
                              type="text"
                              value={String(formInlineValue([f], form, f.key))}
                              onChange={(e) => onPatch(index, f.key, e.target.value)}
                              disabled={disabled}
                              placeholder={f.placeholder}
                              className="cms-input-sm"
                            />
                          </label>
                        ))}
                    </div>

                    {expandFields
                      .filter((f) => f.kind === 'textarea')
                      .map((f) => (
                        <label key={f.key} className="mt-4 block max-w-[1100px]">
                          <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                            {f.label}
                            {f.required && <span className="ml-1 text-[#b42318]">*</span>}
                          </span>
                          <textarea
                            rows={Math.max(6, f.kind === 'textarea' ? (f.rows ?? 6) : 6)}
                            value={String(formInlineValue([f], form, f.key))}
                            onChange={(e) => onPatch(index, f.key, e.target.value)}
                            disabled={disabled}
                            placeholder="이 과목에서 다루는 내용을 2~4문장으로 적습니다."
                            className="cms-input resize-y leading-[1.8]"
                          />
                        </label>
                      ))}

                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setOpen((p) => p.filter((i) => i !== index))}
                        className="cms-btn cms-btn-primary cms-btn-sm"
                      >
                        편집 마치기
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditDetail(index)}
                        disabled={disabled}
                        className="cms-btn cms-btn-sm"
                      >
                        자세히
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(index)}
                        disabled={disabled}
                        className="cms-btn cms-btn-danger cms-btn-sm"
                      >
                        삭제
                      </button>
                      <span className="text-xs text-content-faint">
                        저장은 아래 트레이에서 한 번에 합니다.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
