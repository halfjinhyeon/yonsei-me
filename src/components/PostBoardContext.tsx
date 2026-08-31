import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { BoardRow } from '@/components/BoardList';
import type { BoardSlice } from '@/lib/board-paging';
import { cn } from '@/lib/utils';

export interface PostBoardContextLabels {
  prev: string;
  next: string;
  none: string;
  navLabel: string;
}

/**
 * 게시물 하단 이전 글 / 다음 글 내비게이션.
 *
 * 상세가 [← 목록으로] 버튼 하나로 끝나면 다음 글을 읽으려는 사람은 목록을 한 번
 * 갔다 와야 한다. 앞뒤 글을 본문 아래에 그려 그 왕복을 없앤다.
 *
 * ⚠️ 범위는 **글이 실제로 속한 게시판 하나**다. 공지사항 탭은 학부·대학원·외부기관·
 *    장학 4개 게시판을 합친 화면이라, 학부 공지 글 다음에 대학원 공지가 이어지면
 *    "이 게시판의 앞뒤 글"이라는 약속이 깨진다(list-data.buildBoardContext 가 걸러 준다).
 */
export function PostBoardContext({
  slice,
  labels,
}: {
  slice: BoardSlice<BoardRow>;
  labels: PostBoardContextLabels;
}) {
  // 글이 하나도 없는 게시판이면 그릴 것이 없다
  if (slice.total === 0) return null;

  return (
    /* 이전 글 / 다음 글 — 좌우 두 칸, 모바일은 위아래 두 줄 */
    <nav
      aria-label={labels.navLabel}
      className="mt-14 grid border-t border-surface-border sm:grid-cols-2 sm:border-b"
    >
      <AdjacentCell
        side="prev"
        row={slice.prev}
        none={labels.none}
        label={
          <>
            <Chevron dir="left" />
            {labels.prev}
          </>
        }
      />
      <AdjacentCell
        side="next"
        row={slice.next}
        none={labels.none}
        label={
          <>
            {labels.next}
            <Chevron dir="right" />
          </>
        }
      />
    </nav>
  );
}

/**
 * 이전/다음 화살표 — 라벨 글자(11px)와 따로 노는 텍스트 ‹ › 대신, 라벨보다 한 뼘
 * 큰 스트로크 셰브런을 그린다(사이트의 각진 미니멀 톤에 맞춘 직선 두 획).
 */
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn('h-4 w-4 shrink-0', dir === 'left' && '-scale-x-100')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

/**
 * 이전/다음 한 칸. 글이 없어도 칸 자체는 남긴다 — 지우면 두 칸 그리드가 무너져
 * 남은 한 칸이 화면 절반에 붕 뜬다.
 */
function AdjacentCell({
  side,
  row,
  label,
  none,
}: {
  side: 'prev' | 'next';
  row?: BoardRow;
  label: ReactNode;
  none: string;
}) {
  const base = cn(
    'flex flex-col gap-1.5 border-b border-surface-border py-3.5 sm:gap-2 sm:border-b-0 sm:py-[18px]',
    side === 'prev'
      ? 'sm:border-r sm:pr-7'
      : 'sm:items-end sm:border-r-0 sm:pl-7 sm:pr-0 sm:text-right',
  );
  const labelEl = (
    <span className="flex items-center gap-1 text-[11px] font-bold tracking-[0.06em] text-content-faint">
      {label}
    </span>
  );

  if (!row?.href) {
    return (
      <div className={base}>
        {labelEl}
        <span className="text-[15px] font-medium leading-[1.45] text-content-faint sm:leading-normal">
          {none}
        </span>
      </div>
    );
  }

  return (
    <Link
      href={row.href}
      prefetch={false}
      // min-h-11 — 모바일에서 터치 표적이 44px 아래로 내려가지 않게
      className={cn(base, 'min-h-11 transition-colors hover:text-yonsei-blue')}
    >
      {labelEl}
      <span className="line-clamp-2 text-[15px] font-medium leading-[1.45] sm:leading-normal">
        {row.title}
      </span>
    </Link>
  );
}
