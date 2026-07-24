'use client';

import { cn } from '@/lib/utils';

/**
 * 슬라이드(세그먼트) 토글 — 선택 항목 밑으로 네이비 썸이 미끄러지는 각진 버튼 그룹.
 * 졸업요건 체커의 학번 선택·차트 전환, 마일리지 플래너의 학년·예산 선택에 공용으로 쓴다.
 * 균등 폭 세그먼트라 썸 이동은 translateX(index×100%) 만으로 정확하다.
 *
 * (원래 GraduationChecker 안에 있던 것을 두 컴포넌트가 함께 쓰도록 분리했다 —
 *  체커가 MileagePlanner 의 상수를 가져오므로 반대 방향 임포트는 순환 참조가 된다.)
 */
export function SegmentedControl({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'relative inline-grid auto-cols-fr grid-flow-col border border-surface-border bg-surface-soft p-1',
        className,
      )}
    >
      {/* 썸 — 컨테이너 안쪽 폭(100%-패딩)을 옵션 수로 나눈 한 칸 크기로 슬라이드 */}
      <span
        aria-hidden="true"
        className="absolute bottom-1 top-1 bg-yonsei-navy transition-transform duration-300 ease-out-expo motion-reduce:transition-none"
        style={{
          left: '0.25rem',
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            'relative z-10 px-4 py-1.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue',
            value === o.id ? 'text-white' : 'text-content-soft hover:text-content',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
