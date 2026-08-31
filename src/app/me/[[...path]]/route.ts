/**
 * 구 학과 사이트(me.yonsei.ac.kr) URL → 새 사이트 1홉 308 리졸버.
 *
 * 도메인 컷오버 뒤 구글·백링크가 들고 있는 주소는 전부 `/me/…` 로 들어온다(지니웍스
 * CMS 라 확장자가 `.do`, 게시판은 쿼리로 갈린다). 그 요청을 **한 번의 308** 로 새
 * 주소에 내려놓는 것이 이 파일의 전부다.
 *
 * 구 사이트의 영문 미러(`/me_en/…`)는 app/me_en 이 같은 리졸버를 `'en'` 으로 부른다.
 *
 * ⚠️ 왜 페이지가 아니라 Route Handler 인가 / 왜 홈 캐치올이 없는가는
 *    lib/legacy-resolver.ts 주석 참조(상태코드가 목적이고, 지어낸 목적지는 해가 된다).
 *
 * ⚠️ 1홉 보장의 전제 — 미들웨어 matcher 가 **점이 든 경로를 통과시키지 않는다**.
 *    그래서 `/me/x.do` 는 next-intl 의 로케일 rewrite 없이 여기로 직행한다.
 *    점이 없는 `/me`·`/me/` 만 matcher 에 걸리므로 middleware.ts 상단에서 따로 308 한다
 *    (그 분기가 사라지면 /ko/me 404 가 된다).
 */
import type { NextRequest } from 'next/server';
import { resolveLegacyDo } from '@/lib/legacy-me';

// 답이 경로가 아니라 **쿼리**로 갈린다(같은 notice.do 가 목록도 되고 글 상세도 된다).
// 정적 평가로 한 답이 굳으면 전 요청이 같은 곳으로 가므로 요청마다 계산한다.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return resolveLegacyDo(req, params.path, 'ko');
}
