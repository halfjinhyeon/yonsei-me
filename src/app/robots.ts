import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// 검색엔진용 robots.txt → /robots.txt 로 서빙된다.
// 전 페이지 크롤 허용, 관리자 콘솔만 제외, 사이트맵 위치 명시.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 관리자 콘솔(noindex)과 내부 API 는 크롤 대상에서 제외
      disallow: ['/ko/contentmanagement', '/en/contentmanagement', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
