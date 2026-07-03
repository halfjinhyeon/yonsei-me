import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

/** 최대 폭 + 좌우 패딩을 담당하는 레이아웃 래퍼 */
export function Container({ children, className }: ContainerProps) {
  return <div className={cn('container', className)}>{children}</div>;
}
