// 번역 프록시 라우트 (DeepL) — 관리자 콘솔 "번역 채우기" 버튼 전용.
//
// 비밀 키(DEEPL_API_KEY)를 브라우저에 노출하지 않도록 서버에서만 DeepL 을 호출한다.
// 콘솔은 인증 게이트 뒤에 있으므로, 프로덕션에서는 세션이 있어야 호출을 허용한다
// (배포본에서 익명 호출로 무료 할당량이 소진되는 것을 막는다). dev 개방 모드
// (NODE_ENV!=='production')에서는 세션 없이도 허용해 로컬 검증을 막지 않는다.

import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 한 번에 번역할 최대 길이 (남용·과금 방지) */
const MAX_LEN = 6000;

interface Body {
  text?: string;
  target?: 'EN' | 'KO';
}

export async function POST(req: Request): Promise<Response> {
  // 프로덕션에서는 로그인 세션 필수 (dev 개방 모드는 통과)
  if (process.env.NODE_ENV === 'production') {
    const session = await auth();
    if (!session) {
      return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
  }

  const key = process.env.DEEPL_API_KEY?.trim();
  if (!key) {
    return Response.json(
      { error: '번역이 설정되지 않았습니다. 관리자에게 DEEPL_API_KEY 설정을 요청하세요.' },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  if (!text) {
    return Response.json({ error: '번역할 원문이 비어 있습니다.' }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return Response.json(
      { error: `한 번에 ${MAX_LEN.toLocaleString()}자까지 번역할 수 있습니다.` },
      { status: 400 },
    );
  }

  const target = body.target === 'KO' ? 'KO' : 'EN-US';
  const source = body.target === 'KO' ? 'EN' : 'KO';

  // 무료 키(":fx")는 api-free, 유료 키는 api 엔드포인트를 쓴다.
  const endpoint = key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text,
        source_lang: source,
        target_lang: target,
      }),
    });

    if (!res.ok) {
      const detail =
        res.status === 403
          ? 'DeepL 인증 실패 (403). API 키를 확인하세요.'
          : res.status === 456
            ? 'DeepL 번역 할당량을 모두 사용했습니다 (456).'
            : `번역 서비스 오류 (HTTP ${res.status}).`;
      return Response.json({ error: detail }, { status: 502 });
    }

    const data = (await res.json()) as { translations?: { text: string }[] };
    const translation = data.translations?.[0]?.text ?? '';
    return Response.json({ translation });
  } catch {
    return Response.json({ error: '번역 요청에 실패했습니다.' }, { status: 502 });
  }
}
