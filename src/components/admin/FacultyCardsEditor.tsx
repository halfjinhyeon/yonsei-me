'use client';

// 교수진 "카드 편집" 모드 — 실제 사이트의 교수 카드와 같은 모양으로 보면서 그 자리에서 고친다.
//
// 설계(사용자 지시):
//   · 카드 위에서 바로 고치는 것 : 이름 · 이메일 · 전화 · 호실 · 사진   (자주 고치는 값)
//   · 카드 위 필터                : 직급
//   · 그 외 11개 필드 전부        : 카드의 "자세히"로 우측 패널을 열어 편집
// 표 + 화면 전환 왕복 대신, 목록을 보면서 즉시 수정하는 흐름을 만든다.
//
// 상태: 편집 중인 값은 이 컴포넌트가 배열로 들고 있다가 "저장"에서 한 번에 커밋한다.
// 사진 업로드만은 즉시 저장소에 커밋된다(이미지 바이너리는 JSON 커밋과 별개 경로).
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useEffect, useMemo, useRef, useState } from 'react';
import { cellText, type FormRecord, type ResourceDef } from '@/lib/admin/resources';

const fieldClass =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-content outline-none transition-colors hover:border-surface-border focus:border-yonsei-blue focus:bg-surface';

/** 사진이 없을 때 쓰는 이름 첫 글자 아바타 색 — 이름 해시로 고정(사이트 카드와 같은 방식) */
function accentFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return ['#003377', '#0057A8', '#2E86D6', '#00285E'][hash % 4];
}

export interface FacultyCardsEditorProps {
  resource: ResourceDef;
  /** 표시·편집 대상 (index = 원본 배열 위치) */
  rows: { index: number; form: FormRecord }[];
  /** 전체 항목 수 — 순서 이동 가능 여부 판정 */
  total: number;
  busy: boolean;
  /** 순서 변경 중이면 편집을 잠근다 */
  locked: boolean;
  onEditDetail: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  orderable: boolean;
  /** 인라인 편집 결과를 상위로 — 저장은 상위가 일괄 처리 */
  onPatch: (index: number, key: string, value: string) => void;
  /** 사진 업로드 — repoPath 로 즉시 커밋 */
  onUploadPhoto: (repoPath: string, file: File) => Promise<void>;
}

/** 카드에서 바로 고치는 필드 */
const INLINE_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'email', label: '이메일', placeholder: 'name@yonsei.ac.kr' },
  { key: 'phone', label: '전화', placeholder: '02-2123-0000' },
  { key: 'room', label: '호실', placeholder: '제4공학관 000호' },
];

export function FacultyCardsEditor({
  resource,
  rows,
  total,
  busy,
  locked,
  onEditDetail,
  onDelete,
  onMove,
  orderable,
  onPatch,
  onUploadPhoto,
}: FacultyCardsEditorProps) {
  // 직급 필터 — 값은 데이터에서 뽑는다(직급 표기가 바뀌어도 따라간다)
  const titles = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const t = cellText(r.form, 'title').trim();
      if (t) set.add(t);
    }
    return [...set].sort();
  }, [rows]);
  const [titleFilter, setTitleFilter] = useState<string>('');

  const visible = titleFilter
    ? rows.filter((r) => cellText(r.form, 'title').trim() === titleFilter)
    : rows;

  return (
    <div>
      {/* 직급 필터 */}
      {titles.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-bold uppercase tracking-wide text-content-faint">
            직급
          </span>
          <FilterChip active={titleFilter === ''} onClick={() => setTitleFilter('')}>
            전체 {rows.length}
          </FilterChip>
          {titles.map((t) => {
            const n = rows.filter((r) => cellText(r.form, 'title').trim() === t).length;
            return (
              <FilterChip key={t} active={titleFilter === t} onClick={() => setTitleFilter(t)}>
                {t} {n}
              </FilterChip>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-content-faint">해당 조건의 교수가 없습니다.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ index, form }) => (
            <FacultyCard
              key={index}
              resource={resource}
              index={index}
              form={form}
              total={total}
              busy={busy}
              locked={locked}
              orderable={orderable}
              onEditDetail={onEditDetail}
              onDelete={onDelete}
              onMove={onMove}
              onPatch={onPatch}
              onUploadPhoto={onUploadPhoto}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded border border-yonsei-navy bg-yonsei-navy px-2.5 py-1 text-xs font-bold text-white'
          : 'rounded border border-surface-border bg-surface px-2.5 py-1 text-xs font-semibold text-content-soft hover:border-yonsei-blue'
      }
    >
      {children}
    </button>
  );
}

function FacultyCard({
  resource,
  index,
  form,
  total,
  busy,
  locked,
  orderable,
  onEditDetail,
  onDelete,
  onMove,
  onPatch,
  onUploadPhoto,
}: {
  resource: ResourceDef;
  index: number;
  form: FormRecord;
  total: number;
  busy: boolean;
  locked: boolean;
  orderable: boolean;
  onEditDetail: (i: number) => void;
  onDelete: (i: number) => void;
  onMove: (i: number, d: -1 | 1) => void;
  onPatch: (i: number, key: string, value: string) => void;
  onUploadPhoto: (repoPath: string, file: File) => Promise<void>;
}) {
  const name = cellText(form, 'name');
  const title = cellText(form, 'title');
  const photo = cellText(form, 'photo');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // 업로드 직후 같은 경로 이미지를 새로 받기 위한 캐시버스터
  const [bust, setBust] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  // 이름 기반 추정 경로가 404 면 아바타로 되돌린다
  const [photoBroken, setPhotoBroken] = useState(false);

  /**
   * 표시할 사진 경로.
   * 사이트(lib/faculty.ts)는 JSON 의 photo 를 우선하고, 없으면 public/img/faculty 의
   * "<이름>.<확장자>" 파일을 이름으로 자동 연결한다. 관리자 카드도 같은 규칙을 따라야
   * 실제 화면과 어긋나지 않는다 — 현재 데이터 50명 전원이 photo 필드가 비어 있고
   * 파일명 규칙으로만 사진이 붙는다.
   */
  const guessed = name.trim() ? `/img/faculty/${name.trim()}.jpg` : '';
  const photoSrc = photo || (photoBroken ? '' : guessed);

  // 이름이 바뀌면 추정 경로도 달라지므로 실패 상태를 초기화한다
  useEffect(() => {
    setPhotoBroken(false);
  }, [name]);

  // 사진 필드 정의에서 저장 폴더를 읽는다(resources.ts 와 경로가 어긋나지 않도록)
  const photoField = resource.fields.find((f) => f.kind === 'imageUpload' && f.key === 'photo');
  const folder =
    photoField && photoField.kind === 'imageUpload' ? photoField.folder : 'public/img/faculty';

  async function upload(file: File) {
    if (!name.trim()) {
      setUploadError('이름을 먼저 입력하세요 — 파일명이 이름 기준입니다.');
      return;
    }
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const repoPath = `${folder}/${name.trim()}.${ext}`;
    setUploading(true);
    setUploadError(null);
    try {
      await onUploadPhoto(repoPath, file);
      // public/ 를 제외한 웹 경로로 필드에 반영
      onPatch(index, 'photo', repoPath.replace(/^public/, ''));
      setBust((b) => b + 1);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }

  const disabled = busy || locked;

  return (
    <li
      className={`relative flex gap-3 rounded-lg border p-3 transition-colors ${
        dragOver ? 'border-yonsei-blue bg-yonsei-blue/5' : 'border-surface-border bg-surface'
      }`}
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
      {/* 사진 — 클릭하거나 카드에 드래그해 교체 */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          title="클릭하거나 이미지를 카드에 끌어다 놓아 사진을 교체합니다"
          className="group relative block h-[86px] w-[68px] overflow-hidden rounded border border-surface-border bg-surface-soft disabled:opacity-60"
        >
          {photoSrc ? (
            // 관리자 화면이라 최적화보다 즉시 반영이 중요 — next/image 대신 일반 img
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${photoSrc}${bust ? `?v=${bust}` : ''}`}
              onError={() => setPhotoBroken(true)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/30"
              style={{ background: accentFor(name || '?') }}
            >
              {(name || '?').charAt(0)}
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? '올리는 중…' : '사진 교체'}
          </span>
        </button>
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

      {/* 인라인 편집 영역 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <input
            value={name}
            onChange={(e) => onPatch(index, 'name', e.target.value)}
            disabled={disabled}
            placeholder="이름"
            aria-label="이름"
            className={`${fieldClass} -ml-1.5 text-base font-bold`}
          />
        </div>
        {title && <p className="mb-1 px-1.5 text-xs text-content-faint">{title}</p>}

        <dl className="space-y-0.5">
          {INLINE_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-1">
              <dt className="w-11 shrink-0 px-1.5 text-[11px] text-content-faint">{f.label}</dt>
              <dd className="min-w-0 flex-1">
                <input
                  value={cellText(form, f.key)}
                  onChange={(e) => onPatch(index, f.key, e.target.value)}
                  disabled={disabled}
                  placeholder={f.placeholder}
                  aria-label={`${name} ${f.label}`}
                  className={`${fieldClass} text-[13px]`}
                />
              </dd>
            </div>
          ))}
        </dl>

        {uploadError && <p className="mt-1 px-1.5 text-[11px] text-red-600">{uploadError}</p>}

        {/* 카드 액션 */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onEditDetail(index)}
            disabled={disabled}
            className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
          >
            자세히
          </button>
          {orderable && (
            <>
              <button
                type="button"
                aria-label="위로"
                onClick={() => onMove(index, -1)}
                disabled={disabled || index === 0}
                className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="아래로"
                onClick={() => onMove(index, 1)}
                disabled={disabled || index === total - 1}
                className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
              >
                ▼
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onDelete(index)}
            disabled={disabled}
            className="ml-auto px-2 py-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
          >
            삭제
          </button>
        </div>
      </div>
    </li>
  );
}
