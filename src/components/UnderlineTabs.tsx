'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface UnderlineTabItem {
  id: string;
  label: ReactNode;
}

/**
 * 사이트 공통 언더라인 탭/토글 (교수진 탭에서 시작된 패턴).
 * 글자 중심 버튼 열 아래에 얇은 브랜드 그라디언트 바가 깔리고,
 * 선택이 바뀌면 바가 해당 버튼의 위치·폭으로 슬라이드한다.
 * reduced-motion에서는 전환 없이 즉시 이동, 창 크기 변경 시 재계산.
 */
export function UnderlineTabs({
  tabs,
  active,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: UnderlineTabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [bar, setBar] = useState({ left: 0, width: 0 });

  const measure = () => {
    const el = refs.current.get(active);
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  };
  // 선택 변경·마운트 시 즉시 실측 (페인트 전에 배치해 첫 렌더 점프 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [active, tabs.length]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('relative border-b border-surface-border', className)}
    >
      <div className="flex gap-7">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={active === tab.id}
            className={cn(
              'inline-flex items-center gap-2 pb-3 text-sm font-semibold transition-colors',
              active === tab.id ? 'text-yonsei-navy' : 'text-content-soft hover:text-yonsei-navy',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* 슬라이딩 언더라인 — 네이비→블루 브랜드 그라디언트(금색 배제 — 사용자 지시) */}
      <span
        aria-hidden="true"
        className="absolute -bottom-px h-0.5 rounded-full bg-gradient-to-r from-yonsei-navy to-yonsei-blue transition-all duration-300 ease-out-expo motion-reduce:transition-none"
        style={{ left: bar.left, width: bar.width }}
      />
    </div>
  );
}
