'use client';

import { usePathname } from '@/i18n/navigation';

/**
 * 사이트 공용 크롬(헤더·푸터)을 콘텐츠 관리 콘솔에서만 감추는 래퍼.
 *
 * 콘솔(/contentmanagement)은 사이트의 세부 페이지가 아니라 전용 전체화면
 * 도구로 동작한다 — 전고 사이드바·자체 상단 바가 사이트 헤더와 겹치면
 * 오프셋 계산이 셸 전체로 번지기 때문에(이전 구조의 top-[calc(4rem+…)] 들)
 * 크롬을 아예 렌더하지 않는 쪽이 단순하다.
 *
 * route group 으로 레이아웃을 쪼개지 않는 이유: 페이지 디렉터리 전체를
 * (site) 그룹으로 옮기는 대이동이 필요해, 병행 작업 중인 트리에서 위험이
 * 이득보다 크다. 경로 하나를 조건으로 갖는 래퍼가 최소 침습이다.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  // next-intl 의 usePathname 은 로케일 프리픽스를 뗀 경로를 준다 (/ko/... → /...)
  const pathname = usePathname();
  if (pathname === '/contentmanagement' || pathname.startsWith('/contentmanagement/')) {
    return null;
  }
  return <>{children}</>;
}
