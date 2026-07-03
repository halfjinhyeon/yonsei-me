'use client';

import { useEffect, useRef, useState, type ReactNode, type ElementType } from 'react';
import { cn } from '@/lib/utils';

/**
 * 뷰포트 진입 시 페이드/슬라이드-업으로 나타나는 래퍼 (IntersectionObserver).
 * reduced-motion 환경에서는 즉시 표시.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  from = 'up',
  delay = 0,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  from?: 'up' | 'left';
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out-expo motion-reduce:transition-none',
        visible
          ? 'translate-x-0 translate-y-0 opacity-100'
          : from === 'left'
            ? '-translate-x-7 opacity-0'
            : 'translate-y-7 opacity-0',
        className,
      )}
      style={visible && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
