// 첨부파일 서버 경유 업로드 라우트 (같은 출처 → 서버가 R2 에 대신 저장).
//
// 왜 서버 경유인가: 브라우저가 스토리지 호스트로 직접 업로드하는 방식은 일부
// 사내·캠퍼스망(프록시·백신의 HTTPS 검사)이 HTTP/2 흐름제어를 망가뜨려 업로드
// 중간(예: 74%)에서 멈춘다. 사이트 GET 은 잘 되는 같은 출처이므로, 파일을 이
// 라우트로 보내 서버가 R2 에 저장하면(서버→R2 는 프록시 바깥) 그런 환경에서도 안전하다.
//
// 한계: Vercel 서버리스 함수 요청 본문은 4.5MB 제한 — 이 경로는 작은 파일 전용이고
// (클라이언트가 SERVER_RELAY_MAX 이하일 때만 사용), 큰 파일은 /api/upload-url 의
// presigned PUT 으로 직접 업로드한다.
//
// 보안: 프로덕션은 Auth.js 세션(=GitHub allowlist) 필수, 경로 접두어(uploads/)·
// 용량·MIME 를 서버에서 재검증(upload-validate 공유 규칙). dev 는 CMS 개방 모드라
// 우회하지만, 로컬 dev 의 기본 저장은 /api/dev-content 폴백이라 여기 도달하지 않는다.

import { auth } from '@/auth';
import { r2Put, withRandomSuffix } from '@/lib/admin/r2';
import { SERVER_RELAY_MAX, validateUpload } from '@/lib/admin/upload-validate';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const devBypass = process.env.NODE_ENV !== 'production';
    if (!devBypass) {
      const session = await auth();
      if (!session?.user) {
        return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
      }
    }

    // pathname 은 한글 파일명을 담을 수 있어 클라이언트가 퍼센트 인코딩해 보낸다(헤더는 Latin-1 전용)
    let pathname: string;
    try {
      pathname = decodeURIComponent(request.headers.get('x-upload-pathname') ?? '');
    } catch {
      return Response.json({ error: '업로드 경로가 올바르지 않습니다.' }, { status: 400 });
    }

    const check = validateUpload(pathname, request.headers.get('content-type'));
    if (!check.ok) {
      return Response.json({ error: check.error }, { status: check.status });
    }

    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) {
      return Response.json({ error: '빈 파일입니다.' }, { status: 400 });
    }
    if (bytes.byteLength > SERVER_RELAY_MAX) {
      return Response.json(
        { error: '4MB 이하 파일만 서버 경유로 올릴 수 있습니다.' },
        { status: 413 },
      );
    }

    // 파일명 충돌·추측 방지 접미사 후 R2 저장 → 공개 URL 반환
    const key = withRandomSuffix(pathname);
    const url = await r2Put(key, Buffer.from(bytes), check.contentType);
    return Response.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업로드에 실패했습니다.';
    console.error('[api/upload-file] R2 저장 실패:', message, {
      hasR2Keys: Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_ACCOUNT_ID),
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
