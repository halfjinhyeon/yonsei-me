// 관리자 콘솔 전용 콘텐츠 저장 클라이언트 — 백엔드 전환 Stage C. (클라이언트에서만 사용)
//
// 구 github.ts(브라우저 → GitHub Contents API 직접 커밋 → Vercel 재배포 1~2분)를
// 대체했다(그 파일은 제거됨 — 타입과 시그니처는 여기로 옮겨 호환을 유지한다).
// 읽기·쓰기 모두 같은 출처의 /api/admin/content 를 거치고, 서버가 Supabase
// content_files 를 갱신한 뒤 revalidateTag('content') 를 호출해 재배포 없이 수 초 내
// 사이트에 반영된다. 브라우저는 저장소 토큰을 더 이상 쓰지 않는다(세션으로 인증).
//
// ⚠️ 함수 시그니처는 구 github.ts 와 일부러 똑같이 맞췄다 — 호출부(CollectionEditor·
// MarkdownEditor·AdminDashboard) 디프를 최소화하기 위한 호환이다. 그래서
// RepoConfig 인자와 커밋 메시지 인자를 받되 사용하지 않는다(아래 각 함수 주석 참고).
// sha 자리에는 GitHub blob sha 대신 행 버전(version)의 문자열이 들어간다
// (빈 문자열 = 버전 없음 = dev 로컬 파일 저장 — 충돌 검사를 하지 않는다).
//
// (한국어 문자열은 내부 운영 도구의 UI 문구라 모듈에 직접 둔다.)

/** 구 GitHub 커밋 경로의 저장소 설정 — 이제 UI 라벨과 dev 판별(token 유무)에만 쓰인다 */
export interface RepoConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

/** 파일 로드 결과: 파싱된 값과 저장에 필요한 최신 sha(=행 버전 문자열) */
export interface LoadedFile<T> {
  data: T;
  sha: string;
}

/** 저장 성공 응답 중 호출부가 쓰는 필드 (htmlUrl 은 GitHub 커밋 링크 자리 — 항상 빈 문자열) */
export interface CommitResult {
  sha: string;
  htmlUrl: string;
}

const API = '/api/admin/content';

/** 서버가 만든 오류 문구를 그대로 던진다 — 409 문구도 서버 것을 그대로 쓴다
 *  (CollectionEditor 의 충돌 모달이 문구 안의 '409' 로 감지한다). */
async function throwError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) message = body.error;
  } catch {
    /* 본문 파싱 실패는 무시하고 기본 문구 */
  }
  throw new Error(message);
}

interface GetResult {
  content: string;
  version: number | null;
}

/** 파일 원문을 읽는다. 없으면(404) null */
async function getFile(path: string): Promise<GetResult | null> {
  const res = await fetch(`${API}?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) await throwError(res, `콘텐츠를 불러오지 못했습니다 (HTTP ${res.status}).`);
  return (await res.json()) as GetResult;
}

/** 행 버전 → sha 자리 문자열. 버전이 없으면(dev) 빈 문자열 */
function shaOf(version: number | null | undefined): string {
  return version == null ? '' : String(version);
}

/** 텍스트 파일(마크다운 등)을 로드해 문자열과 sha(=버전)를 반환.
 *  _cfg 는 시그니처 호환용으로만 받는다(인증은 서버 세션이 한다). */
export async function loadText(_cfg: RepoConfig, path: string): Promise<LoadedFile<string>> {
  const file = await getFile(path);
  if (!file) throw new Error(`파일을 찾을 수 없습니다: ${path}`);
  return { data: file.content, sha: shaOf(file.version) };
}

/** loadText 와 같되 파일이 없으면(404) null — 새 파일 생성 플로우 지원 */
export async function loadTextOptional(
  _cfg: RepoConfig,
  path: string,
): Promise<LoadedFile<string> | null> {
  const file = await getFile(path);
  if (!file) return null;
  return { data: file.content, sha: shaOf(file.version) };
}

/** JSON 파일을 로드해 파싱된 값과 sha(=버전)를 반환 */
export async function loadJson<T>(cfg: RepoConfig, path: string): Promise<LoadedFile<T>> {
  const file = await loadText(cfg, path);
  return { data: JSON.parse(file.data) as T, sha: file.sha };
}

/** loadJson 과 같되 파일이 없으면(404) null — 아직 만들어지지 않은 공유 파일 지원
 *  (연구실 AI 요약처럼 항목 폼이 곁들여 편집하는 파일은 없을 수도 있다) */
export async function loadJsonOptional<T>(
  cfg: RepoConfig,
  path: string,
): Promise<LoadedFile<T> | null> {
  const file = await loadTextOptional(cfg, path);
  if (!file) return null;
  return { data: JSON.parse(file.data) as T, sha: file.sha };
}

/**
 * 텍스트 파일을 저장한다. sha 가 비어 있으면 신규 생성 의도로 보낸다(서버가 insert).
 * _message 는 시그니처 호환용으로만 받는다 — 저장이 Git 커밋이 아니라 행 갱신이라
 * 커밋 메시지를 쓸 자리가 없다(호출부 디프를 줄이려 인자는 남겼다).
 */
export async function commitText(
  _cfg: RepoConfig,
  path: string,
  text: string,
  sha: string | undefined,
  _message: string,
): Promise<CommitResult> {
  const res = await fetch(API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      content: text,
      ...(sha ? { expectedVersion: Number(sha) } : {}),
    }),
  });
  if (!res.ok) await throwError(res, `저장에 실패했습니다 (HTTP ${res.status}).`);
  const body = (await res.json()) as { version: number | null };
  // htmlUrl 은 GitHub 커밋 링크 자리였다 — 커밋이 없으므로 항상 빈 문자열이다
  return { sha: shaOf(body.version), htmlUrl: '' };
}

/** JSON 을 저장한다. 직렬화는 github.ts 와 동일(2칸 들여쓰기 + 끝 개행) */
export async function commitJson<T>(
  cfg: RepoConfig,
  path: string,
  data: T,
  sha: string,
  message: string,
): Promise<CommitResult> {
  return commitText(cfg, path, `${JSON.stringify(data, null, 2)}\n`, sha, message);
}

/** 저장 성공 배너 내용. dev(로컬 파일)와 프로덕션(DB + 태그 무효화) 모두 즉시
 *  반영이라 문구가 하나다 — 재배포를 기다리라는 안내는 이제 거짓이다.
 *  _cfg 는 시그니처 호환용. */
export function savedBanner(_cfg: RepoConfig): { message: string; url: string } {
  return { message: '저장했습니다 — 사이트에 곧(수 초 내) 반영됩니다.', url: '' };
}
