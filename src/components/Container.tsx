import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * 게시판 목록 페이지용 좁은 폭 — 기본 컨테이너(2xl 1360px)의 90%인 1224px 에서
 * 좌우를 30px 씩 넓힌 1284px. 90% 축소 화면의 밀도를 100% 줌에서 내기 위한 눈금이며,
 * 히어로·탭바·본문이 같은 좌측선에 서도록 세 컨테이너에 같은 값을 건다.
 */
export const NARROW_MAX_W = 'max-w-[80.25rem]';

/** 최대 폭 + 좌우 패딩을 담당하는 레이아웃 래퍼 */
export function Container({ children, className }: ContainerProps) {
  return <div className={cn('container', className)}>{children}</div>;
}
