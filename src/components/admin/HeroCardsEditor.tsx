'use client';

// 메인 이미지(홈 히어로) "카드 편집" — 표 대신 분야마다 학생이 실제로 보는 두 화면을
// 나란히 띄운다: 가로 사진(데스크톱·태블릿)과 세로 사진(휴대폰).
// HeroSlideshow 가 <picture> 아트디렉션으로 화면비에 따라 둘 중 하나만 내려받으므로,
// 관리 화면도 두 벌을 함께 보여 줘야 "휴대폰에서만 이상한 사진"을 그 자리에서 발견한다.
//
// 이 리소스에서 하는 일은 사실상 사진 교체 하나뿐이다. 그래서 사진 아래 '수정'이
// 곧바로 파일 선택 대화상자를 열어 한 번에 끝낸다(폼으로 들어갔다 나오지 않는다).
// ⚠️ 항목 폼('자세히')·삭제·검색은 두지 않는다 — 사용자 지정. 분야 6개는 고정이라
//    분야명을 고칠 일이 사실상 없고, 항목을 늘리거나 지우면 슬라이드쇼가 깨진다.
//
// 업로드만 즉시 스토리지로 나가고(이미지 바이너리는 JSON 저장과 별개 경로라 배칭할 수
// 없다), 그 결과 URL 은 onPatch 로 변경 트레이에 쌓여 저장 버튼 한 번으로 반영된다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { cellText, FIELD_OPTIONS, type FormRecord, type ResourceDef } from '@/lib/admin/resources';
import { formInlineValue } from '@/lib/admin/inline';
import { DirtyBar, MoveButtons, type InlineEditorProps } from './InlineFields';

/** 사진 두 벌의 편집 경로 — 화면 골격(가로 프레임 / 세로 프레임)이 곧 이 두 키다 */
type Slot = 'image' | 'imageMobile';

export interface HeroCardsEditorProps extends InlineEditorProps {
  /** 사진 업로드 — 즉시 올리고 저장할 공개 URL 을 돌려준다 (RecordForm 과 같은 통로) */
  onUploadImage: (file: File, opts?: { maxDim?: number; folder?: string }) => Promise<string>;
}

/**
 * 업로드 규격(저장 폴더·압축 상한·용량 게이트)은 resources.ts 의 필드 정의가 단일
 * 출처다 — 여기 숫자를 다시 적으면 '자세히' 폼(RecordForm)과 규격이 갈려, 같은 사진이
 * 어디서 올렸느냐에 따라 다른 크기로 저장된다.
 */
function uploadSpec(resource: ResourceDef, key: Slot) {
  const found = resource.fields.find((f) => f.key === key);
  const def = found && found.kind === 'imageUpload' ? found : undefined;
  return {
    // 저장 폴더 키 = folder 의 마지막 세그먼트 (public/img/hero → uploads/hero/)
    folder: def?.folder.split('/').filter(Boolean).pop(),
    maxDim: def?.maxDim,
    limitMB: def?.maxSizeMB ?? 5,
  };
}

export function HeroCardsEditor({
  resource,
  rows,
  total,
  busy,
  locked,
  orderLocked,
  orderable,
  dirtyIndices,
  invalidPaths,
  onMove,
  onPatch,
  onUploadImage,
}: HeroCardsEditorProps) {
  const specs = { image: uploadSpec(resource, 'image'), imageMobile: uploadSpec(resource, 'imageMobile') };

  return (
    // 검색·필터 줄이 없다 — 6줄뿐이라 한 화면에 전부 들어온다.
    <ul className="border-t-2 border-yonsei-navy">
      {rows.map(({ index, form }) => (
        <HeroSlideRow
          key={index}
          resource={resource}
          index={index}
          form={form}
          total={total}
          busy={busy}
          locked={locked}
          orderLocked={orderLocked}
          orderable={orderable}
          dirty={dirtyIndices.has(index)}
          invalidPaths={invalidPaths}
          specs={specs}
          onMove={onMove}
          onPatch={onPatch}
          onUploadImage={onUploadImage}
        />
      ))}
    </ul>
  );
}

function HeroSlideRow({
  resource,
  index,
  form,
  total,
  busy,
  locked,
  orderLocked,
  orderable,
  dirty,
  invalidPaths,
  specs,
  onMove,
  onPatch,
  onUploadImage,
}: {
  resource: ResourceDef;
  index: number;
  form: FormRecord;
  total: number;
  busy: boolean;
  locked: boolean;
  orderLocked: boolean;
  orderable: boolean;
  dirty: boolean;
  invalidPaths: Set<string>;
  specs: Record<Slot, ReturnType<typeof uploadSpec>>;
  onMove: (i: number, d: -1 | 1) => void;
  onPatch: (i: number, path: string, value: string) => void;
  onUploadImage: (file: File, opts?: { maxDim?: number; folder?: string }) => Promise<string>;
}) {
  /** 업로드 중인 칸 하나(두 칸을 동시에 올릴 일은 없다) */
  const [pending, setPending] = useState<{ slot: Slot; name: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Slot, string>>>({});
  // 업로드 직후 같은 경로 이미지를 새로 받기 위한 캐시버스터(교수 카드와 같은 방식)
  const [bust, setBust] = useState(0);

  const titleKo = String(formInlineValue(resource.fields, form, 'title.ko'));
  const titleEn = String(formInlineValue(resource.fields, form, 'title.en'));
  const fieldValue = cellText(form, 'field');
  const fieldLabel = FIELD_OPTIONS.find((o) => o.value === fieldValue)?.label ?? '';
  const heading = titleKo || fieldLabel || `#${index + 1}`;

  const desktopSrc = cellText(form, 'image');
  const mobileSrc = cellText(form, 'imageMobile');

  const disabled = busy || locked;

  async function upload(slot: Slot, file: File) {
    const spec = specs[slot];
    setErrors((e) => ({ ...e, [slot]: undefined }));
    // 용량 게이트 — 필드가 상한을 올린다(히어로 15MB). 압축은 스토리지가 한다.
    if (file.size > spec.limitMB * 1024 * 1024) {
      setErrors((e) => ({ ...e, [slot]: `${spec.limitMB}MB 이하 이미지만 올릴 수 있습니다.` }));
      return;
    }
    setPending({ slot, name: file.name });
    try {
      const url = await onUploadImage(file, { maxDim: spec.maxDim, folder: spec.folder });
      // 값은 트레이에 쌓인다 — 저장 전까지 사이트는 아직 옛 사진이다
      onPatch(index, slot, url);
      setBust((b) => b + 1);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [slot]: err instanceof Error ? err.message : '업로드에 실패했습니다.',
      }));
    } finally {
      setPending(null);
    }
  }

  return (
    <li
      className={cn(
        'relative border-b border-surface-border px-3 py-6 transition-colors duration-200 ease-out-expo',
        dirty && 'bg-yonsei-blue/[0.04]',
      )}
    >
      {dirty && <DirtyBar />}

      {/* 분야 헤더 — 이 줄이 어느 슬라이드인지만 말한다(값 편집 없음) */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-surface-border pb-2">
        <h3 className="text-[15px] font-bold tracking-tight text-content">{heading}</h3>
        {titleEn && <span className="text-xs text-content-faint">{titleEn}</span>}
        {dirty && <span className="text-[11px] font-bold text-yonsei-blue">수정됨</span>}
        {orderable && (
          <span className="ml-auto flex items-center">
            <MoveButtons index={index} total={total} disabled={busy || orderLocked} onMove={onMove} />
          </span>
        )}
      </div>

      {/* 가로·세로를 나란히 — 세로 프레임 폭은 두 프레임의 높이가 비슷해지도록 잡았다
          (가로 3:2 · 세로 9:16). 좁은 화면에서는 위아래로 접힌다. */}
      <div className="mt-4 grid max-w-[880px] grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.42fr)]">
        <HeroSlot
          caption="가로 사진 · 데스크톱·태블릿"
          aspect="aspect-[3/2]"
          src={desktopSrc}
          bust={bust}
          emptyNotice="가로 사진 없음 — 첫 화면이 비어 보입니다"
          // 규격 안내는 한 줄로만 — 긴 설명은 화면 위 리소스 설명이 이미 말한다
          note={`폭 2048px 이상 가로 사진 · ${specs.image.limitMB}MB 이하`}
          ariaLabel={`${heading} 가로 사진`}
          disabled={disabled}
          uploading={pending?.slot === 'image'}
          uploadName={pending?.slot === 'image' ? pending.name : ''}
          error={errors.image}
          invalid={invalidPaths.has(`${index}:image`)}
          onFile={(f) => void upload('image', f)}
        />
        <HeroSlot
          caption="세로 사진 · 휴대폰"
          aspect="aspect-[9/16]"
          src={mobileSrc}
          bust={bust}
          // 비어 있어도 화면은 비지 않는다 — 사이트가 가로 사진을 확대해 쓴다.
          // 그 결과(좌우가 크게 잘린 모습)를 흐리게 깔아 무엇이 나가는지 보여 준다.
          fallbackSrc={desktopSrc}
          emptyNotice="세로 사진 없음 — 가로 사진으로 대체 표시"
          note={`1620×2880(9:16) 권장 · ${specs.imageMobile.limitMB}MB 이하`}
          ariaLabel={`${heading} 세로 사진`}
          disabled={disabled}
          uploading={pending?.slot === 'imageMobile'}
          uploadName={pending?.slot === 'imageMobile' ? pending.name : ''}
          error={errors.imageMobile}
          onFile={(f) => void upload('imageMobile', f)}
        />
      </div>
    </li>
  );
}

/** 사진 한 칸 — 미리보기 프레임 + 그 아래 '수정'(없으면 '추가') */
function HeroSlot({
  caption,
  aspect,
  src,
  fallbackSrc,
  bust,
  emptyNotice,
  note,
  ariaLabel,
  disabled,
  uploading,
  uploadName,
  error,
  invalid,
  onFile,
}: {
  caption: string;
  /** 프레임 비율 — 학생이 보는 화면비 그대로여야 잘리는 모습을 미리 볼 수 있다 */
  aspect: string;
  src: string;
  /** 값이 비었을 때 사이트가 대신 쓰는 사진(세로 칸 전용) */
  fallbackSrc?: string;
  bust: number;
  emptyNotice: string;
  note?: string;
  ariaLabel: string;
  disabled: boolean;
  uploading: boolean;
  uploadName: string;
  error?: string;
  /** 필수인데 비었다 — 위험색 테두리 */
  invalid?: boolean;
  onFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const has = src.trim() !== '';
  const shown = has ? src : (fallbackSrc ?? '');

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold text-content-faint">{caption}</p>

      <div
        className={cn(
          'relative overflow-hidden border bg-[#eef1f5] transition-colors duration-200 ease-out-expo',
          aspect,
          invalid ? 'border-[#b42318]' : dragOver ? 'border-yonsei-blue' : 'border-surface-border',
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
          if (f && f.type.startsWith('image/')) onFile(f);
        }}
      >
        {shown ? (
          // 관리자 화면이라 최적화보다 즉시 반영이 중요 — next/image 대신 일반 img.
          // 값이 사이트 내부 경로(/img/hero/…)든 업로드 결과 절대 URL 이든 그대로 뜬다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${shown}${bust ? `?v=${bust}` : ''}`}
            alt=""
            className={cn('h-full w-full object-cover', !has && 'opacity-30')}
          />
        ) : null}

        {!has && (
          <span className="absolute inset-0 flex items-center justify-center p-3">
            <span className="bg-white/85 px-2 py-1 text-center text-[11px] font-semibold leading-snug text-content-soft">
              {emptyNotice}
            </span>
          </span>
        )}

        {/* 업로드 중 오버레이 — 진행률을 알 수 없는 API 라 불확정 막대를 쓴다 */}
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/90 px-5">
            <span className="text-xs font-bold text-yonsei-navy">사진 업로드 중…</span>
            <span className="block h-1 w-full max-w-[180px] bg-surface-border">
              <span className="block h-full w-1/3 animate-pulse bg-yonsei-blue" />
            </span>
            <span className="w-full truncate text-center text-[10px] text-content-faint">
              {uploadName}
            </span>
          </div>
        )}
      </div>

      {/* 미리보기 바로 아래에서 교체를 끝낸다 — 누르면 파일 선택 대화상자가 열린다 */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          aria-label={`${ariaLabel} ${has ? '수정' : '추가'}`}
          title="사진 파일을 고르거나 미리보기 위에 끌어다 놓으세요"
          className="cms-btn cms-btn-sm"
        >
          {has ? '수정' : '추가'}
        </button>
        {note && <p className="mt-1.5 text-[11px] leading-snug text-content-faint">{note}</p>}
      </div>

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
          if (f) onFile(f);
          // 같은 파일을 다시 고를 수 있게 값을 비운다
          e.target.value = '';
        }}
      />
    </div>
  );
}
