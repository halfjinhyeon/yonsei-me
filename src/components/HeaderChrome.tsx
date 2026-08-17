'use client';

import { usePathname } from '@/i18n/navigation';

/**
 * 사이트 헤더를 콘텐츠 관리 콘솔 전체에서 감추는 래퍼.
 *
 * 콘솔(/contentmanagement 이하)은 사이트의 한 페이지가 아니라 독립 전체
 * 화면이다 — 자체 사이드바가 화면 맨 위부터 끝까지 닿는 빌더형 레이아웃이라
 * 그 위로 사이트 헤더(fixed, h-16/lg:h-20)와 내비게이션이 얹히면 "여기서부터는
 * 도구"라는 경계가 사라진다. 로그인 화면도 같은 이유로 처음부터 감춰 왔다.
 *
 * SiteChrome(푸터용)과 같은 이유로 route group 대신 경로 조건 래퍼를 쓴다 —
 * 페이지 디렉터리를 통째로 옮기는 대이동이 병행 작업 중인 트리에서 위험하다.
 */
export function HeaderChrome({ children }: { children: React.ReactNode }) {
  // next-intl 의 usePathname 은 로케일 프리픽스를 뗀 경로를 준다 (/ko/... → /...)
  const pathname = usePathname();
  if (pathname === '/contentmanagement' || pathname.startsWith('/contentmanagement/')) {
    return null;
  }
  return <>{children}</>;
}
