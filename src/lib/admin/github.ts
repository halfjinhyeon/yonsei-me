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
  const base: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // dev 개방 모드에선 토큰이 없을 수 있다. 이때 인증 헤더를 생략하면 공개
  // 저장소 읽기는 익명으로 동작한다(쓰기는 GitHub 가 401/403 으로 거부).
  return token ? { Authorization: `Bearer ${token}`, ...base } : base;
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
  return base64FromBytes(new TextEncoder().encode(text));
}

/** 원시 바이트를 base64로 (이미지 등 바이너리 업로드용) */
export function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // 큰 파일에서 스택 초과 방지용 청크
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

// ---- dev 로컬 백엔드 ----
// 토큰이 없으면(=dev 개방 모드) GitHub 대신 /api/dev-content 로 라우팅해
// content/* 파일을 로컬에서 직접 읽고 쓴다. rate limit·실제 커밋이 없다.
// 프로덕션에서는 token 이 반드시 존재하므로 이 경로는 dev 에서만 도달한다.

/** 이 설정이 dev 로컬 백엔드를 써야 하는지 (토큰 없음) */
export function isLocalBackend(cfg: RepoConfig): boolean {
  return !cfg.token;
}

async function devError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    /* 무시 */
  }
  return `로컬 파일 작업이 실패했습니다 (HTTP ${res.status}).`;
}

/** 로컬 백엔드에서 파일 로드. 없으면 null. */
async function devLoad(path: string): Promise<LoadedFile<string> | null> {
  const res = await fetch(`/api/dev-content?path=${encodeURIComponent(path)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await devError(res));
  const body = (await res.json()) as { content: string; sha: string };
  return { data: body.content, sha: body.sha };
}

/** 로컬 백엔드에 파일 저장. encoding='base64'면 바이너리(이미지)로 기록한다.
 *  replaceSiblings=true 면 같은 basename 의 다른 확장자 파일을 정리한다. */
async function devCommit(
  path: string,
  content: string,
  opts?: { encoding?: 'base64'; replaceSiblings?: boolean },
): Promise<CommitResult> {
  const res = await fetch('/api/dev-content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      content,
      ...(opts?.encoding ? { encoding: opts.encoding } : {}),
      ...(opts?.replaceSiblings ? { replaceSiblings: true } : {}),
    }),
  });
  if (!res.ok) throw new Error(await devError(res));
  const body = (await res.json()) as { commit: { sha: string; html_url: string } };
  return { sha: body.commit.sha, htmlUrl: body.commit.html_url };
}

/** 저장 성공 배너 내용 — dev 로컬 백엔드와 GitHub 커밋을 구분한다. */
export function savedBanner(cfg: RepoConfig, sha: string): { message: string; url: string } {
  if (isLocalBackend(cfg)) {
    return { message: '로컬 content 파일에 저장했습니다. dev 사이트에 바로 반영됩니다.', url: '' };
  }
  return { message: 'Vercel이 1~2분 내 자동 재배포합니다.', url: commitUrl(cfg, sha) };
}

/** 파일을 로드해 디코딩된 텍스트와 sha를 반환 (내부 공용) */
async function loadRaw(cfg: RepoConfig, path: string): Promise<Response> {
  return fetch(
    `${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: headers(cfg.token), cache: 'no-store' },
  );
}

/** content/ 아래 파일을 로드해 파싱된 JSON과 sha를 반환 */
export async function loadJson<T>(cfg: RepoConfig, path: string): Promise<LoadedFile<T>> {
  const file = await loadText(cfg, path);
  return { data: JSON.parse(file.data) as T, sha: file.sha };
}

/** 텍스트 파일(마크다운 등)을 로드해 문자열과 sha를 반환 */
export async function loadText(cfg: RepoConfig, path: string): Promise<LoadedFile<string>> {
  if (isLocalBackend(cfg)) {
    const file = await devLoad(path);
    if (!file) throw new Error(`파일을 찾을 수 없습니다: ${path}`);
    return file;
  }
  const res = await loadRaw(cfg, path);
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as ContentsResponse;
  return { data: decodeBase64Utf8(body.content), sha: body.sha };
}

/** loadText와 같되 파일이 없으면(404) null — 새 파일 생성 플로우 지원 */
export async function loadTextOptional(
  cfg: RepoConfig,
  path: string,
): Promise<LoadedFile<string> | null> {
  if (isLocalBackend(cfg)) {
    return devLoad(path);
  }
  const res = await loadRaw(cfg, path);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as ContentsResponse;
  return { data: decodeBase64Utf8(body.content), sha: body.sha };
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
  return commitText(cfg, path, `${JSON.stringify(data, null, 2)}\n`, sha, message);
}

/**
 * 텍스트 파일을 커밋(PUT)한다. sha가 undefined면 새 파일을 생성한다.
 * 기존 파일은 최신 sha를 인자로 받아 충돌(409/422)을 감지한다.
 */
export async function commitText(
  cfg: RepoConfig,
  path: string,
  text: string,
  sha: string | undefined,
  message: string,
): Promise<CommitResult> {
  if (isLocalBackend(cfg)) {
    return devCommit(path, text);
  }
  const res = await fetch(`${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(text),
      ...(sha ? { sha } : {}),
      branch: cfg.branch,
    }),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as { commit: { sha: string; html_url: string } };
  return { sha: body.commit.sha, htmlUrl: body.commit.html_url };
}

/** 파일의 현재 sha만 조회한다 (덮어쓰기 커밋에 필요). 없으면 undefined. */
async function getFileSha(cfg: RepoConfig, path: string): Promise<string | undefined> {
  const res = await loadRaw(cfg, path);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as ContentsResponse;
  return body.sha;
}

/**
 * 이미지 파일을 저장소에 업로드(커밋)한다. repoPath 는 저장소 루트 기준
 * (예: public/img/faculty/홍길동.jpg). 이미 있으면 덮어쓴다.
 * dev 로컬 백엔드에서는 로컬 파일로 기록, 아니면 GitHub Contents API 로 커밋.
 */
export async function uploadImageToRepo(
  cfg: RepoConfig,
  repoPath: string,
  file: File,
): Promise<CommitResult> {
  const base64 = base64FromBytes(new Uint8Array(await file.arrayBuffer()));
  const message = `content: 이미지 업로드 — ${repoPath}`;

  if (isLocalBackend(cfg)) {
    return devCommit(repoPath, base64, { encoding: 'base64', replaceSiblings: true });
  }

  const sha = await getFileSha(cfg, repoPath);
  const res = await fetch(`${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${repoPath}`, {
    method: 'PUT',
    headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: base64,
      ...(sha ? { sha } : {}),
      branch: cfg.branch,
    }),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as { commit: { sha: string; html_url: string } };
  // 같은 basename 의 다른 확장자 사진 정리 (교수당 사진 1개 → 이름 매칭 모호성 제거).
  // 실패해도 업로드 자체는 성공이므로 best-effort 로 무시한다.
  await deleteSiblingImages(cfg, repoPath).catch(() => {});
  return { sha: body.commit.sha, htmlUrl: body.commit.html_url };
}

/** repoPath 와 같은 basename 이지만 확장자가 다른 파일들을 삭제한다 (GitHub). */
async function deleteSiblingImages(cfg: RepoConfig, repoPath: string): Promise<void> {
  const slash = repoPath.lastIndexOf('/');
  const folder = repoPath.slice(0, slash);
  const filename = repoPath.slice(slash + 1);
  const stem = filename.replace(/\.[^.]+$/, '');

  const listRes = await fetch(
    `${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${folder}?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: headers(cfg.token), cache: 'no-store' },
  );
  if (!listRes.ok) return; // 폴더 없음(404) 등 → 정리할 형제 없음
  const entries = (await listRes.json()) as {
    name: string;
    path: string;
    sha: string;
    type: string;
  }[];
  const siblings = entries.filter(
    (e) => e.type === 'file' && e.name !== filename && e.name.replace(/\.[^.]+$/, '') === stem,
  );
  for (const s of siblings) {
    await fetch(`${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${s.path}`, {
      method: 'DELETE',
      headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `content: 이전 사진 정리 — ${s.path}`,
        sha: s.sha,
        branch: cfg.branch,
      }),
    });
  }
}

/** 커밋 SHA로 GitHub 커밋 페이지 URL 생성 */
export function commitUrl(cfg: RepoConfig, sha: string): string {
  return `https://github.com/${cfg.owner}/${cfg.repo}/commit/${sha}`;
}
