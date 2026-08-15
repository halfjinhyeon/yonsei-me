'use client';

import { usePathname } from '@/i18n/navigation';

/**
 * 사이트 공용 크롬 일부를 콘텐츠 관리 콘솔에서만 감추는 래퍼 — 현재는 푸터에만 쓴다.
 *
 * 콘솔(/contentmanagement)은 헤더·히어로는 사이트와 공유하지만(세부 페이지처럼
 * 시작), 하단에는 변경 트레이가 고정되므로 그 아래로 사이트 푸터가 이어지면
 * "도구의 끝"이 흐려진다 — 푸터만 렌더하지 않는다.
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
