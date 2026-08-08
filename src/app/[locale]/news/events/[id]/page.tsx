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
  return boardPostMetadata({ locale: params.locale, id: params.id, board: 'events' });
}

/** 행사 글 상세 */
export default function EventPostPage({ params }: { params: { locale: string; id: string } }) {
  setRequestLocale(params.locale);
  return <BoardPostDetail locale={params.locale} id={params.id} board="events" />;
}
