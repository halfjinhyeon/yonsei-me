import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';
import {
  fetchNews,
  fetchAllBoardPosts,
  fetchAlumniNews,
  fetchAlumniEvents,
} from '@/lib/posts';
import { getClubs } from '@/lib/faculty';

// 검색엔진용 XML 사이트맵 → /sitemap.xml
// 기존 metadata route(sitemap.ts) 대신 커스텀 핸들러를 쓰는 이유: 사람이 브라우저로
// 열었을 때 사이트 디자인으로 렌더되도록 XSL 스타일시트(/sitemap.xsl) 처리 지시문을
// 붙이기 위해서다(크롤러는 PI 를 무시하므로 SEO 동작은 동일).
// 게시판(DB) 항목 포함 — ISR 로 주기 갱신.
export const revalidate = 300;

/** XML 특수문자 이스케이프 (URL 은 자체 데이터지만 방어적으로) */
function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export async function GET() {
  const now = new Date().toISOString();
  const urls: string[] = [];

  // 로케일별로 같은 경로를 추가 (localePrefix: 'always')
  const addAll = (path: string) => {
    for (const locale of routing.locales) {
      const suffix = path ? `/${path}` : '';
      urls.push(`${SITE_URL}/${locale}${suffix}`);
    }
  };

  // 공개 정적 경로 (관리자 콘솔은 noindex 라 제외)
  const STATIC_PATHS = [
    '',
    'about',
    'undergraduate',
    'graduate',
    'research',
    'news',
    'alumni',
    'faculty',
    'faculty-recruitment',
    'contact',
    'sitemap',
  ];
  for (const p of STATIC_PATHS) addAll(p);

  // 동적 페이지 — 게시판 데이터 레이어(db/git)에서 열거
  for (const n of await fetchNews()) addAll(`news/${n.slug}`);
  for (const post of await fetchAllBoardPosts()) addAll(`news/post/${post.id}`);
  for (const club of getClubs()) addAll(`undergraduate/clubs/${club.slug}`);
  for (const a of await fetchAlumniNews()) addAll(`alumni/news/${a.slug}`);
  for (const e of await fetchAlumniEvents()) addAll(`alumni/post/${e.id}`);

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) => `  <url><loc>${esc(u)}</loc><lastmod>${now}</lastmod></url>`,
    ),
    '</urlset>',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
