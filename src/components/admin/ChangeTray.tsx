'use client';

// 하단 고정 변경 트레이 — 저장 대기 중인 변경을 한 줄에 모아 보여준다.
//
// 화면 안에 저장 바를 두면 (1) 목록을 스크롤하는 동안 사라지고 (2) 리소스마다
// 모양이 달라진다. 트레이는 화면 하단에 고정돼 어디를 보고 있든 "지금 몇 건이
// 대기 중이고 무엇을 고쳤는지"를 같은 자리에서 말한다.
// 본문(AdminConsole 의 pb-36)이 트레이 높이만큼 이미 비워져 있어 내용을 가리지 않는다.
//
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useAdminShell } from './AdminShellContext';
import { useChangeTray, type PendingChange } from './ChangeTrayContext';

export function ChangeTray() {
  const { source, saving, error, runSave } = useChangeTray();
  const { showToast, setDeploy } = useAdminShell();

  // 등록된 소스가 없거나 대기 변경이 없으면 트레이 자체를 그리지 않는다
  if (!source || source.changes.length === 0) return null;

  const changes = source.changes;

  async function handleSave() {
    const ok = await runSave();
    if (!ok) return;
    showToast('저장했습니다 — 1~2분 내 사이트에 반영됩니다.');
    // 배포 상태를 idle 로 되돌리는 타이머는 셸(AdminConsole)이 든다. 저장이 끝나면
    // 대기 변경이 0이 되어 이 컴포넌트가 곧바로 언마운트되기 때문이다.
    setDeploy('deploying');
  }

  return (
    <div
      role="region"
      aria-label="저장 대기 중인 변경"
      className="anim-panel fixed inset-x-0 bottom-0 z-40 border-t-2 border-yonsei-navy bg-surface shadow-[0_-10px_30px_-18px_rgba(0,40,94,.4)]"
    >
      {error && (
        <p
          role="alert"
          className="border-b border-surface-border bg-[#fdf3f2] px-6 py-2 text-[12px] font-semibold leading-relaxed text-[#b42318] lg:px-10"
        >
          {error} — 변경은 그대로 두었습니다. 다시 저장하거나 되돌릴 수 있습니다.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 lg:flex-nowrap lg:px-10">
        {/* 건수 — 상태 점은 시안의 금색 대신 블루(금색은 이 프로젝트에서 금지) */}
        <span className="flex flex-none items-center gap-2">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-yonsei-blue" />
          <span className="text-[13px] font-bold text-content">
            저장 대기 {changes.length}건
          </span>
        </span>

        {/* 칩 목록 — 건수가 많으면 가로로 스크롤한다.
            data-lenis-prevent 가 없으면 전역 Lenis 가 휠을 가로채 안쪽이 안 움직인다. */}
        <div
          data-lenis-prevent
          className="order-last flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-0.5 lg:order-none lg:w-auto lg:flex-1 lg:pb-0"
        >
          {changes.map((c) => (
            <ChangeChip
              key={c.id}
              change={c}
              disabled={saving}
              onRevert={() => source.revert(c.id)}
            />
          ))}
        </div>

        <span className="ml-auto flex flex-none items-center gap-2.5">
          <button
            type="button"
            onClick={source.revertAll}
            disabled={saving}
            className="cms-btn cms-btn-sm hover:border-[#b42318] hover:text-[#b42318]"
          >
            모두 되돌리기
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="cms-btn-primary"
          >
            {saving ? '저장 중…' : `저장 (커밋)${source.saveLabel ? ` · ${source.saveLabel}` : ''}`}
          </button>
        </span>
      </div>
    </div>
  );
}

/** 변경 한 건 — "{영역} · {항목}  {필드} : {이전} → {이후}" + 되돌리기 */
function ChangeChip({
  change,
  disabled,
  onRevert,
}: {
  change: PendingChange;
  disabled: boolean;
  onRevert: () => void;
}) {
  const before = change.before || '없음';
  const after = change.after || '없음';
  return (
    <span className="flex flex-none items-center gap-1.5 whitespace-nowrap border border-surface-border bg-[#fcfdfe] py-1.5 pl-2.5 pr-1 text-[11px]">
      <strong className="font-bold text-content">
        {change.scopeLabel} · {change.itemLabel}
      </strong>
      <span className="flex items-center gap-1 text-content-faint">
        <span>{change.fieldLabel} :</span>
        {/* 긴 값은 잘라서 칩 폭이 폭주하지 않게 하고, 전체 값은 title 로 남긴다 */}
        <span title={before} className="inline-block max-w-[14ch] truncate align-bottom">
          {before}
        </span>
        <span aria-hidden="true">→</span>
        <span title={after} className="inline-block max-w-[14ch] truncate align-bottom text-content">
          {after}
        </span>
      </span>
      <button
        type="button"
        onClick={onRevert}
        disabled={disabled}
        title="되돌리기"
        aria-label={`${change.itemLabel} ${change.fieldLabel} 되돌리기`}
        className="px-1 text-[13px] font-extrabold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:cursor-not-allowed disabled:opacity-50"
      >
        ↺
      </button>
    </span>
  );
}
