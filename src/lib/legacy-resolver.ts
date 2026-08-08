/**
 * 구 URL 리졸버 공용 도우미 (Route Handler 전용).
 *
 * 왜 페이지가 아니라 Route Handler 인가: next-intl 미들웨어가 모든 요청에 rewrite 를
 * 거는데, Next 14 는 rewrite 된 **페이지** 렌더에서 `permanentRedirect()`/`notFound()` 의
 * 상태코드를 잃고 200 을 내보낸다(프로덕션 실측). Route Handler 는 자체 Response 를
 * 그대로 반환하므로 308/404 가 온전히 나간다 — 구 URL 의 색인·백링크 이전은 정확한
 * 상태코드가 목적이라 이 경로를 쓴다.
 */

/** 로케일 없는 새 경로(board-links 헬퍼 산출물)로 308 영구 이동 */
export function legacyRedirect(req: Request, locale: string, path: string): Response {
  return Response.redirect(new URL(`/${locale}${path}`, req.url), 308);
}

/**
 * 없는 글의 구 URL — 목적지로 떠넘기지 않고 여기서 404 한다.
 * Route Handler 라 [locale]/not-found.tsx 를 못 빌린다: 죽은 옛 링크에 도달하는 드문
 * 경우이므로, 홈으로 가는 링크 하나를 담은 최소 문서로 충분하다(상태코드가 본질).
 */
export function legacyNotFound(locale: string): Response {
  const ko = locale === 'ko';
  const title = ko ? '페이지를 찾을 수 없습니다' : 'Page not found';
  const home = ko ? '홈으로 돌아가기' : 'Back to home';
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>404 · ${title}</title></head><body style="font-family:sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0"><main style="text-align:center"><p style="font-size:56px;font-weight:700;color:#003377;margin:0">404</p><h1 style="font-size:20px;font-weight:600">${title}</h1><p><a href="/${locale}" style="color:#0057A8">${home}</a></p></main></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
