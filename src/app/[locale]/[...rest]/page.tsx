import { notFound } from 'next/navigation';

/**
 * 로케일 하위의 매칭되지 않는 모든 경로를 잡아 404로 보낸다.
 * → app/[locale]/not-found.tsx 가 로케일 레이아웃 안에서 렌더된다.
 * (next-intl 권장 패턴: 전역 not-found 대신 catch-all 사용)
 */
export default function CatchAllPage() {
  notFound();
}
