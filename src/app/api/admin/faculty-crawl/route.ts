// 교수 학술활동 수집 API — CMS 의 "실적 불러오기" 버튼이 쓰는 라우트.
//
// 왜 **한 명씩** 인가
//   33명을 한 요청에서 돌면 3~5초 × 33 ≈ 2~3분이라 Vercel 함수 상한(60초)을 넘는다.
//   그래서 서버는 한 명만 처리하고, 브라우저가 명단을 받아 순차로 호출한다. 덕분에
//   "교수별로 한 줄씩 결과가 쌓이는" 화면이 스트리밍 없이 그대로 나온다(응답 하나 = 한 줄).
//   무인 전량 수집은 지금처럼 GitHub Actions 배치(tools/crawl-faculty-profiles.mjs)가 맡는다.
//
// 안전
//   수집은 **병합 전용**이다(core.crawlPerson). 기존 행·CMS 편집분·AI 요약을 지우지 않는다.
//   그래서 중간에 창을 닫아도 데이터가 반쯤 망가지는 상태가 없다 — 다시 누르면 이어서 된다.

import { requireAdmin } from '@/lib/admin/posts-server';
import { crawlPerson, serializeProfile } from '@/lib/faculty-crawl/core';
import { isValidProfileName, listTargets, openStore } from '@/lib/faculty-crawl/server';

export const runtime = 'nodejs';
/** 한 명 = 상세 1 + 리포트 5(+2쪽) 요청, 지연 포함 3~5초. 느린 응답까지 감안해 상한을 준다. */
export const maxDuration = 60;

/** GET /api/admin/faculty-crawl — 수집 대상 명단과 마지막 수집일 */
export async function GET(): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const targets = await listTargets(openStore());
    const dates = targets.map((t) => t.crawledAt).filter((d): d is string => Boolean(d));
    return Response.json({
      targets: targets.map((t) => ({ name: t.name, crawledAt: t.crawledAt })),
      // 명단 전체의 마지막 수집일 = 가장 최근 값(문자열 비교로 충분한 YYYY-MM-DD)
      lastCrawledAt: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

interface PostBody {
  name?: string;
}

/** POST /api/admin/faculty-crawl { name } — 교수 한 명 수집·병합·저장 */
export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!isValidProfileName(name)) {
    return Response.json({ error: '교수 이름이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const store = openStore();
    const target = (await listTargets(store)).find((t) => t.name === name);
    if (!target) {
      return Response.json(
        {
          error:
            '교원정보시스템 링크가 없어 수집할 수 없습니다. 교수진 편집의 "상세 정보 URL"을 채워 주세요.',
        },
        { status: 404 },
      );
    }

    const result = await crawlPerson(target, await store.read(name));
    if (!result.merged) {
      return Response.json(
        {
          error: '교원정보시스템에서 응답을 받지 못했습니다.',
          failures: result.failures,
        },
        { status: 502 },
      );
    }

    const serialized = serializeProfile(result.merged);
    const changed = serialized !== (await store.raw(name));
    if (changed) await store.write(name, serialized);

    return Response.json({
      name: result.name,
      added: result.added,
      addedByKey: result.addedByKey,
      totalByKey: result.totalByKey,
      addedItems: result.addedItems,
      missing: result.missing,
      failures: result.failures,
      changed,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
