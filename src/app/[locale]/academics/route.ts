import type { NextRequest } from 'next/server';
import { sectionDefaultHref } from '@/lib/board-links';
import { legacyRedirect } from '@/lib/legacy-resolver';

// `/academics` — 옛 '준비 중' 스텁 자리. 실제 학사 콘텐츠는 학부 섹션이 갖고 있어
// 학부 기본 탭으로 308 보낸다. (페이지의 permanentRedirect 는 next-intl 미들웨어
// rewrite 아래서 200 이 된다 — legacy-resolver 참고)

export function GET(req: NextRequest, { params }: { params: { locale: string } }) {
  return legacyRedirect(req, params.locale, sectionDefaultHref('undergraduate'));
}
