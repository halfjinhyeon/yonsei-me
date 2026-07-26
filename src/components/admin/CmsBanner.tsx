'use client';

// 지속 배너 — 화면과 무관하게 계속 참인 상태를 상단 한 자리에서 말한다.
//
// 토스트(AdminToast)와 역할이 다르다. 토스트는 "방금 무슨 일이 있었다"를 5초 동안
// 말하고 사라지는 사건 알림이고, 배너는 "지금 이 상태가 계속되고 있다"를 상태가
// 끝날 때까지 붙들고 있는 조건 알림이다. 오프라인·쓰기 권한 없음이 후자다 —
// 이런 상태를 토스트로 알리면 사용자가 놓치는 순간 왜 저장이 실패하는지 알 길이
// 없어진다.
//
// 자리를 상단 바 바로 아래 한 곳으로 고정한 이유: 배너가 화면마다 다른 곳에서
// 뜨면 사용자는 매번 새로 찾아야 하고, 목록 사이에 끼어들면 스크롤에 밀려 사라진다.
//
// 내부 운영 도구라 한국어 UI 문자열은 배너를 만드는 쪽(셸)이 직접 넘긴다.

import { cn } from '@/lib/utils';

export interface CmsBannerData {
  /** 배너 종류 키 — 'offline' | 'forbidden' 등. 같은 키는 덮어쓴다 */
  id: string;
  tone: 'danger' | 'info';
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  /** 사용자가 닫을 수 있는가. 오프라인처럼 상태가 스스로 사라지는 배너는 false */
  dismissible?: boolean;
}

export function CmsBanner({
  banner,
  onDismiss,
}: {
  banner: CmsBannerData;
  onDismiss: () => void;
}): React.ReactElement {
  const danger = banner.tone === 'danger';

  return (
    // danger 는 사용자가 하려던 일(저장)을 실제로 막는 상태라 role="alert" + assertive 로
    // 즉시 읽히게 하고, info 는 진행을 막지 않으므로 polite 로 흐름을 끊지 않는다.
    <div
      role={danger ? 'alert' : 'status'}
      aria-live={danger ? 'assertive' : 'polite'}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-6 py-2.5 text-[12px] leading-relaxed lg:px-10',
        danger
          ? 'border-[#b42318]/25 bg-[#fdf3f2] text-[#b42318]'
          : 'border-surface-border bg-surface-soft text-content',
      )}
    >
      {/* 제목과 본문을 한 줄에 이어 붙인다 — 배너가 두 줄이 되면 아래 목록을 그만큼
          밀어내 "잠깐 뜬 것"이 아니라 레이아웃 변화로 느껴진다 */}
      <span className="font-bold">{banner.title}</span>
      <span className="opacity-90">{banner.body}</span>

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {banner.action && (
          <button
            type="button"
            onClick={banner.action.onClick}
            className={cn(
              'border px-2 py-1 text-[11px] font-bold transition-colors',
              danger
                ? 'border-[#b42318]/40 text-[#b42318] hover:border-[#b42318] hover:bg-[#b42318] hover:text-white'
                : 'border-surface-border text-content hover:border-yonsei-blue hover:text-yonsei-blue',
            )}
          >
            {banner.action.label}
          </button>
        )}
        {banner.dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="배너 닫기"
            className={cn(
              'border px-2 py-1 text-[11px] font-bold leading-none transition-colors',
              danger
                ? 'border-transparent text-[#b42318]/70 hover:border-[#b42318]/40 hover:text-[#b42318]'
                : 'border-transparent text-content-faint hover:border-surface-border hover:text-content',
            )}
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}
