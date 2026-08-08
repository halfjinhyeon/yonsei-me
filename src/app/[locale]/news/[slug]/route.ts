import type { NextRequest } from 'next/server';
import { fetchNewsBySlug } from '@/lib/posts';
import { newsArticleHref } from '@/lib/board-links';
import { legacyRedirect, legacyNotFound } from '@/lib/legacy-resolver';

// 구 뉴스 기사 주소 `/news/<slug>` → `/news/press/<slug>` 308 리졸버.
// 정적 탭 폴더(notices, press, …)가 우선 매칭되므로 여기는 잔여 slug 만 받는다
// (RESERVED_NEWS_SLUGS — slug 가 탭 이름과 같으면 영구히 가려지니 CMS 에서 거부).
// 없는 글은 목적지로 떠넘기지 않고 여기서 404 한다.

export async function GET(
  req: NextRequest,
  { params }: { params: { locale: string; slug: string } },
) {
  const item = await fetchNewsBySlug(params.slug);
  if (!item) return legacyNotFound(params.locale);
  return legacyRedirect(req, params.locale, newsArticleHref(params.slug));
}
