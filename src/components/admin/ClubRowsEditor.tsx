'use client';

// 동아리 — 가로 카드 목록.
//
// 동아리는 항목이 적고(한 자릿수) 카드 문구가 길어서, 세로 그리드보다 가로로 넓게
// 펼치는 편이 문구를 그 자리에서 다듬기 좋다.
//
// ⚠️ 상세 카드뉴스(마크다운)는 여기서 펼치지 않는다. 그 본문은 content/pages/club-*.md
// 라는 **별도 파일**이라 커밋 묶음이 JSON 과 다르고, 지금 변경 트레이는 "한 리소스의
// 한 파일"을 한 번에 커밋하는 구조다. 목록에서 마크다운까지 대기시키면 저장 한 번에
// 커밋이 둘 나가고 두 번째가 sha 충돌로 실패한다. 그래서 마크다운은 기존 '자세히'
// 경로(RecordForm + linkedMarkdown + ClubCardsEditor 구조 편집기)를 그대로 쓴다.

import { cn } from '@/lib/utils';
import { cellText } from '@/lib/admin/resources';
import { formInlineValue } from '@/lib/admin/inline';
import { DirtyBar, InlineText, InlineToolbar, MoveButtons, type InlineEditorProps } from './InlineFields';

export function ClubRowsEditor({
  resource,
  rows,
  total,
  busy,
  locked,
  orderLocked,
  orderable,
  dirtyIndices,
  search,
  onSearch,
  onEditDetail,
  onDelete,
  onMove,
  onPatch,
}: InlineEditorProps) {
  const disabled = busy || locked;
  const teaserField = resource.fields.find((f) => f.key === 'teaser');

  return (
    <div>
      <InlineToolbar
        search={search}
        onSearch={onSearch}
        placeholder="이름 · slug · 카드 문구 검색"
        shown={rows.length}
        total={total}
        unit="개"
      />

      {rows.length === 0 ? (
        <p className="border border-dashed border-surface-border bg-[#fcfdfe] px-6 py-16 text-center text-sm text-content-faint">
          조건에 맞는 동아리가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map(({ index, form }) => {
            const dirty = dirtyIndices.has(index);
            const slug = cellText(form, 'slug');
            const images = Array.isArray(form.images) ? form.images.length : 0;
            return (
              <li
                key={index}
                className={cn(
                  'relative border border-surface-border bg-surface transition-colors duration-200 ease-out-expo hover:border-yonsei-blue',
                  dirty && 'bg-yonsei-blue/[0.04]',
                )}
              >
                {dirty && <DirtyBar />}
                <div className="grid sm:grid-cols-[200px_minmax(0,1fr)]">
                  {/* 사진 — 개수만 보여주고 관리는 '자세히'(imageList 편집기)로 넘긴다 */}
                  <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 bg-[#eef1f5] px-3 py-5">
                    {images > 0 && Array.isArray(form.images) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(form.images[0])}
                        alt=""
                        className="h-[86px] w-full max-w-[168px] object-cover"
                      />
                    ) : (
                      <span className="text-xs text-[#a8b0ba]">대표 이미지 없음</span>
                    )}
                    <span className="bg-white/80 px-2 py-0.5 text-[11px] font-bold tabular-nums text-yonsei-navy">
                      사진 {images}장
                    </span>
                  </div>

                  <div className="min-w-0 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <InlineText
                        value={String(formInlineValue(resource.fields, form, 'name'))}
                        onChange={(v) => onPatch(index, 'name', v)}
                        disabled={disabled}
                        ariaLabel="이름"
                        className="w-auto min-w-[200px] flex-1 py-1 text-[18px] font-bold tracking-tight"
                      />
                      <span className="text-[11px] tabular-nums text-content-faint">/{slug}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {orderable && (
                          <MoveButtons
                            index={index}
                            total={total}
                            disabled={busy || orderLocked}
                            onMove={onMove}
                          />
                        )}
                        {dirty && (
                          <span className="text-[11px] font-bold text-yonsei-blue">수정됨</span>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(index)}
                          disabled={disabled}
                          className="text-xs font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
                        >
                          삭제
                        </button>
                      </span>
                    </div>

                    <label className="mt-3 block">
                      <span className="mb-1.5 block text-[11px] font-bold text-content-faint">
                        {teaserField?.label ?? '카드 소개 문구'} (한 문장)
                      </span>
                      <textarea
                        rows={2}
                        value={String(formInlineValue(resource.fields, form, 'teaser'))}
                        onChange={(e) => onPatch(index, 'teaser', e.target.value)}
                        disabled={disabled}
                        className="cms-input-sm resize-y leading-[1.75]"
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onEditDetail(index)}
                        disabled={disabled}
                        className="cms-btn cms-btn-sm"
                      >
                        상세 마크다운 · 사진 편집
                      </button>
                      <span className="text-xs text-content-faint">
                        상세 카드뉴스 본문 · content/pages/club-{slug}.md (별도 파일이라 자세히
                        화면에서 저장합니다)
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
