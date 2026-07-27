// 첨부파일 표기 헬퍼 — 자료실 목록("PDF · 1.2MB")과 게시물 상세의 첨부 줄이 공유한다.
// 크기 규칙은 디자인 시안 그대로: 1024KB 미만은 KB 정수, 그 이상은 MB 소수 첫째 자리.

/** 바이트 → "82KB" / "1.2MB". 0·음수·비유한값은 표기 대상이 아니므로 null. */
export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  const kb = Math.max(1, Math.round(bytes / 1024));
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${kb}KB`;
}

/** 여러 첨부의 합계 크기 표기. 크기를 아는 것만 더한다(하나도 모르면 null). */
export function formatTotalBytes(sizes: (number | undefined)[]): string | null {
  const total = sizes.reduce<number>((sum, s) => sum + (s && s > 0 ? s : 0), 0);
  return formatBytes(total);
}

// 확장자는 파일명 끝의 1~5자 영숫자만 인정한다 — "…신청서(수정).hwp" 처럼 괄호가
// 섞인 실제 파일명에서도 마지막 점 뒤만 잡히고, "정보.do" 같은 오탐은 뒤에서 거른다.
const EXT_RE = /\.([a-z0-9]{1,5})$/i;

/** 문서 첨부에서 실제로 나오는 확장자만 형식 배지로 승격한다(그 외는 표기 생략) */
const KNOWN_EXT = new Set([
  'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'txt', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'mp4',
]);

/**
 * 첨부 라벨(또는 URL)에서 형식 배지를 뽑는다 — "출석인정 신청서.hwp" → "HWP".
 * 라벨을 먼저 보는 이유: 레거시 사이트 첨부 URL 은 `information.do?mode=download&…`
 * 형태라 경로에 확장자가 없다. 판별 불가면 null(형식 없이 날짜만 표기).
 */
export function fileFormat(label: string, href?: string): string | null {
  const fromLabel = EXT_RE.exec(label.trim())?.[1]?.toLowerCase();
  if (fromLabel && KNOWN_EXT.has(fromLabel)) return fromLabel.toUpperCase();
  if (!href) return null;
  let path = href;
  try {
    path = new URL(href, 'https://x.invalid').pathname;
  } catch {
    /* 상대 경로·비정상 URL 은 원문 그대로 훑는다 */
  }
  const fromHref = EXT_RE.exec(path)?.[1]?.toLowerCase();
  return fromHref && KNOWN_EXT.has(fromHref) ? fromHref.toUpperCase() : null;
}

/**
 * Content-Disposition 헤더에서 파일명을 꺼낸다.
 *
 * 왜 필요한가: ZIP 응답을 blob 으로 받아 `<a download>` 로 저장할 때 브라우저는 서버의
 * Content-Disposition 을 보지 않는다 — `a.download` 에 넣은 문자열이 곧 파일명이다.
 * 그래서 헤더를 직접 파싱해 서버가 지은 이름(한글 포함)을 되살린다.
 * 한글은 `filename*=UTF-8''…`(RFC 5987)로 오므로 그쪽을 먼저 보고, 없으면 ASCII 폴백인
 * `filename="…"` 를 쓴다. 둘 다 없으면 null — 호출부가 자기 기본 이름을 쓰면 된다.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      /* 잘못 인코딩된 헤더는 아래 ASCII 폴백으로 넘어간다 */
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1]?.trim() ?? null;
}
