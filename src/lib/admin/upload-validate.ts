// 업로드 공통 검증 — 서버 경유(/api/upload-file)와 presigned(/api/upload-url)가
// 동일한 경로·용량·MIME 규칙을 공유한다(규칙이 갈라지면 우회 구멍이 생긴다).

/** 첨부 허용 최대 크기 (이미지는 클라이언트에서 압축 후 도착) */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

/** 서버 경유 최대 크기 — Vercel 함수 본문 한도(4.5MB) 안쪽 */
export const SERVER_RELAY_MAX = 4 * 1024 * 1024;

/** 허용 MIME — 이미지·문서류. 관리자 전용이라 과도하게 좁히지 않는다. */
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/haansofthwp',
  'application/x-hwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/octet-stream', // hwp 등 브라우저가 타입을 모르는 문서
];

/** 브라우저가 실행·렌더할 수 있어 저장을 거부하는 타입 (스토리지 도메인 피싱·XSS 예방) */
const BLOCKED_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
]);

/** 확장자 기반 안전목록 — 브라우저 MIME 추정이 제각각인 문서·이미지·압축.
 *  (특히 hwp/hwpx 는 시스템마다 빈 값·x-hwp·vnd.hancom.hwp 등으로 다르다) */
const SAFE_EXTENSIONS = new Set([
  'hwp', 'hwpx', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'txt', 'csv', 'jpg', 'jpeg', 'png', 'webp', 'gif',
]);

export type UploadValidation =
  | { ok: true; contentType: string }
  | { ok: false; status: number; error: string };

/**
 * 경로·타입 공통 검증. 통과 시 실제 저장할 contentType 을 확정해 돌려준다
 * (명시 허용 타입은 그대로, 확장자로 구제된 타입은 octet-stream 으로 강등).
 */
export function validateUpload(pathname: string, rawContentType: string | null): UploadValidation {
  if (!pathname.startsWith('uploads/')) {
    return { ok: false, status: 400, error: '허용되지 않은 업로드 경로입니다.' };
  }
  const rawType = (rawContentType ?? '').split(';')[0].trim().toLowerCase();
  if (BLOCKED_TYPES.has(rawType)) {
    return { ok: false, status: 415, error: '허용되지 않은 파일 형식입니다.' };
  }
  const ext = (pathname.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const typeAllowed = ALLOWED_TYPES.includes(rawType);
  if (!typeAllowed && !SAFE_EXTENSIONS.has(ext)) {
    return { ok: false, status: 415, error: '허용되지 않은 파일 형식입니다.' };
  }
  return { ok: true, contentType: typeAllowed ? rawType : 'application/octet-stream' };
}
