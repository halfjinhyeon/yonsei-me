'use client';

// 콘솔 셸이 하위 에디터와 공유하는 최소 컨텍스트.
//
// 지금 필요한 것은 세 가지뿐이다:
//  - deploy: 상단 바의 배포 상태 칩. 저장(커밋) 직후 "배포 중"으로 바뀌어야 하는데
//    커밋을 실행하는 쪽은 에디터/변경 트레이(2단계)라 셸 상태를 위로 올려야 한다.
//  - toast: 저장 완료 같은 일회성 알림. 각 에디터가 자기 배너를 따로 그리지 않고
//           화면 한 곳에서만 말하게 한다.
//  - focusMode: 글쓰기 화면(4단계)은 좌측 내비를 걷어낸 전체화면 단일 컬럼이다.
//    사이드바와 콘솔 상단 바를 그리는 쪽은 셸이라, 폼이 "지금 집중 모드"라고
//    알려 줄 통로가 필요하다.
// 그 이상(설정·권한 등)은 필요해질 때 추가한다 — 지금 넓게 열어두지 않는다.

import { createContext, useContext, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { RepoConfig } from '@/lib/admin/github';

export type DeployState = 'idle' | 'deploying';

export interface AdminShellValue {
  config: RepoConfig;
  login: string;
  deploy: DeployState;
  setDeploy: (d: DeployState) => void;
  /** 상단 토스트 — 2단계 이후 저장 완료 안내에 쓴다 */
  toast: string | null;
  showToast: (msg: string) => void;
  dismissToast: () => void;
  /** 전체화면 집중 모드 — 켜지면 셸이 사이드바와 자체 상단 바를 내린다(글쓰기 화면) */
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
}

const AdminShellContext = createContext<AdminShellValue | null>(null);

export function AdminShellProvider({
  value,
  children,
}: {
  value: AdminShellValue;
  children: React.ReactNode;
}) {
  return <AdminShellContext.Provider value={value}>{children}</AdminShellContext.Provider>;
}

export function useAdminShell(): AdminShellValue {
  const ctx = useContext(AdminShellContext);
  if (!ctx) throw new Error('useAdminShell 은 AdminShellProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

/** 상단 중앙 토스트. 5초 후 자동으로 사라지고, 그 전에 "확인"으로 닫을 수 있다. */
export function AdminToast() {
  const { toast, dismissToast, focusMode } = useAdminShell();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismissToast, 5000);
    return () => window.clearTimeout(t);
    // toast 문자열이 바뀌면(연속 저장) 타이머를 다시 건다
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // 사이트 헤더(fixed) + 콘솔 상단 바 바로 아래 중앙. 둘 다 지나쳐야
      // 가려지지 않는다. z-60 은 헤더(z-50)보다 위, 모달(z-70)보다 아래.
      // 집중 모드에서는 콘솔 상단 바가 없으므로 그만큼(--cms-bar) 위로 올린다 —
      // 그러지 않으면 글쓰기 화면 상단 고정 바를 덮는다.
      className={cn(
        'anim-panel fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-4 bg-yonsei-navy px-[18px] py-3.5 text-[13px] font-semibold text-white shadow-[0_20px_40px_-24px_rgba(0,40,94,.8)]',
        focusMode
          ? 'top-[calc(4rem+12px)] lg:top-[calc(5rem+12px)]'
          : 'top-[calc(4rem+var(--cms-bar)+12px)] lg:top-[calc(5rem+var(--cms-bar)+12px)]',
      )}
    >
      <span>{toast}</span>
      <button
        type="button"
        onClick={dismissToast}
        className="shrink-0 border border-white/30 px-2 py-1 text-[11px] font-bold text-white/90 transition-colors hover:border-white hover:text-white"
      >
        확인
      </button>
    </div>
  );
}
