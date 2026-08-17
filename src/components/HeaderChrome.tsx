'use client';

import { usePathname } from '@/i18n/navigation';

/**
 * 사이트 헤더를 콘솔 로그인 화면에서만 감추는 래퍼.
 *
 * 로그인(/contentmanagement/login)은 사이트의 한 페이지가 아니라 독립 전체
 * 화면이다 — 좌측 네이비 패널이 화면 끝까지 닿아야 하는데 그 위로 사이트
 * 헤더(fixed, h-16/lg:h-20)와 내비게이션이 얹히면 "여기서부터는 도구"라는
 * 경계가 사라지고, 로그인하지 않은 사람에게 사이트 메뉴를 권하는 꼴이 된다.
 * 콘솔 본체(/contentmanagement)는 지금처럼 헤더·히어로를 그대로 쓴다.
 *
 * SiteChrome(푸터용)과 같은 이유로 route group 대신 경로 조건 래퍼를 쓴다 —
 * 페이지 디렉터리를 통째로 옮기는 대이동이 병행 작업 중인 트리에서 위험하다.
 */
export function HeaderChrome({ children }: { children: React.ReactNode }) {
  // next-intl 의 usePathname 은 로케일 프리픽스를 뗀 경로를 준다 (/ko/... → /...)
  const pathname = usePathname();
  if (pathname === '/contentmanagement/login') {
    return null;
  }
  return <>{children}</>;
}
