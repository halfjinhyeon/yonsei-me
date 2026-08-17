'use client';

// 연구실 '자세히' — 사이트 "연구 > 연구실 목록"에서 **이 연구실 한 행이 보이는 모습
// 그대로**를 그리고, 값을 제자리에서 고친다. 목록은 카드 그리드가 아니라 행 리스트라
// (LabList: grid [minmax(0,1fr) 15rem]) 왼쪽 본문 + 오른쪽 15rem 이미지 배치를 따른다.
//
// 소개 영상 URL 은 같은 데이터가 **다른 페이지**(대학원 > 연구실 소개 영상 갤러리)에도
// 실리는 값이라, 행 미러 밖에 따로 두고 썸네일로 "채우면 갤러리에 실린다"를 보여 준다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useState } from 'react';
import type { FormRecord } from '@/lib/admin/resources';
import { FIELD_OPTIONS, validateForm } from '@/lib/admin/resources';
import type { DetailEditorProps } from './DetailEditorTypes';
import { TranslateButton } from './TranslateButton';
import {
  AiSummaryButton,
  MirrorActions,
  MirrorInput,
  MirrorPhoto,
  MirrorSectionHead,
  MirrorSelect,
  MirrorTextArea,
} from './DetailMirrorParts';

function str(form: FormRecord, key: string): string {
  const v = form[key];
  return v == null ? '' : String(v);
}

/** 유튜브 watch/youtu.be 링크에서 썸네일을 만든다. 그 외(구글 드라이브 등)는 null —
 *  미리보기를 못 만들 뿐 저장은 그대로 된다. */
function youtubeThumb(url: string): string | null {
  const s = url.trim();
  if (s === '') return null;
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{6,})/) ??
    s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ??
    s.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

export function LabDetailEditor({
  fields,
  initial,
  isEdit,
  busy,
  onSubmit,
  onCancel,
  linkedSummary,
  onDirty,
  onUploadImage,
}: DetailEditorProps) {
  const [form, setForm] = useState<FormRecord>(initial);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);
  const [thumbErr, setThumbErr] = useState(false);

  function set(key: string, value: FormRecord[string]) {
    onDirty?.();
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  const text = (key: string) => str(form, key);
  const setText = (key: string) => (v: string) => set(key, v);

  const isInvalid = (key: string) => {
    if (!showInvalid) return false;
    const f = fields.find((x) => x.key === key);
    return Boolean(f?.required) && text(key).trim() === '';
  };

  function handleSubmit() {
    const msg = validateForm(fields, form);
    if (msg) {
      setShowInvalid(true);
      setError(msg);
      return;
    }
    setError(null);
    onSubmit(form);
  }

  const recruiting = form.internRecruiting === true;
  const video = text('video');
  const thumb = youtubeThumb(video);

  return (
    <div className="anim-panel">
      {/* ── 연구실 목록 행 미러 ── */}
      <MirrorSectionHead
        eyebrow="연구 > 연구실 목록 (행)"
        note="목록에서 이 연구실 한 행이 보이는 모습 그대로입니다."
      />

      <div className="border border-surface-border px-7 py-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
          <div className="flex min-w-0 flex-col items-start">
            <MirrorInput
              value={text('nameKo')}
              onChange={setText('nameKo')}
              ariaLabel="연구실명 (한국어)"
              placeholder="연구실명 (한국어)"
              disabled={busy}
              invalid={isInvalid('nameKo')}
              className="-ml-[7px] w-full max-w-[520px] text-[23px] font-bold leading-tight tracking-[-0.01em]"
            />
            <MirrorInput
              value={text('nameEn')}
              onChange={setText('nameEn')}
              ariaLabel="연구실명 (English)"
              placeholder="영문명 없음 — 영문 페이지에 한국어가 노출됩니다"
              disabled={busy}
              className="-ml-[7px] w-full max-w-[520px] text-xs font-medium tracking-wide text-content-faint"
            />

            {/* 인턴 배지 — 사이트의 그 배지 모습 그대로, 인원은 배지 안에서 고친다 */}
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              {recruiting && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-3 py-1.5 text-xs font-semibold text-[#047857]">
                  <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-[#10b981]" />
                  학부 인턴 모집 중
                  <span className="inline-flex items-center gap-0.5 text-[#059669]">
                    ·
                    <MirrorInput
                      value={text('internCount')}
                      onChange={setText('internCount')}
                      ariaLabel="모집 인원"
                      placeholder="0"
                      disabled={busy}
                      className="w-[34px] !px-1 !py-px text-right text-xs font-semibold tabular-nums text-[#047857]"
                    />
                    명
                  </span>
                </span>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] font-semibold text-content">
                <input
                  type="checkbox"
                  checked={recruiting}
                  onChange={(e) => set('internRecruiting', e.target.checked)}
                  disabled={busy}
                  className="h-3.5 w-3.5 accent-yonsei-blue"
                />
                배지 표시
              </label>
              <span className="text-[11px] text-content-faint">
                끄면 배지가 사라지고 모집 인원도 저장되지 않습니다
              </span>
            </div>

            {/* 정의 목록 — 사이트의 분야/위치/연락처 dl */}
            <dl className="mt-4 grid w-full max-w-[580px] grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1 text-[13.5px] sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
              <dt className="pt-1.5 font-bold text-content">지도교수</dt>
              <dd className="m-0 min-w-0">
                <MirrorInput
                  value={text('professorKo')}
                  onChange={setText('professorKo')}
                  ariaLabel="지도교수 (한국어)"
                  placeholder="지도교수 (한국어)"
                  disabled={busy}
                  invalid={isInvalid('professorKo')}
                  className="w-full text-[13.5px]"
                />
                <MirrorInput
                  value={text('professorEn')}
                  onChange={setText('professorEn')}
                  ariaLabel="지도교수 (English)"
                  placeholder="Professor (English)"
                  disabled={busy}
                  className="w-full text-[11.5px] text-content-faint"
                />
              </dd>
              <dt className="pt-1.5 font-bold text-content">분야</dt>
              <dd className="m-0 min-w-0">
                <MirrorSelect
                  value={text('field')}
                  onChange={setText('field')}
                  options={FIELD_OPTIONS}
                  emptyLabel="선택…"
                  ariaLabel="연구 분야"
                  disabled={busy}
                  invalid={isInvalid('field')}
                  className="w-full text-[13.5px]"
                />
                <p className="m-0 pl-[7px] text-[11px] text-content-faint">
                  목록 상단 분야 필터가 이 값으로 갈립니다
                </p>
              </dd>
              <dt className="pt-1.5 font-bold text-content">위치</dt>
              <dd className="m-0 min-w-0">
                <MirrorInput
                  value={text('location')}
                  onChange={setText('location')}
                  ariaLabel="위치"
                  placeholder="공학관 N204"
                  disabled={busy}
                  className="w-full text-[13.5px]"
                />
              </dd>
              <dt className="pt-1.5 font-bold text-content">연락처</dt>
              <dd className="m-0 min-w-0">
                <MirrorInput
                  value={text('phone')}
                  onChange={setText('phone')}
                  ariaLabel="전화"
                  placeholder="없음"
                  disabled={busy}
                  className="w-full text-[13.5px] tabular-nums"
                />
              </dd>
            </dl>

            {/* 사이트의 버튼 줄 — AI 요약 토글 + 바로가기(주소를 비우면 사라진다) */}
            <div className="mt-4 flex w-full flex-wrap items-center gap-2">
              <AiSummaryButton
                onClick={() => setAiOpen(!aiOpen)}
                open={aiOpen}
                size="sm"
                disabled={busy}
              />
              {text('url').trim() !== '' && (
                <span className="inline-flex items-center gap-2 border border-surface-border px-3.5 py-2 text-xs font-bold text-content">
                  바로가기
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3">
                    <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              <MirrorInput
                value={text('url')}
                onChange={setText('url')}
                ariaLabel="연구실 홈페이지 URL"
                placeholder="연구실 홈페이지 URL — 비우면 이 버튼이 사라집니다"
                disabled={busy}
                className="min-w-[300px] flex-1 text-[11.5px] text-yonsei-blue"
              />
            </div>
          </div>

          <div className="w-full lg:w-60">
            <MirrorPhoto
              src={text('image')}
              onChange={(url) => set('image', url)}
              onUploadImage={onUploadImage}
              folder="labs"
              disabled={busy}
              ariaLabel="대표 이미지 교체"
              replaceLabel={text('image').trim() === '' ? '이미지 추가' : '이미지 교체'}
              emptyTitle="대표 이미지 없음"
              emptyHint="비우면 기본 이미지 3장을 순환 사용합니다"
              frameClassName="h-40"
              note="목록 오른쪽에 이 크기(15rem)로 잘려 들어갑니다."
            />
          </div>
        </div>

        {/* AI 요약 — 사이트에서 행 아래 전폭으로 펼쳐지는 그 패널 자리 */}
        {aiOpen && linkedSummary && (
          <div className="anim-panel mt-5 border border-l-2 border-surface-border border-l-yonsei-blue bg-surface-soft px-6 py-5">
            <p className="m-0 mb-3.5 flex flex-wrap items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-yonsei-blue">
              AI Research Summary
              <span className="bg-yonsei-blue/10 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider">
                BETA
              </span>
              <span className="ml-1 text-[10px] font-bold normal-case tracking-normal text-content-faint">
                행 아래 전폭으로 펼쳐지는 패널의 문안
              </span>
            </p>
            {linkedSummary.loading ? (
              <p className="text-sm text-content-soft">불러오는 중…</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="m-0 mb-1.5 text-[11.5px] font-bold text-content">
                    요약 (한국어) · 권장 180~230자
                  </p>
                  <MirrorTextArea
                    value={linkedSummary.ko}
                    onChange={(v) => {
                      onDirty?.();
                      linkedSummary.onChangeKo(v);
                    }}
                    ariaLabel="AI 연구요약 (한국어)"
                    disabled={busy}
                    className="w-full border-surface-border text-[13.5px]"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="m-0 text-[11.5px] font-bold text-content">
                      요약 (English) · 권장 320~420자
                    </p>
                    <TranslateButton
                      source={linkedSummary.ko}
                      onTranslated={(en) => {
                        onDirty?.();
                        linkedSummary.onChangeEn(en);
                      }}
                      disabled={busy}
                    />
                  </div>
                  <MirrorTextArea
                    value={linkedSummary.en}
                    onChange={(v) => {
                      onDirty?.();
                      linkedSummary.onChangeEn(v);
                    }}
                    ariaLabel="AI 연구요약 (English)"
                    disabled={busy}
                    className="w-full border-surface-border text-[13.5px]"
                  />
                </div>
              </div>
            )}
            <p className="mb-0 mt-3 text-[11.5px] text-content-faint">
              비워 두면 이 연구실에는 요약 버튼이 뜨지 않습니다.
            </p>
          </div>
        )}
      </div>

      {/* ── 소개 영상 — 같은 데이터가 다른 페이지(영상 갤러리)에도 실린다 ── */}
      <div className="mt-8">
        <MirrorSectionHead
          eyebrow="대학원 > 연구실 소개 영상"
          note="영상 URL을 채우면 이 연구실이 영상 갤러리에도 함께 실립니다."
        />
        <div className="flex flex-wrap items-start gap-5 border border-surface-border px-5 py-4">
          <div className="min-w-[280px] flex-1">
            <p className="m-0 mb-1 text-xs font-bold text-content">소개 영상 URL</p>
            <MirrorInput
              value={video}
              onChange={(v) => {
                setThumbErr(false);
                set('video', v);
              }}
              ariaLabel="소개 영상 URL"
              placeholder="https://www.youtube.com/watch?v=… 또는 Google Drive 파일 링크"
              disabled={busy}
              className="w-full border-surface-border text-[12.5px]"
            />
            <p className="m-0 mt-1.5 text-[11px] text-content-faint">
              {video.trim() === ''
                ? '비워 두면 이 연구실은 영상 갤러리에 실리지 않습니다.'
                : thumb
                  ? '영상 갤러리에 실립니다.'
                  : '갤러리에는 실리지만 썸네일 미리보기는 YouTube 링크만 지원합니다.'}
            </p>
          </div>
          <div className="w-[200px] flex-none">
            <div className="relative aspect-video w-full overflow-hidden bg-[#eef1f5]">
              {thumb && !thumbErr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  onError={() => setThumbErr(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center border border-dashed border-[#9fb3c8] p-2.5 text-center font-mono text-[10px] leading-relaxed text-[#a8b0ba]">
                  {video.trim() === '' ? 'URL을 넣으면 여기에 썸네일이 뜹니다' : '미리보기 없음'}
                </span>
              )}
            </div>
            <p className="m-0 mt-1.5 text-[11px] text-content-faint">갤러리 썸네일 미리보기</p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-[#b42318]">
          {error}
        </p>
      )}
      <MirrorActions busy={busy} onCancel={onCancel} onSubmit={handleSubmit} />
      {!isEdit && (
        <p className="mt-2 text-xs text-content-faint">
          새 연구실을 등록하는 중입니다 — 저장하면 연구실 목록 맨 뒤에 추가됩니다.
        </p>
      )}
    </div>
  );
}
