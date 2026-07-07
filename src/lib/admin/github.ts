// 관리자 콘솔 전용 GitHub Contents API 클라이언트.
// 정적 사이트라 서버 DB가 없어 "Git이 곧 DB" — 브라우저에서 토큰으로 직접
// content/*.json을 읽고 커밋한다. 이 파일은 클라이언트에서만 사용된다.
//
// 콘텐츠/코드 분리 원칙(비개발자가 content/*.json을 편집)은 "사이트 콘텐츠"에
// 적용되는 규칙이다. 여기의 한국어 문자열은 내부 운영 도구(UI/커밋 메시지)라
// 컴포넌트/모듈에 직접 두는 것이 의도된 예외다.

export interface RepoConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

/** GitHub Contents API 응답 중 우리가 쓰는 필드 */
interface ContentsResponse {
  content: string;
  encoding: string;
  sha: string;
}

/** 파일 로드 결과: 파싱된 JSON과 커밋에 필요한 최신 sha */
export interface LoadedFile<T> {
  data: T;
  sha: string;
}

/** PUT 커밋 성공 응답 중 우리가 쓰는 필드 */
export interface CommitResult {
  sha: string;
  htmlUrl: string;
}

const API_BASE = 'https://api.github.com';

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** 상태 코드를 한국어 메시지로 변환 (검증/커밋 공용) */
export function describeStatus(status: number): string {
  switch (status) {
    case 401:
      return '토큰이 유효하지 않습니다 (401). 새 토큰을 발급해 다시 시도하세요.';
    case 403:
      return '권한이 부족합니다 (403). 토큰에 이 저장소의 Contents 읽기/쓰기 권한이 있는지 확인하세요.';
    case 404:
      return '저장소 또는 브랜치를 찾을 수 없습니다 (404). owner/repo/branch를 확인하세요.';
    case 409:
      return '파일이 다른 곳에서 변경되었습니다 (409). 새로고침 후 다시 시도하세요.';
    case 422:
      return '요청을 처리할 수 없습니다 (422). 파일이 변경되었거나 브랜치가 잘못되었을 수 있습니다.';
    default:
      return `GitHub 요청이 실패했습니다 (HTTP ${status}).`;
  }
}

/** GitHub 에러 응답 본문에서 메시지를 최대한 뽑아낸다 */
async function readError(res: Response): Promise<string> {
  const base = describeStatus(res.status);
  try {
    const body = (await res.json()) as { message?: string };
    if (body?.message && res.status !== 401 && res.status !== 403 && res.status !== 404) {
      return `${base} (${body.message})`;
    }
  } catch {
    /* 본문 파싱 실패는 무시 */
  }
  return base;
}

// ---- UTF-8 안전 base64 인/디코딩 ----
// GitHub는 파일 내용을 base64로 주고받는다. atob/btoa는 바이트 문자열만
// 다루므로 한글이 깨지지 않도록 TextEncoder/TextDecoder를 거친다.

export function decodeBase64Utf8(base64: string): string {
  // GitHub content에는 줄바꿈이 섞여 오므로 제거
  const clean = base64.replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000; // 큰 문자열에서 스택 초과 방지용 청크
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * 연결 검증: 저장소 접근과 board.json 읽기 권한을 확인한다.
 * 실패 시 상태 코드에 맞는 한국어 메시지를 throw.
 */
export async function verifyConnection(cfg: RepoConfig): Promise<void> {
  const repoRes = await fetch(`${API_BASE}/repos/${cfg.owner}/${cfg.repo}`, {
    headers: headers(cfg.token),
  });
  if (!repoRes.ok) {
    throw new Error(await readError(repoRes));
  }
  const fileRes = await fetch(
    `${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/content/board.json?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: headers(cfg.token) },
  );
  if (!fileRes.ok) {
    throw new Error(await readError(fileRes));
  }
}

/** content/ 아래 파일을 로드해 파싱된 JSON과 sha를 반환 */
export async function loadJson<T>(cfg: RepoConfig, path: string): Promise<LoadedFile<T>> {
  const res = await fetch(
    `${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: headers(cfg.token), cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as ContentsResponse;
  const text = decodeBase64Utf8(body.content);
  return { data: JSON.parse(text) as T, sha: body.sha };
}

/**
 * JSON을 커밋(PUT)한다. data는 프로젝트 컨벤션대로 2칸 들여쓰기 + 끝 개행.
 * 최신 sha를 인자로 받아 충돌(409/422)을 감지한다.
 */
export async function commitJson<T>(
  cfg: RepoConfig,
  path: string,
  data: T,
  sha: string,
  message: string,
): Promise<CommitResult> {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const res = await fetch(`${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(text),
      sha,
      branch: cfg.branch,
    }),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as { commit: { sha: string; html_url: string } };
  return { sha: body.commit.sha, htmlUrl: body.commit.html_url };
}

/** 커밋 SHA로 GitHub 커밋 페이지 URL 생성 */
export function commitUrl(cfg: RepoConfig, sha: string): string {
  return `https://github.com/${cfg.owner}/${cfg.repo}/commit/${sha}`;
}
