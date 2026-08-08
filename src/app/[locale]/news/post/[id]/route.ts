import type { NextRequest } from 'next/server';
import { fetchBoardPost } from '@/lib/posts';
import { boardPostHref } from '@/lib/board-links';
import { legacyRedirect, legacyNotFound } from '@/lib/legacy-resolver';

// 구 게시판 글 주소 `/news/post/<id>` → 소속 게시판 주소 308 리졸버.
// 게시판 글이 전부 이 한 라우트에 살던 때의 링크(공지 메일·외부 인용·검색 색인)를
// 살려 둔다. 목적지는 글의 boardKey 가 정한다 — 뉴스 게시판이면 `/news/<게시판>/<id>`,
// 인턴 모집이면 `/research/internships/<id>`(boardPostHref 가 단일 출처).

export async function GET(
  req: NextRequest,
  { params }: { params: { locale: string; id: string } },
) {
  const post = await fetchBoardPost(params.id);
  if (!post) return legacyNotFound(params.locale);
  return legacyRedirect(req, params.locale, boardPostHref(post));
}
