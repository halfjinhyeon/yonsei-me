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
import type { RepoConfig } from '@/lib/admin/content-api';
import type { MenuEntry } from '@/lib/admin/resources';
import type { CmsBannerData } from './CmsBanner';

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
  /**
   * 다른 편집 화면으로 이동 — 사이드바를 거치지 않는 화면 안 이동용(5단계).
   * 캘린더의 "게시판 연동 일정"은 여기서 고칠 수 없고 해당 게시판에서 고쳐야 하는데,
   * 안내만 하고 사용자가 사이드바에서 그 게시판을 다시 찾게 두면 안내가 무의미하다.
   * 셸의 이동 가드(미저장 확인)를 그대로 타므로 대기 변경이 조용히 사라지지 않는다.
   * null 을 넘기면 대시보드로 돌아간다(권한 배너의 "권한 안내 보기"가 그 경로를 쓴다).
   */
  openEntry: (entry: MenuEntry | null) => void;

  // ---- 운영 상태 (12종) ----
  // 아래 값들이 개별 에디터가 아니라 셸에 있는 이유는 하나다: 전부 "지금 보고 있는
  // 화면과 무관하게 참인 상태"이기 때문이다. 에디터마다 따로 감지하면 화면을 옮길
  // 때마다 상태가 초기화되고, 같은 조건을 화면마다 다른 말로 설명하게 된다.

  /** 마운트 후에만 갱신되는 온라인 여부.
   *  ⚠️ navigator.onLine 은 SSR 에 없다 — 초기값은 항상 true 로 두고
   *     마운트 뒤에만 실제 값을 읽어야 하이드레이션 불일치가 나지 않는다. */
  online: boolean;
  /** 저장소 쓰기 권한 없음(403). 에디터가 실패 응답을 보고 켠다.
   *  인증·권한 판정 자체는 여기서 하지 않는다 — 실패를 화면에서 어떻게 말할지만 다룬다. */
  writeDenied: boolean;
  setWriteDenied: (v: boolean) => void;
  /** 그 외 임시 배너 (오프라인·권한 배너는 셸이 직접 계산하므로 여기 담지 않는다).
   *  화면 쪽에서 "이 상태를 상단에 계속 띄워 달라"고 올려보내는 통로다. */
  banner: CmsBannerData | null;
  setBanner: (b: CmsBannerData | null) => void;
  /** 저장이 막혀 있으면 그 이유, 아니면 null. 변경 트레이가 저장 버튼을 잠근다.
   *  잠금 판정을 트레이가 아니라 셸이 하는 이유: 잠그는 조건(오프라인·권한)이
   *  트레이의 관심사가 아니라 콘솔 전체의 상태이기 때문이다. */
  saveBlock: string | null;
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
