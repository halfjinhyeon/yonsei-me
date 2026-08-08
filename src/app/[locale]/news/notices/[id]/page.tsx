import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { BoardPostDetail, boardPostMetadata } from '../../_shared/BoardPostDetail';

// DB 소스 전환(Phase 2): 요청 시 렌더 + ISR (revalidateTag('posts') 가 즉시 갱신)
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  return boardPostMetadata({ locale: params.locale, id: params.id, board: 'notices' });
}

/** 공지사항 글 상세 — 다른 게시판 글이 이 주소로 오면 빌더가 제 주소로 308 한다 */
export default function NoticePostPage({ params }: { params: { locale: string; id: string } }) {
  setRequestLocale(params.locale);
  return <BoardPostDetail locale={params.locale} id={params.id} board="notices" />;
}
