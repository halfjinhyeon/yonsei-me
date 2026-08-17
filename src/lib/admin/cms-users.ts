// CMS 사용자(허용 계정) 저장소 — Supabase cms_users 테이블 접근 계층.
// 스키마는 scripts/sql/2026-08-cms-users.sql 이 단일 출처.
//
// ⚠️ 이 파일은 '@/auth' 도 'posts-server' 도 import 하지 않는다. auth.ts 의
// 콜백이 이 모듈을 쓰기 때문에 둘 중 하나라도 끌어오면 순환 import 가 된다.
// 그래서 posts-server 의 adminDb 를 재사용하지 않고 같은 10줄 패턴을 복제한다.
//
// 조회·쓰기 함수는 DB 오류를 전부 throw 한다. "허용 계정을 못 읽었을 때 무엇을
// 할지"(env allowlist 폴백이냐 500 이냐)는 호출부마다 답이 달라서, 이 계층이
// 임의로 null 로 눕히면 로그인 차단과 DB 장애를 구분할 수 없게 된다.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type CmsRole = 'admin' | 'editor';

export interface CmsUser {
  id: string;
  name: string;
  role: CmsRole;
  email: string | null;
  githubLogin: string | null;
  kakaoId: string | null;
  /** 카카오 계정 연결 여부 — UI 는 회원번호 자체를 쓸 일이 없다 */
  kakaoLinked: boolean;
  otpHash: string | null;
  otpExpiresAt: string | null;
  otpAttempts: number;
  otpSentAt: string | null;
  createdAt: string;
}

/** DB 오류를 그대로 전달하되 PostgREST 코드(23505 unique 등)를 살려 둔다 —
 *  라우트가 409/500 을 가르는 유일한 단서다. */
export class CmsUsersError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CmsUsersError';
    this.code = code;
  }
}

interface CmsUserRow {
  id: string;
  name: string;
  role: string;
  email: string | null;
  github_login: string | null;
  kakao_id: string | null;
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number | null;
  otp_sent_at: string | null;
  created_at: string;
}

const COLS =
  'id, name, role, email, github_login, kakao_id, otp_hash, otp_expires_at, otp_attempts, otp_sent_at, created_at';

function toUser(r: CmsUserRow): CmsUser {
  return {
    id: String(r.id),
    name: r.name ?? '',
    role: r.role === 'admin' ? 'admin' : 'editor',
    email: r.email ?? null,
    githubLogin: r.github_login ?? null,
    kakaoId: r.kakao_id ?? null,
    kakaoLinked: Boolean(r.kakao_id),
    otpHash: r.otp_hash ?? null,
    otpExpiresAt: r.otp_expires_at ?? null,
    otpAttempts: r.otp_attempts ?? 0,
    otpSentAt: r.otp_sent_at ?? null,
    createdAt: r.created_at,
  };
}

/** 이메일·GitHub 계정명 정규화 — 저장과 조회가 같은 함수를 타야 대소문자·공백
 *  차이로 "등록했는데 로그인이 안 되는" 사고가 안 난다. */
export function normalizeKey(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '' ? null : v;
}

// ── Supabase 서비스 클라이언트 (RLS 우회 — 호출부가 인증을 확인한 뒤에만 쓴다) ──
let _sb: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new CmsUsersError('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

function fail(error: { message: string; code?: string }): never {
  throw new CmsUsersError(error.message, error.code);
}

/** DB 오류 → 응답 메시지. dev 는 "테이블을 아직 안 만들었다"가 압도적으로 흔한
 *  원인이라 힌트를 붙인다(콘솔 UI 개발 중 원인 파악 시간을 줄이려는 것). */
export function describeDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (process.env.NODE_ENV !== 'production') {
    return `${msg} (dev 힌트: cms_users 테이블이 없습니다 — scripts/sql/2026-08-cms-users.sql 참조)`;
  }
  return msg;
}

// ── 조회 ──────────────────────────────────────────────────────────────

async function findBy(column: 'email' | 'github_login' | 'kakao_id' | 'id', value: string) {
  const { data, error } = await db().from('cms_users').select(COLS).eq(column, value).maybeSingle();
  if (error) fail(error);
  return data ? toUser(data as CmsUserRow) : null;
}

export async function findUserById(id: string): Promise<CmsUser | null> {
  const v = (id ?? '').trim();
  if (!v) return null;
  return findBy('id', v);
}

export async function findUserByEmail(email: string): Promise<CmsUser | null> {
  const v = normalizeKey(email);
  if (!v) return null;
  return findBy('email', v);
}

export async function findUserByGithubLogin(login: string): Promise<CmsUser | null> {
  const v = normalizeKey(login);
  if (!v) return null;
  return findBy('github_login', v);
}

export async function findUserByKakaoId(kakaoId: string): Promise<CmsUser | null> {
  const v = (kakaoId ?? '').trim();
  if (!v) return null;
  return findBy('kakao_id', v);
}

export async function listUsers(): Promise<CmsUser[]> {
  const { data, error } = await db()
    .from('cms_users')
    .select(COLS)
    .order('created_at', { ascending: true });
  if (error) fail(error);
  return ((data ?? []) as CmsUserRow[]).map(toUser);
}

/** 관리자 수 — 마지막 관리자를 지우거나 강등하는 사고를 막는 데 쓴다 */
export async function countAdmins(): Promise<number> {
  const { count, error } = await db()
    .from('cms_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (error) fail(error);
  return count ?? 0;
}

// ── 쓰기 ──────────────────────────────────────────────────────────────

export interface CreateUserInput {
  name: string;
  role: CmsRole;
  email?: string | null;
  githubLogin?: string | null;
}

export async function createUser(input: CreateUserInput): Promise<CmsUser> {
  const { data, error } = await db()
    .from('cms_users')
    .insert({
      name: input.name.trim(),
      role: input.role,
      email: normalizeKey(input.email),
      github_login: normalizeKey(input.githubLogin),
    })
    .select(COLS)
    .single();
  if (error) fail(error);
  return toUser(data as CmsUserRow);
}

export interface UpdateUserInput {
  name?: string;
  role?: CmsRole;
  email?: string | null;
  githubLogin?: string | null;
  /** 카카오 연결 해제 — 값을 넘기는 게 아니라 "끊는다"는 의도라 별도 플래그다 */
  unlinkKakao?: boolean;
}

export async function updateUser(id: string, patch: UpdateUserInput): Promise<CmsUser | null> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.email !== undefined) row.email = normalizeKey(patch.email);
  if (patch.githubLogin !== undefined) row.github_login = normalizeKey(patch.githubLogin);
  if (patch.unlinkKakao) row.kakao_id = null;
  if (Object.keys(row).length === 0) return findUserById(id);

  const { data, error } = await db()
    .from('cms_users')
    .update(row)
    .eq('id', id)
    .select(COLS)
    .maybeSingle();
  if (error) fail(error);
  return data ? toUser(data as CmsUserRow) : null;
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await db().from('cms_users').delete().eq('id', id);
  if (error) fail(error);
}

export async function linkKakao(id: string, kakaoId: string): Promise<void> {
  const { error } = await db()
    .from('cms_users')
    .update({ kakao_id: String(kakaoId).trim() })
    .eq('id', id);
  if (error) fail(error);
}

// ── OTP(이메일 인증번호) ───────────────────────────────────────────────

/** 인증번호 발급 — 해시·만료를 새로 박고 시도 횟수를 0 으로 되돌린다 */
export async function setOtp(id: string, hash: string, expiresAt: Date): Promise<void> {
  const { error } = await db()
    .from('cms_users')
    .update({
      otp_hash: hash,
      otp_expires_at: expiresAt.toISOString(),
      otp_attempts: 0,
      otp_sent_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) fail(error);
}

/** 오입력 1회 기록. 읽고 쓰는 두 왕복인 이유는 supabase-js 에 원자적 증가가
 *  없기 때문이다 — 무차별 대입 방지용 카운터라 경쟁 상황의 오차는 무해하다. */
export async function bumpOtpAttempts(id: string): Promise<void> {
  const { data, error } = await db()
    .from('cms_users')
    .select('otp_attempts')
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error);
  const next = ((data?.otp_attempts as number | null) ?? 0) + 1;
  const res = await db().from('cms_users').update({ otp_attempts: next }).eq('id', id);
  if (res.error) fail(res.error);
}

/** 인증 성공·폐기 — 남은 해시는 재사용 위험이라 즉시 지운다 */
export async function clearOtp(id: string): Promise<void> {
  const { error } = await db()
    .from('cms_users')
    .update({ otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
    .eq('id', id);
  if (error) fail(error);
}
