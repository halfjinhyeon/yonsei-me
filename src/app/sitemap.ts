import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import {
  fetchNews,
  fetchAllBoardPosts,
  fetchAlumniNews,
  fetchAlumniEvents,
} from '@/lib/posts';
import { getClubs } from '@/lib/faculty';

// 검색엔진용 XML 사이트맵 → /sitemap.xml 로 서빙된다(빌드 시 정적 생성).
// 현재 배포 도메인(구글 서치 콘솔 등록 도메인). 커스텀 도메인 연결 시 이 값만 바꾸면 된다.
const SITE_URL = 'https://yonsei-me.vercel.app';

// 로케일 접두어(/ko, /en) 뒤에 붙는 공개 정적 경로.
// 관리자 콘솔(contentmanagement)은 noindex 라 제외한다.
const STATIC_PATHS = [
  '', // 홈
  'about',
  'undergraduate',
  'graduate',
  'research',
  'news',
  'alumni',
  'faculty',
  'faculty-recruitment',
  'contact',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // 로케일별로 같은 경로를 추가 (localePrefix: 'always' 라 모든 경로가 /ko, /en 접두)
  const addAll = (path: string) => {
    for (const locale of routing.locales) {
      const suffix = path ? `/${path}` : '';
      entries.push({ url: `${SITE_URL}/${locale}${suffix}`, lastModified: now });
    }
  };

  for (const p of STATIC_PATHS) addAll(p);

  // 동적 페이지 — 게시판 데이터 레이어(db/git)에서 열거
  for (const n of await fetchNews()) addAll(`news/${n.slug}`);
  for (const post of await fetchAllBoardPosts()) addAll(`news/post/${post.id}`);
  for (const club of getClubs()) addAll(`undergraduate/clubs/${club.slug}`);
  for (const a of await fetchAlumniNews()) addAll(`alumni/news/${a.slug}`);
  for (const e of await fetchAlumniEvents()) addAll(`alumni/post/${e.id}`);

  return entries;
}
