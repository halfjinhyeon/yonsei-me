/**
 * 게시판 페이지 나눔 규칙 — 목록 화면(FilterableBoardList)의 페이지 크기와, 게시물
 * 하단 이전/다음 글(PostBoardContext)이 쓰는 위치 계산을 여기 한 곳에서 선언한다.
 * (상세 하단의 '같은 게시판 목록'은 제거됐지만, locateInBoard 의 slice 가 이전/다음
 * 글을 뽑는 단일 통로라는 사실은 그대로다.)
 */

/** 한 페이지에 싣는 글 수 — 행 높이 ~180px 기준으로 한 페이지가 대략 2,000px.
 *  이보다 길어지면 "스크롤로 끝까지 훑는" 목록이 되어 페이지 넘김의 의미가 사라진다. */
export const BOARD_PAGE_SIZE = 10;

/** 현재 글이 놓인 페이지 한 장 + 앞뒤 글 */
export interface BoardSlice<T> {
  /** 현재 글이 속한 페이지의 행들 */
  rows: T[];
  /** 1-based */
  page: number;
  pageCount: number;
  /** 게시판 전체 글 수(페이지가 아니라 게시판 기준) */
  total: number;
  prev?: T;
  next?: T;
}

/**
 * 목록에서 현재 글의 자리를 찾아 그 페이지와 앞뒤 글을 뽑는다.
 *
 * ⚠️ 배열은 **최신순**이다 — '이전 글'은 목록에서 한 칸 **아래**(더 오래된 글, index+1),
 *    '다음 글'은 한 칸 **위**(더 최근 글, index-1). 직관과 부호가 반대라 뒤집기 쉬운
 *    자리다. 고정 글(pinned)이 위로 끌어올려진 목록에서도 "목록에서 보이는 앞뒤"가
 *    되도록 정렬된 배열 그대로를 기준으로 삼는다.
 */
export function locateInBoard<T extends { id: string }>(
  rows: T[],
  currentId: string,
  pageSize: number = BOARD_PAGE_SIZE,
): BoardSlice<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const index = rows.findIndex((r) => r.id === currentId);

  // 목록에 없는 글(분류가 어긋났거나 목록에서 빠진 글)도 하단 목록은 그려야 한다 —
  // 1페이지로 떨어뜨리고 이전/다음만 생략한다. 여기서 던지면 상세 페이지가 통째로 죽는다.
  if (index < 0) {
    return { rows: rows.slice(0, pageSize), page: 1, pageCount, total };
  }

  const page = Math.floor(index / pageSize) + 1;
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
    total,
    prev: rows[index + 1],
    next: rows[index - 1],
  };
}
