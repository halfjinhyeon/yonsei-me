'use client';

// 연혁 — 연월 타임라인 + 연대 사진.
//
// 표로 두면 "1958-12 / 창설" 두 칸짜리 행이 60개 늘어서서 무엇을 고치는지 눈에
// 들어오지 않는다. 사이트의 연혁 탭이 이미 세로 룰 + 점 타임라인이라, 관리 화면도
// 같은 모양으로 두면 "지금 어느 시점을 고치는 중인지"가 위치로 읽힌다.
//
// 순서 이동 버튼을 두지 않는다 — 사이트가 연월 내림차순으로 자동 정렬하므로
// 배열 순서는 화면에 아무 영향이 없다(resources.ts 의 orderable:false 와 짝).
//
// 연대 사진(2026-08 추가)은 항목이 아니라 **연대**에 붙는 값이라 항목 행이 아니라
// 연대 헤더 행에 슬롯으로 놓인다. 원본도 별도 파일(content/history-images.json)이고,
// 그 로드·대기·저장은 전부 CollectionEditor 가 맡는다(decadeImages props) —
// 이 화면은 "어디에 어떤 모양으로 놓을까"와 업로드 조작만 안다.

import { Fragment, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { cellText, fileNameOf, type FormRecord, type LinkedImageMap } from '@/lib/admin/resources';
import { formInlineValue } from '@/lib/admin/inline';
import type { UploadProgressHandler } from '@/lib/admin/storage';
import { DIRTY_SURFACE, InlineText, InlineToolbar, type InlineEditorProps } from './InlineFields';
import { CmsEmptyState } from './CmsEmptyState';
import { IcoPlus } from './cms-icons';

/** 연대 사진 편집 묶음 — CollectionEditor 가 곁 파일(linkedImageMap)을 다루는 통로 */
export interface DecadeImagesProps {
  /** 업로드 규격(저장 폴더·용량 상한)의 단일 출처 — resources.ts 의 선언 그대로 */
  spec: LinkedImageMap;
  /** 연대(문자열) → 사진 URL. 저장 대기 중인 편집이 이미 얹힌 값이다 */
  values: Record<string, string>;
  /** 저장 대기 중인 연대 — '수정됨' 배지 */
  dirtyKeys: Set<string>;
  /** 즉시 업로드하고 저장할 공개 URL 을 돌려준다 (교수 카드·메인 이미지와 같은 통로) */
  onUpload: (
    file: File,
    opts?: { maxDim?: number; folder?: string; onProgress?: UploadProgressHandler },
  ) => Promise<string>;
  /** 연대 사진 지정. url='' 이면 삭제 — 값은 트레이에 쌓인다(저장 전까지 사이트는 그대로) */
  onPatch: (decade: string, url: string) => void;
}

interface Props extends InlineEditorProps {
  dateKey: string;
  bodyKey: string;
  /** 없으면 연대 헤더만 그리고 사진 슬롯을 두지 않는다 */
  decadeImages: DecadeImagesProps | null;
}

/** 연월 입력은 cms-cell 을 직접 쓰므로(InlineText 가 아니다) 같은 색을 여기에 둔다 */
const INVALID_CELL = 'border-[#b42318] bg-[#b42318]/[0.04] focus:border-[#b42318]';

type Row = { index: number; form: FormRecord };

/** 연월(YYYY-MM)의 연대(10년). 값이 아직 없거나 형식이 어긋나면 빈 문자열 */
function decadeOf(date: string): string {
  if (!/^\d{4}/.test(date)) return '';
  return String(Math.floor(Number(date.slice(0, 4)) / 10) * 10);
}

/**
 * 표시 순서를 그대로 둔 채 연대가 바뀌는 자리만 끊는다 — 정렬하지 않는다.
 * 목록 순서는 파일 순서이고(사이트가 알아서 내림차순으로 뒤집는다), 검색으로 걸러진
 * 목록에서도 "지금 보이는 것" 기준으로 헤더와 건수가 맞아야 하기 때문이다.
 */
function splitByDecade(rows: Row[], dateKey: string): { decade: string; rows: Row[] }[] {
  const runs: { decade: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const decade = decadeOf(cellText(row.form, dateKey).trim());
    const last = runs[runs.length - 1];
    if (last && last.decade === decade) last.rows.push(row);
    else runs.push({ decade, rows: [row] });
  }
  return runs;
}

/**
 * 공개 화면의 좌우 배치 — HistoryTimeline.tsx 의 규칙을 그대로 옮긴 **읽기 전용** 계산.
 * 사이트는 연대를 최근→과거로 훑으며 사진이 있는 연대끼리만 번갈아 놓고, 그중 첫
 * 사진이 오른쪽이다. 그래서 사진을 하나 넣거나 지우면 그 뒤 연대들의 좌우가 통째로
 * 뒤집힌다 — 관리자가 고를 값이 아니라 결과로 보여 줘야 하는 값이라 조작 UI 를 두지
 * 않는다(두면 사이트 계산과 어긋나는 순간 어느 쪽이 참인지 알 수 없어진다).
 */
function decadeSides(values: Record<string, string>): Record<string, 'left' | 'right'> {
  const out: Record<string, 'left' | 'right'> = {};
  Object.keys(values)
    .map(Number)
    .sort((a, b) => b - a)
    .forEach((decade, i) => {
      out[String(decade)] = i % 2 === 0 ? 'right' : 'left';
    });
  return out;
}

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
  decadeImages,
}: Props) {
  const disabled = busy || locked;
  const dateField = resource.fields.find((f) => f.key === dateKey);
  const bodyField = resource.fields.find((f) => f.key === bodyKey);

  // 요약 수치 — 사이트가 어떻게 정렬해 보여줄지를 관리자에게 미리 알려 준다
  const dates = rows.map((r) => cellText(r.form, dateKey).trim()).filter(Boolean).sort();
  const first = dates[0] ?? '—';
  const last = dates[dates.length - 1] ?? '—';

  const runs = useMemo(() => splitByDecade(rows, dateKey), [rows, dateKey]);
  // 사진이 있는 연대 전체를 보고 계산한다 — 검색으로 걸러진 화면에서도 사이트와
  // 같은 좌우가 나와야 한다(사이트는 검색을 모른다).
  const sides = useMemo(
    () => decadeSides(decadeImages?.values ?? {}),
    [decadeImages?.values],
  );

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
            runs.map((run) => (
              <Fragment key={`${run.decade}:${run.rows[0].index}`}>
                {/* 연월이 비어 연대를 모르는 구간(새로 만든 항목)에는 헤더를 두지 않는다 */}
                {run.decade !== '' && (
                  <DecadeHeader
                    decade={run.decade}
                    count={run.rows.length}
                    disabled={disabled}
                    images={decadeImages}
                    side={sides[run.decade] ?? 'right'}
                  />
                )}
                {run.rows.map(({ index, form }) => {
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
                })}
              </Fragment>
            ))
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
          {decadeImages && (
            <p className="mt-3.5 text-xs leading-[1.8] text-content-soft">
              사진을 넣은 연대는 항목이 한쪽으로 정렬되고 반대편에 사진이 놓입니다. 좌우는
              사진 있는 연대끼리 <strong className="text-content">자동으로 번갈아</strong>{' '}
              배치되며(첫 사진은 오른쪽), 사진을 넣거나 지우면 다시 계산됩니다.
            </p>
          )}
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

/** 연대 헤더 행 — 채운 사각 점 + 연대 라벨·건수, 그리고 오른쪽에 그 연대의 사진 슬롯 */
function DecadeHeader({
  decade,
  count,
  disabled,
  images,
  side,
}: {
  decade: string;
  count: number;
  disabled: boolean;
  images: DecadeImagesProps | null;
  side: 'left' | 'right';
}) {
  return (
    <div className="relative border-b border-surface-border pb-4 pl-2 pt-5 md:flex md:items-start md:justify-between md:gap-5">
      {/* 항목 점은 테두리형이라, 채운 사각으로 두면 "구간의 시작"이 눈으로 구분된다 */}
      <span
        aria-hidden="true"
        className="absolute -left-[26px] top-[23px] h-[11px] w-[11px] bg-yonsei-navy"
      />
      <div className="min-w-0">
        <h3 className="text-[13px] font-extrabold leading-none text-yonsei-navy">
          {decade}년대
        </h3>
        <p className="mt-1 text-[11px] tabular-nums text-content-faint">{count}건</p>
      </div>
      {images && (
        <DecadeImageSlot
          decade={decade}
          url={images.values[decade] ?? ''}
          dirty={images.dirtyKeys.has(decade)}
          side={side}
          disabled={disabled}
          spec={images.spec}
          onUpload={images.onUpload}
          onPatch={images.onPatch}
        />
      )}
    </div>
  );
}

/** 슬롯 위에 떠 있는 작은 버튼(교체·삭제) — 데스크톱 hover 컨트롤 */
function SlotButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-[2px] border border-surface-border bg-surface px-[7px] py-[3px] text-[11px] font-bold leading-none transition-colors duration-200 ease-out-expo disabled:opacity-40',
        danger
          ? 'text-[#b42318] hover:border-[#b42318]'
          : 'text-content hover:border-yonsei-blue hover:text-yonsei-blue',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 연대 사진 한 칸.
 *
 * 업로드만 즉시 스토리지로 나간다(이미지 바이너리는 JSON 저장과 별개 경로라 배칭할
 * 수 없다 — 교수 카드·메인 이미지와 같은 사정). 그 결과 URL 은 onPatch 로 변경
 * 트레이에 쌓여 "저장 (커밋)" 한 번에 반영된다.
 */
function DecadeImageSlot({
  decade,
  url,
  dirty,
  side,
  disabled,
  spec,
  onUpload,
  onPatch,
}: {
  decade: string;
  url: string;
  dirty: boolean;
  side: 'left' | 'right';
  disabled: boolean;
  spec: LinkedImageMap;
  onUpload: DecadeImagesProps['onUpload'];
  onPatch: DecadeImagesProps['onPatch'];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // 업로드 직후 같은 경로 이미지를 새로 받기 위한 캐시버스터(교수 카드와 같은 방식)
  const [bust, setBust] = useState(0);

  const has = url.trim() !== '';
  const name = fileNameOf(url);
  const busy = disabled || uploading;

  /** 용량·형식은 업로드를 **시도하기 전에** 막는다 — 10MB 파일을 올려 보고 나서
   *  거절하면 기다린 시간이 통째로 버려진다(스토리지 상한과 별개인 화면 게이트). */
  async function accept(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > spec.maxSizeMB * 1024 * 1024) {
      setError(`${spec.maxSizeMB}MB 이하 이미지만 업로드할 수 있습니다.`);
      return;
    }
    setUploading(true);
    setPercent(0);
    try {
      const uploaded = await onUpload(file, {
        folder: spec.folder,
        maxDim: spec.maxDim,
        onProgress: (p) => {
          if (p.percent !== undefined) setPercent(p.percent);
        },
      });
      onPatch(decade, uploaded);
      setBust((b) => b + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-3 w-full md:mt-0 md:w-[168px] md:flex-none">
      {/* 슬롯 전체가 드롭 존이다 — 사진을 바꾸는 가장 빠른 몸짓이 끌어다 놓기다 */}
      <div
        className={cn(
          'group relative aspect-[4/3] w-full overflow-hidden rounded-[2px] border bg-surface transition-colors duration-200 ease-out-expo',
          has && 'bg-[#eef1f5]',
          error
            ? 'border-solid border-[#b42318]'
            : dragOver
              ? 'border-solid border-yonsei-blue bg-surface-soft'
              : has
                ? 'border-surface-border'
                : 'border-dashed border-surface-border',
        )}
        onDragOver={(e) => {
          if (busy) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy) return;
          const f = e.dataTransfer.files?.[0];
          if (f) void accept(f);
        }}
      >
        {has ? (
          <>
            {/* 관리자 화면이라 최적화보다 즉시 반영이 중요 — next/image 대신 일반 img.
                값이 사이트 내부 경로(/img/history/…)든 업로드 결과 절대 URL 이든 뜬다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${url}${bust ? `?v=${bust}` : ''}`}
              alt=""
              className="h-full w-full object-cover"
            />
            {/* 배치 뱃지 — 읽기 전용. 좌우를 고르는 조작은 두지 않는다(사이트가 정한다) */}
            <span className="absolute left-0 top-0 bg-yonsei-navy px-1.5 py-[3px] text-[10px] font-extrabold leading-none text-white">
              공개 화면: {side === 'right' ? '오른쪽' : '왼쪽'}
            </span>
            {/* 데스크톱은 마우스를 올렸을 때만 — 좁은 화면에는 hover 가 없으므로
                아래 파일명 줄에 같은 조작을 상시 텍스트 버튼으로 둔다 */}
            <span className="absolute right-1.5 top-1.5 hidden gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 md:flex">
              <SlotButton onClick={() => fileRef.current?.click()} disabled={busy}>
                교체
              </SlotButton>
              <SlotButton onClick={() => onPatch(decade, '')} disabled={busy} danger>
                삭제
              </SlotButton>
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={`${decade}년대 사진 추가`}
            className={cn(
              'flex h-full w-full flex-col items-center justify-center gap-1.5 transition-colors duration-200 ease-out-expo disabled:cursor-not-allowed',
              !dragOver && !busy && 'hover:bg-surface-soft',
            )}
          >
            {/* 기본 크기가 18px 이라 크기 지정 없이 색만 바꾼다(cms-icons 규약) */}
            <IcoPlus className={dragOver ? 'text-yonsei-blue' : 'text-content-faint'} />
            <span
              className={cn(
                'text-xs',
                dragOver ? 'font-bold text-yonsei-blue' : 'font-semibold text-content-faint',
              )}
            >
              {dragOver ? '여기에 놓기' : '사진 추가'}
            </span>
          </button>
        )}

        {/* 사진이 이미 있을 때도 놓을 곳임을 알린다 — 테두리 색만으로는 약하다 */}
        {has && dragOver && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-surface-soft/90">
            <IcoPlus className="text-yonsei-blue" />
            <span className="text-xs font-bold text-yonsei-blue">여기에 놓기</span>
          </span>
        )}

        {/* 업로드 중 — 실제 전송 진행률(storage 의 onProgress)을 그대로 그린다 */}
        {uploading && (
          <span className="absolute inset-0 bg-white/[0.72]">
            <span className="absolute inset-x-0 bottom-5 text-center text-[11px] font-bold text-yonsei-navy">
              업로드 중… {percent}%
            </span>
            <span className="absolute bottom-3 left-3 right-3 block h-[3px] bg-surface-border">
              <span
                className="block h-full bg-yonsei-navy transition-[width] duration-200 ease-out-expo"
                style={{ width: `${percent}%` }}
              />
            </span>
          </span>
        )}
      </div>

      {/* 사진이 지워질 예정이면(대기 중 삭제) 파일명 자리는 비지만 '수정됨'은 남아야 한다 */}
      {(has || dirty) && (
        <div className="mt-1.5 flex items-center gap-2">
          <span title={name} className="min-w-0 flex-1 truncate text-[11px] text-content-faint">
            {name || '사진 없음'}
          </span>
          {dirty && (
            <span className="flex-none text-[11px] font-bold text-yonsei-blue">수정됨</span>
          )}
          {has && (
            <span className="flex flex-none items-center gap-2.5 md:hidden">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="text-xs font-semibold text-yonsei-blue disabled:opacity-40"
              >
                교체
              </button>
              <button
                type="button"
                onClick={() => onPatch(decade, '')}
                disabled={busy}
                className="text-xs font-semibold text-[#b42318] disabled:opacity-40"
              >
                삭제
              </button>
            </span>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] font-semibold leading-snug text-[#b42318]">
          {error}
        </p>
      ) : (
        !has && (
          <p className="mt-1.5 text-[11px] leading-snug text-content-faint">
            JPG·PNG·WebP, 업로드 시 자동 압축
          </p>
        )
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void accept(f);
          // 같은 파일을 다시 고를 수 있게 값을 비운다
          e.target.value = '';
        }}
      />
    </div>
  );
}
