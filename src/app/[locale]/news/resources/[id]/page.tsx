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
  return boardPostMetadata({ locale: params.locale, id: params.id, board: 'resources' });
}

/** 자료실 글 상세 — 빌더가 '분류(행정 서식/규정)' 메타 줄과 첨부 ZIP 버튼을 함께 세운다 */
export default function ResourcePostPage({ params }: { params: { locale: string; id: string } }) {
  setRequestLocale(params.locale);
  return <BoardPostDetail locale={params.locale} id={params.id} board="resources" />;
}
