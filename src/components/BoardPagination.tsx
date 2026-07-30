'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** 한 번에 노출하는 페이지 번호 개수 — 현재 페이지를 가운데 두는 창 */
const WINDOW = 5;

/**
 * 게시판 목록 하단 페이지네이션 — ‹ 1 2 3 4 5 › (현재 페이지는 굵게 + 아래 짧은 룰).
 * 페이지가 하나뿐이어도 그린다: "여기가 목록의 끝"이라는 신호가 UX 상 필요하고,
 * 글이 쌓여 2페이지가 생기는 순간 컨트롤이 갑자기 나타나는 것보다 낫다.
 * 사이트 톤에 맞춰 각지게(밑줄 3px 룰) + 네이비, 그림자·라운드 없음.
 */
export function BoardPagination({
  page,
  pageCount,
  onChange,
}: {
  /** 1-based 현재 페이지 */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const t = useTranslations('board.pagination');

  const total = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), total);

  // 현재 페이지를 창 가운데 두되, 양 끝에서는 창을 안쪽으로 붙여 항상 같은 개수를 보인다
  const size = Math.min(WINDOW, total);
  const start = Math.max(1, Math.min(current - Math.floor(WINDOW / 2), total - size + 1));
  const pages = Array.from({ length: size }, (_, i) => start + i);

  return (
    <nav aria-label={t('label')} className="mt-10 flex items-center justify-center gap-1 sm:gap-2">
      <Arrow
        direction="prev"
        label={t('prev')}
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
      />

      {pages.map((p) => {
        const active = p === current;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={t('page', { page: p })}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative min-w-[2.25rem] px-2 py-2 text-sm tabular-nums transition-colors sm:min-w-[2.75rem]',
              active
                ? 'font-bold text-yonsei-navy'
                : 'font-semibold text-content-soft hover:text-yonsei-blue',
            )}
          >
            {p}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-0.5 h-[3px] bg-yonsei-navy"
              />
            )}
          </button>
        );
      })}

      <Arrow
        direction="next"
        label={t('next')}
        disabled={current === total}
        onClick={() => onChange(current + 1)}
      />
    </nav>
  );
}

/** 좌우 이동 셰브론 — 끝 페이지에서는 비활성(옅은 회색, 클릭 불가) */
function Arrow({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'p-2 transition-colors sm:mx-2',
        disabled
          ? 'cursor-default text-content-faint/45'
          : 'text-content hover:text-yonsei-blue',
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-5 w-5"
      >
        <path
          d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
