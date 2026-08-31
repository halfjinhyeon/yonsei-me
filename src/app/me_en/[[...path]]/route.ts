/**
 * 구 학과 사이트의 영문 미러(me.yonsei.ac.kr/me_en/…) URL → 새 사이트 1홉 308 리졸버.
 *
 * 지니웍스 CMS 가 한국어 `/me/…` 와 영문 `/me_en/…` 두 프리픽스를 같은 꼬리 구조로
 * 냈다(`me_en/community/news.do`, `me_en/privacy.do` …). 그래서 매핑 표와 분기는
 * lib/legacy-me.ts 하나를 그대로 쓰고, 목적지 로케일만 `/en` 으로 준다.
 */
import type { NextRequest } from 'next/server';
import { resolveLegacyDo } from '@/lib/legacy-me';

// 답이 경로가 아니라 **쿼리**로 갈린다(같은 notice.do 가 목록도 되고 글 상세도 된다).
// 정적 평가로 한 답이 굳으면 전 요청이 같은 곳으로 가므로 요청마다 계산한다.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return resolveLegacyDo(req, params.path, 'en');
}
