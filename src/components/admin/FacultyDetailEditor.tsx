'use client';

// 교수 '자세히' — 학생이 보는 **교수 개인 상세 페이지의 프로필 카드 배치를 그대로**
// 그리고, 각 값을 제자리에서 고친다. 아래에 같은 데이터가 목록 카드에서 어떻게
// 보이는지도 함께 둔다(사진 비율과 노출 값이 달라, 한쪽만 보고 고치면 다른 쪽이 깨진다).
//
// 왜 폼 그리드를 버렸나: 필드 19개를 6칸 그리드에 나열하면 "어떤 값이 사이트 어디에
// 찍히는지"를 화면이 말해 주지 않아, 관리자가 머릿속으로 페이지를 상상하며 빈칸을
// 채워야 했다(사용자 평가 3/5 — "겉모습은 직관적이지만 실제 화면이 난잡함").
//
// 경계: 학술활동 표(논문·연구과제…)와 오피스·개인 홈페이지는 크롤 산출물이라 여기서
// 고치지 않는다 — 자리만 보여 주고 '자동 수집'이라고 밝힌다. 무엇을 고칠 수 있는지가
// 보이는 것 자체가 "커스터마이징 불가" 불만의 절반을 해소한다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { FormRecord } from '@/lib/admin/resources';
import { validateForm } from '@/lib/admin/resources';
import type { DetailEditorProps } from './DetailEditorTypes';
import { TranslateButton } from './TranslateButton';
import {
  AiSummaryButton,
  LockedTag,
  MirrorActions,
  MirrorInput,
  MirrorPhoto,
  MirrorSectionHead,
  MirrorSelect,
  MirrorTextArea,
} from './DetailMirrorParts';

/** 직급 — resources.ts 의 select 옵션을 그대로 쓰되, 없으면 이 기본값으로 떨어진다 */
const TITLE_FALLBACK = [
  { value: 'Professor', label: 'Professor' },
  { value: 'Associate Professor', label: 'Associate Professor' },
  { value: 'Assistant Professor', label: 'Assistant Professor' },
  { value: 'Emeritus Professor', label: 'Emeritus Professor' },
];

function str(form: FormRecord, key: string): string {
  const v = form[key];
  return v == null ? '' : String(v);
}

export function FacultyDetailEditor({
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  function set(key: string, value: FormRecord[string]) {
    onDirty?.();
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  const text = (key: string) => str(form, key);
  const setText = (key: string) => (v: string) => set(key, v);

  // 필수인데 비운 칸 — 저장 시도 후에만 붉게 물들인다(입력 도중에 붉어지면 방해)
  const [showInvalid, setShowInvalid] = useState(false);
  const isInvalid = (key: string) => {
    if (!showInvalid) return false;
    const f = fields.find((x) => x.key === key);
    return Boolean(f?.required) && text(key).trim() === '';
  };

  const titleField = fields.find((f) => f.key === 'title');
  const titleOptions = titleField?.kind === 'select' ? titleField.options : TITLE_FALLBACK;

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

  const summaryKo = linkedSummary?.ko ?? '';

  return (
    <div className="anim-panel">
      {/* ── 교수 개인 상세 페이지 미러 ── */}
      <MirrorSectionHead
        eyebrow="교수 개인 상세 페이지"
        note="학생이 보는 배치 그대로입니다. 값 위를 눌러 그 자리에서 고치세요."
      />

      <div className="flex flex-wrap gap-8 border border-surface-border bg-surface px-9 py-8 lg:gap-10">
        <div className="w-[216px] flex-none">
          <MirrorPhoto
            src={text('photo')}
            onChange={(url) => set('photo', url)}
            onUploadImage={onUploadImage}
            folder="faculty"
            disabled={busy}
            ariaLabel="프로필 사진 교체"
            replaceLabel={text('photo').trim() === '' ? '사진 추가' : '사진 교체'}
            emptyTitle="사진 없음"
            emptyHint="세로 3:4 프로필 사진 · 여기로 끌어다 놓기"
            frameClassName="aspect-[3/4]"
            note={
              <>
                끌어다 놓아도 됩니다. 이 사진은 <strong className="text-content">상세 페이지</strong>와{' '}
                <strong className="text-content">목록 카드</strong> 두 곳에 쓰입니다.
              </>
            }
          />
        </div>

        <div className="flex min-w-0 flex-1 basis-[380px] flex-col">
          {/* 이름 줄 — 사이트의 큰 이름 + 영문 병기 + 보직 배지 */}
          <div className="flex flex-wrap items-center gap-2">
            <MirrorInput
              value={text('name')}
              onChange={setText('name')}
              ariaLabel="이름"
              placeholder="이름"
              disabled={busy}
              invalid={isInvalid('name')}
              className="-ml-[7px] w-auto min-w-[150px] max-w-[230px] text-[31px] font-bold tracking-[-0.02em]"
            />
            <MirrorInput
              value={text('nameEn')}
              onChange={setText('nameEn')}
              ariaLabel="이름 (English)"
              placeholder="이름 (English)"
              disabled={busy}
              className="w-auto min-w-[130px] max-w-[200px] text-[15px] text-content-faint"
            />
            <span className="inline-flex flex-col bg-yonsei-blue/10 px-1 py-0.5">
              <MirrorInput
                value={text('role')}
                onChange={setText('role')}
                ariaLabel="보직"
                placeholder="보직 없음"
                disabled={busy}
                className="w-auto min-w-[96px] max-w-[150px] !px-1 !py-px text-xs font-semibold text-yonsei-blue"
              />
              <MirrorInput
                value={text('roleEn')}
                onChange={setText('roleEn')}
                ariaLabel="보직 (English)"
                placeholder="Role (English)"
                disabled={busy}
                className="w-auto min-w-[96px] max-w-[150px] !px-1 !py-px text-[10px] text-[#5b83ad]"
              />
            </span>
          </div>

          <MirrorSelect
            value={text('title')}
            onChange={setText('title')}
            options={titleOptions}
            emptyLabel="직급 선택…"
            ariaLabel="직급"
            disabled={busy}
            invalid={isInvalid('title')}
            className="-ml-[7px] mt-1 w-auto min-w-[210px] text-[17px]"
          />

          {/* 연락 줄 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-surface-border pt-3.5">
            <span className="inline-flex min-w-[200px] items-center gap-1.5">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="#6E6E6E" strokeWidth={1.8} className="h-3.5 w-3.5 flex-none">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <MirrorInput
                value={text('phone')}
                onChange={setText('phone')}
                ariaLabel="전화"
                placeholder="전화 없음"
                disabled={busy}
                className="w-full text-[13.5px] tabular-nums"
              />
            </span>
            <span className="inline-flex min-w-[250px] flex-1 items-center gap-1.5">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="#0057A8" strokeWidth={1.8} className="h-3.5 w-3.5 flex-none">
                <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
                <path d="m3 6 9 7 9-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <MirrorInput
                value={text('email')}
                onChange={setText('email')}
                ariaLabel="이메일"
                placeholder="이메일 없음"
                disabled={busy}
                className="w-full text-[13.5px] text-yonsei-blue"
              />
            </span>
          </div>

          {/* 정의 목록 — 사이트와 같은 dt/dd. 고정값·자동 수집은 꼬리표로 밝힌다 */}
          <dl className="mt-4 flex flex-col gap-2 text-[14.5px]">
            <div className="flex items-center gap-3">
              <dt className="w-16 flex-none font-bold text-content">캠퍼스</dt>
              <dd className="m-0 text-content">
                신촌캠퍼스<LockedTag>고정값</LockedTag>
              </dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="w-16 flex-none font-bold text-content">소속</dt>
              <dd className="m-0 text-content">
                기계공학부<LockedTag>고정값</LockedTag>
              </dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="w-16 flex-none pt-1.5 font-bold text-content">연구실</dt>
              <dd className="m-0 flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="inline-flex min-w-0 flex-col">
                  <MirrorInput
                    value={text('labNameKo')}
                    onChange={setText('labNameKo')}
                    ariaLabel="연구실명 (한국어)"
                    placeholder="연구실명 (한국어)"
                    disabled={busy}
                    className="w-auto min-w-[240px] text-[14.5px]"
                  />
                  <MirrorInput
                    value={text('labNameEn')}
                    onChange={setText('labNameEn')}
                    ariaLabel="연구실명 (English)"
                    placeholder="연구실명 (English)"
                    disabled={busy}
                    className="w-auto min-w-[240px] text-[11.5px] text-content-faint"
                  />
                </span>
                {text('labUrl').trim() !== '' && (
                  <span className="inline-flex h-6 w-6 flex-none items-center justify-center border border-surface-border text-yonsei-blue">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3">
                      <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                <MirrorInput
                  value={text('labUrl')}
                  onChange={setText('labUrl')}
                  ariaLabel="연구실 홈페이지 URL"
                  placeholder="연구실 홈페이지 URL — 비우면 링크 아이콘이 사라집니다"
                  disabled={busy}
                  className="w-auto min-w-[280px] flex-1 text-[11.5px] text-yonsei-blue"
                />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ── 학술활동 + AI 연구요약 ── */}
      <div className="mt-8">
        <p className="cms-eyebrow">Academic Activities</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-4">
          <h3 className="m-0 text-[29px] font-bold tracking-[-0.01em] text-content">학술활동</h3>
          <AiSummaryButton onClick={() => setAiOpen(!aiOpen)} open={aiOpen} disabled={busy} />
          <span className="text-[11.5px] text-content-faint">
            이 버튼과 요약 패널은 사이트에서 이 자리에 나옵니다
          </span>
        </div>

        {aiOpen && linkedSummary && (
          <div className="anim-panel mt-4 border border-l-2 border-surface-border border-l-yonsei-blue bg-surface-soft px-6 py-5">
            <p className="m-0 mb-3.5 flex flex-wrap items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-yonsei-blue">
              AI Research Summary
              <span className="bg-yonsei-blue/10 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider">
                BETA
              </span>
              <span className="ml-1 text-[10px] font-bold normal-case tracking-normal text-content-faint">
                패널 문안을 여기서 직접 고칩니다
              </span>
            </p>
            {linkedSummary.loading ? (
              <p className="text-sm text-content-soft">불러오는 중…</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="m-0 mb-1.5 text-[11.5px] font-bold text-content">요약 (한국어)</p>
                  <MirrorTextArea
                    value={linkedSummary.ko}
                    onChange={(v) => {
                      onDirty?.();
                      linkedSummary.onChangeKo(v);
                    }}
                    ariaLabel="AI 연구요약 (한국어)"
                    disabled={busy}
                    minRows={9}
                    className="w-full border-surface-border text-[13.5px]"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="m-0 text-[11.5px] font-bold text-content">요약 (English)</p>
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
                    minRows={9}
                    className="w-full border-surface-border text-[13.5px]"
                  />
                </div>
              </div>
            )}
            <p className="mb-0 mt-3 text-[11.5px] text-content-faint">
              비워 두면 이 교수에게는 요약 버튼이 뜨지 않습니다. 문단은 빈 줄로 나눕니다.
              {summaryKo.trim() === '' && ' — 지금은 비어 있습니다.'}
            </p>
          </div>
        )}

        {/* 크롤 데이터 자리 — 여기서 못 고친다는 사실을 자리로 보여 준다 */}
        <div className="mt-5 border border-surface-border">
          <div className="flex flex-wrap border-b-2 border-yonsei-navy">
            {['논문 (Journal Articles)', '연구과제', '지적재산권', '수상', '학술활동'].map((t, i) => (
              <span
                key={t}
                className={cn(
                  'px-4 py-3 text-[12.5px]',
                  i === 0 ? 'font-bold text-yonsei-navy' : 'text-content-faint',
                )}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-3.5 bg-[repeating-linear-gradient(135deg,#fbfcfe_0_8px,#f4f7fb_8px_16px)] px-5 py-5">
            <span className="h-2 w-[62%] bg-[#e6ebf2]" />
            <span className="h-2 w-[78%] bg-[#e6ebf2]" />
            <span className="h-2 w-[48%] bg-[#e6ebf2]" />
            <p className="m-0 mt-1 font-mono text-[11.5px] text-content-faint">
              자동 수집 데이터입니다 — 논문·연구과제·지적재산권·수상·학술활동 표는 이 화면에서
              수정할 수 없습니다.
            </p>
          </div>
        </div>
      </div>

      {/* ── 목록 카드 미러 ── */}
      <div className="mt-11">
        <MirrorSectionHead
          eyebrow="교수진 목록 카드"
          note="같은 데이터가 목록에서는 이렇게 보입니다 — 사진 비율과 노출 값이 다릅니다."
        />
        <div className="flex max-w-[640px] gap-5 border border-surface-border bg-surface p-4">
          <div className="aspect-[4/3] w-[150px] flex-none overflow-hidden bg-[#eef1f5]">
            {text('photo').trim() !== '' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={text('photo')} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center border border-dashed border-[#9fb3c8] font-mono text-[10px] text-[#a8b0ba]">
                4:3 카드 사진
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="m-0 text-[17px] font-bold tracking-[-0.01em] text-content">
              {text('name') || '이름 없음'}
            </p>
            <p className="m-0 mt-0.5 text-[13px] text-content">{text('title')}</p>
            <p className="m-0 mt-0.5 text-[12.5px] text-yonsei-blue">{text('email')}</p>
            <dl className="m-0 mt-3 flex flex-col gap-0.5 border-t border-surface-border pt-2.5">
              <div className="grid grid-cols-[66px_minmax(0,1fr)] items-center gap-1.5">
                <dt className="text-[11px] font-semibold text-content-faint">연구실</dt>
                <dd className="m-0">
                  <MirrorInput
                    value={text('room')}
                    onChange={setText('room')}
                    ariaLabel="연구실 위치"
                    placeholder="연구실 위치 없음"
                    disabled={busy}
                    className="w-full text-[12.5px]"
                  />
                </dd>
              </div>
              <div className="grid grid-cols-[66px_minmax(0,1fr)] items-center gap-1.5">
                <dt className="text-[11px] font-semibold text-content-faint">전공 분야</dt>
                <dd className="m-0">
                  <MirrorInput
                    value={text('specialty')}
                    onChange={setText('specialty')}
                    ariaLabel="전공 분야"
                    placeholder="전공 분야 — 주로 명예·퇴임 교원 카드"
                    disabled={busy}
                    className="w-full text-[12.5px]"
                  />
                  <MirrorInput
                    value={text('specialtyEn')}
                    onChange={setText('specialtyEn')}
                    ariaLabel="전공 분야 (English)"
                    placeholder="Specialty (English)"
                    disabled={busy}
                    className="w-full text-[10.5px] text-content-faint"
                  />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* ── 표시 설정 — 사이트에 값으로 보이지 않는 것들 ── */}
      <div className="mt-10 border border-surface-border">
        <button
          type="button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-expanded={settingsOpen}
          className="flex w-full items-center justify-between gap-3 border-0 bg-surface-soft px-4 py-3 text-left"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold text-content">
              표시 설정 {settingsOpen ? '▴' : '▾'}
            </span>
            <span className="text-[11.5px] text-content-faint">
              사이트에 값으로 보이지 않는 항목 — 대체 텍스트, 노출 토글, 분류용 값
            </span>
          </span>
          <span className="text-[11px] font-bold text-yonsei-blue">
            {settingsOpen ? '접기' : '펼치기'}
          </span>
        </button>
        {settingsOpen && (
          <div className="grid gap-x-7 gap-y-5 px-4 py-5 sm:grid-cols-2">
            <div>
              <p className="m-0 mb-1 text-xs font-bold text-content">사진 대체 텍스트</p>
              <MirrorInput
                value={text('photoAlt')}
                onChange={setText('photoAlt')}
                ariaLabel="사진 대체 텍스트"
                disabled={busy}
                className="w-full border-surface-border text-[13px]"
              />
              <p className="m-0 mt-1.5 text-[11px] text-content-faint">
                비우면 이름을 사용합니다. 화면 낭독기에서 읽히는 값입니다.
              </p>
            </div>
            <div>
              <p className="m-0 mb-1 text-xs font-bold text-content">재직 기간</p>
              <MirrorInput
                value={text('yearRange')}
                onChange={setText('yearRange')}
                ariaLabel="재직 기간"
                placeholder="1963~2002"
                disabled={busy}
                className="w-full border-surface-border text-[13px]"
              />
              <p className="m-0 mt-1.5 text-[11px] text-content-faint">
                퇴임 교원만. 적어 두면 아래 체크 없이도 명예·퇴임으로 분류됩니다.
              </p>
            </div>
            <div>
              <p className="m-0 mb-1 text-xs font-bold text-content">상세 정보 URL</p>
              <MirrorInput
                value={text('moreInfoUrl')}
                onChange={setText('moreInfoUrl')}
                ariaLabel="상세 정보 URL"
                disabled={busy}
                className="w-full border-surface-border text-xs"
              />
            </div>
            <div className="flex flex-col gap-3.5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.emeritus === true}
                  onChange={(e) => set('emeritus', e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-[15px] w-[15px] flex-none accent-yonsei-blue"
                />
                <span className="text-[12.5px] leading-normal">
                  <span className="font-bold text-content">명예·퇴임 교원</span>
                  <span className="mt-0.5 block text-[11px] text-content-faint">
                    재직 기간을 모를 때 직접 체크하세요.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.showActivities === true}
                  onChange={(e) => set('showActivities', e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-[15px] w-[15px] flex-none accent-yonsei-blue"
                />
                <span className="text-[12.5px] leading-normal">
                  <span className="font-bold text-content">학술활동 사이트에 공개</span>
                  <span className="mt-0.5 block text-[11px] text-content-faint">
                    기본은 비공개(교원정보시스템 링크만). 체크하면 실적 표가 상세 페이지에도
                    실립니다. AI 연구요약은 체크와 무관하게 항상 보입니다.
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-[#b42318]">
          {error}
        </p>
      )}
      <MirrorActions busy={busy} onCancel={onCancel} onSubmit={handleSubmit} />
      {!isEdit && (
        <p className="mt-2 text-xs text-content-faint">
          새 교수를 등록하는 중입니다 — 저장하면 교수진 목록 맨 뒤에 추가됩니다.
        </p>
      )}
    </div>
  );
}
