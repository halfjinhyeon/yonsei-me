import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BoardPagination } from '@/components/BoardPagination';
import type { BoardRow } from '@/components/BoardList';
import type { BoardSlice } from '@/lib/board-paging';
import { cn, formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

/** 헤더 h2 의 id — aria-labelledby 가 가리킨다(한 페이지에 이 섹션은 하나뿐) */
const HEADING_ID = 'post-board-list-heading';

/**
 * listHref 에 페이지 자리표시자를 얹은 링크 틀. 이미 붙어 있는 쿼리(공지사항의
 * `?cat=undergrad`)는 그대로 두고 page 만 갈아 끼운다 — 목록이 상세와 **같은 화면**으로
 * 열려야 하기 때문이다. `{page}` 는 URLSearchParams 가 %7B…%7D 로 인코딩하므로
 * 직렬화가 끝난 뒤에 잇는다(1페이지에서 page 를 떼는 일은 BoardPagination 이 한다).
 */
function pageHrefTemplate(listHref: string): string {
  const [path, query = ''] = listHref.split('?');
  const params = new URLSearchParams(query);
  params.delete('page');
  const qs = params.toString();
  return `${path}?${qs ? `${qs}&` : ''}page={page}`;
}

export interface PostBoardContextLabels {
  viewAll: string;
  viewAllShort: string;
  /** 이미 조립된 문구("전체 128건") — 복수형 규칙이 로케일마다 달라 호출자가 만든다 */
  total: string;
  prev: string;
  next: string;
  none: string;
  navLabel: string;
}

/**
 * 게시물 하단 '같은 게시판 목록' — 이전/다음 글 + 그 글이 놓인 페이지의 목록.
 *
 * 상세가 [← 목록으로] 버튼 하나로 끝나면 다음 글을 읽으려는 사람은 목록을 한 번
 * 갔다 와야 한다. 앞뒤 글과 목록 한 페이지를 본문 아래에 그려 그 왕복을 없앤다.
 *
 * ⚠️ 범위는 **글이 실제로 속한 게시판 하나**다. 공지사항 탭은 학부·대학원·외부기관·
 *    장학 4개 게시판을 합친 화면이라, 학부 공지 글 아래에 대학원 공지가 섞이면
 *    "이 게시판의 목록"이라는 약속이 깨진다(list-data.buildBoardContext 가 걸러 준다).
 */
export async function PostBoardContext({
  boardName,
  slice,
  currentId,
  listHref,
  locale,
  labels,
}: {
  /** 헤더 h2 — 하위 게시판까지 내려간 이름(예: "학부 공지") */
  boardName: string;
  slice: BoardSlice<BoardRow>;
  currentId: string;
  /** 목록 경로(+ `?cat=…` 포함 가능). 로케일 접두어는 Link 가 붙인다. */
  listHref: string;
  locale: Locale;
  labels: PostBoardContextLabels;
}) {
  const t = await getTranslations({ locale, namespace: 'board' });

  // 글이 하나도 없는 게시판이면 그릴 것이 없다(빈 표 + 빈 페이지네이션은 소음일 뿐)
  if (slice.total === 0) return null;

  const pinLabel = t('pinned');

  return (
    <>
      {/* (A) 이전 글 / 다음 글 — 좌우 두 칸, 모바일은 위아래 두 줄 */}
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
              <span aria-hidden="true">‹ </span>
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
              <span aria-hidden="true"> ›</span>
            </>
          }
        />
      </nav>

      {/* (B) 같은 게시판 목록 — 현재 글을 강조한 한 페이지 */}
      <section aria-labelledby={HEADING_ID} className="mt-16">
        <div className="flex items-baseline justify-between gap-4 pb-3">
          <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
            <h2
              id={HEADING_ID}
              // 사이트의 소제목 서체(Paperlogy) — TabPageShell 소제목과 같은 계열로 맞춘다
              style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
              className="text-lg font-semibold tracking-[-0.02em] text-content sm:text-xl"
            >
              {boardName}
            </h2>
            <span className="whitespace-nowrap text-xs tabular-nums text-content-faint sm:text-[13px]">
              {labels.total}
            </span>
          </div>
          <Link
            href={listHref}
            prefetch={false}
            className="whitespace-nowrap text-[13px] font-semibold text-yonsei-blue hover:underline"
          >
            {/* 좁은 화면에서는 짧은 문구 — 제목·건수와 한 줄에 서야 한다 */}
            <span className="sm:hidden">{labels.viewAllShort}</span>
            <span className="hidden sm:inline">{labels.viewAll}</span>
            {' →'}
          </Link>
        </div>

        <div aria-hidden="true" className="h-0.5 bg-yonsei-navy" />

        <ul>
          {slice.rows.map((row) => {
            const isCurrent = row.id === currentId;
            // 행 높이는 고정(모바일 68 / 데스크톱 48)이다 — 제목이 길면 줄바꿈이 아니라
            // 말줄임. 높이가 들쭉날쭉하면 "목록을 훑는" 리듬이 깨진다.
            const inner = cn(
              'flex h-[68px] flex-col justify-center gap-1.5 sm:grid sm:h-12 sm:grid-cols-[minmax(0,1fr)_92px] sm:items-center sm:gap-5',
              // 좌측 룰은 안쪽 요소에, 바탕색은 li 에 — 룰이 바탕 왼쪽 끝에 붙어야 한다
              (row.pinned || isCurrent) && 'border-l-2 border-yonsei-navy pl-3',
            );
            const body = (
              <>
                <span className="flex min-w-0 items-center gap-2.5">
                  {row.pinned && <PinBadge label={pinLabel} className="hidden sm:inline-flex" />}
                  <span
                    className={cn(
                      'truncate text-[15px] leading-[1.4]',
                      isCurrent ? 'font-bold text-yonsei-navy' : 'font-medium',
                    )}
                  >
                    {row.title}
                  </span>
                </span>
                <span className="flex items-center gap-2 sm:justify-end">
                  {row.pinned && <PinBadge label={pinLabel} className="inline-flex sm:hidden" />}
                  {row.date && (
                    <time
                      dateTime={row.date}
                      className="whitespace-nowrap text-xs tabular-nums text-content-faint sm:text-[13px]"
                    >
                      {formatDate(row.date, locale)}
                    </time>
                  )}
                </span>
              </>
            );

            return (
              <li
                key={row.id}
                className={cn(
                  'border-b border-surface-border',
                  row.pinned && 'bg-surface-soft',
                  isCurrent && 'bg-yonsei-blue/[0.06]',
                )}
              >
                {isCurrent ? (
                  // 지금 보고 있는 글은 링크가 아니다 — 제자리로 가는 링크는 막다른 길이다
                  <div className={inner} aria-current="page">
                    {body}
                  </div>
                ) : row.href ? (
                  <Link
                    href={row.href}
                    // 상세 페이지에서 열 개 라우트를 미리 당겨오지 않는다
                    prefetch={false}
                    className={cn(
                      inner,
                      'transition-colors hover:text-yonsei-blue',
                      // 고정 글은 이미 옅은 바탕이라 같은 색으로 호버하면 반응이 없어 보인다
                      row.pinned ? 'hover:bg-yonsei-blue/[0.06]' : 'hover:bg-surface-soft',
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={inner}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>

        <BoardPagination
          page={slice.page}
          pageCount={slice.pageCount}
          hrefTemplate={pageHrefTemplate(listHref)}
        />
      </section>
    </>
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
    <span className="text-[11px] font-bold tracking-[0.06em] text-content-faint">{label}</span>
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

/**
 * 고정 글 핀 배지 — BoardList 의 것과 **같은 마크업·같은 클래스**다. 목록 화면과
 * 상세 하단 목록이 다르게 생기면 같은 게시판인지 의심하게 된다.
 *
 * 한 행에 두 번 그리고 뷰포트로 하나만 남기는 이유: 데스크톱은 제목 앞, 모바일은
 * 둘째 줄 날짜 옆이 자리인데 둘이 서로 다른 그리드 칸이라 CSS 만으로 옮길 수 없다.
 */
function PinBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 items-center gap-1.5 border border-yonsei-navy bg-surface px-2 py-[0.125rem] text-[11px] font-bold text-yonsei-navy',
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 fill-current">
        <path d="M16 3v2l-1 1v5l3 3v2h-5v5l-1 1-1-1v-5H6v-2l3-3V6L8 5V3h8Z" />
      </svg>
      {label}
    </span>
  );
}
