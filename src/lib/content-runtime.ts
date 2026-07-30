// 콘텐츠 파일 데이터 레이어 (서버 전용) — 백엔드 전환 Stage A.
//
// CMS 가 편집하는 content/*.json · content/pages/*.md 의 "읽기"를 이 모듈로 일원화한다.
// 소스는 둘 (lib/posts.ts 의 게시판 전환과 같은 구조):
//  - db  : Supabase content_files(path, body). unstable_cache + 'content' 태그로 캐시되고,
//          CMS 쓰기가 revalidateTag('content') 를 호출하면 재배포 없이 갱신된다.
//  - git : 기존 정적 파일(content.ts / faculty.ts / pages.ts) — 롤백·오프라인 폴백.
//
// 기본값(Stage B): 프로덕션 + Supabase 구성 시 db, dev 는 항상 git(로컬 작업 트리
// 워크플로 보존). CONTENT_SOURCE=git 이 긴급 롤백 스위치다 — contentSource() 참고.
//
// 폴백은 항상 호출측(각 getter)에서 처리한다: DB 조회 실패·JSON 파싱 실패는 조용히
// 삼키고 파일 스냅샷으로 떨어진다. 콘텐츠 한 덩이가 깨져도 페이지는 뜬다.

import { unstable_cache } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MANAGED_FILES, isManagedPath } from '@/lib/admin/managed-content';
import {
  history as gitHistory,
  staff as gitStaff,
  type HistoryEvent,
  type StaffMember,
} from './content';
import {
  getFacultyDirectory as gitFacultyDirectory,
  getLabsDirectory as gitLabsDirectory,
  getClubs as gitClubs,
  getFacultyPhotoMap,
  adaptFacultyRecords,
  adaptClubs,
  type FacultyRecord,
  type LabDirectoryEntry,
  type ClubSummary,
} from './faculty';
import { getPageMarkdown } from './pages';
// 교과목 3종은 content.ts 를 거치지 않고 페이지가 직접 정적 import 하던 데이터다.
// 폴백 원본(= 빌드 시점 스냅샷)을 여기로 모아, 소비처는 getter 만 부르면 되게 한다.
import coursesUndergraduateJson from '@content/courses-undergraduate.json';
import courseDescriptionsJson from '@content/course-descriptions.json';
import coursesGraduateJson from '@content/courses-graduate.json';

// ── 소스 판별 ──────────────────────────────────────────────────────────
export type ContentSource = 'db' | 'git';

/** 콘텐츠 읽기 소스. 미설정 기본값(Stage B): 프로덕션에서 Supabase 가 구성돼 있으면
 *  db, 아니면 git. dev 는 항상 git — dev 서버가 로컬 작업 트리를 그대로 서빙하는
 *  워크플로(파일 수정 → 즉시 반영)를 깨지 않기 위해서다.
 *  CONTENT_SOURCE=git 은 긴급 롤백 스위치(BOARDS_SOURCE 와 같은 관례). */
export function contentSource(): ContentSource {
  const v = process.env.CONTENT_SOURCE;
  if (v === 'db' || v === 'git') return v;
  return process.env.NODE_ENV === 'production' && process.env.SUPABASE_URL ? 'db' : 'git';
}

// ── Supabase 클라이언트 (lazy, 서버 전용 service key) ───────────────────
// lib/posts.ts 와 같은 패턴을 각자 보유한다 — 두 레이어가 서로를 import 하지 않게 둔다.
let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

// ── DB 행 형태 (scripts/sql/schema-content.sql 과 1:1) ──────────────────
interface DbContentFile {
  path: string;
  body: string;
  version: number;
}

// 관리 대상 파일은 십여 개·합쳐 수백 KB 라 전 행을 1회 조회해 메모리에서 고른다.
// 'content' 태그 하나로 단순·확실하게 캐시한다(게시판의 'posts' 와 같은 관례).
const fetchAllContentFiles = unstable_cache(
  async (): Promise<DbContentFile[]> => {
    const { data, error } = await sb().from('content_files').select('path, body, version');
    if (error) throw new Error(`콘텐츠 파일 조회 실패: ${error.message}`);
    return (data ?? []) as DbContentFile[];
  },
  ['content-files-all'],
  { tags: ['content'], revalidate: 3600 },
);

/** 관리 대상 파일의 DB 원문. git 모드거나 행이 없거나 조회가 실패하면 null(→ 호출측 폴백) */
async function getManagedText(path: string): Promise<string | null> {
  if (contentSource() === 'git') return null;
  try {
    const rows = await fetchAllContentFiles();
    return rows.find((r) => r.path === path)?.body ?? null;
  } catch (err) {
    console.error(`[content-runtime] ${path} 조회 실패 — 파일 폴백:`, err);
    return null;
  }
}

/** DB 원문을 JSON 으로 파싱. 실패하면 null — 깨진 한 덩이가 페이지를 죽이지 않는다 */
async function getManagedJson<T>(path: string): Promise<T | null> {
  const text = await getManagedText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error(`[content-runtime] ${path} JSON 파싱 실패 — 파일 폴백:`, err);
    return null;
  }
}

// ── 도메인 getter (반환 타입은 기존 소비처 그대로) ──────────────────────

/** 연혁 — content.ts 와 같은 최근→과거 내림차순으로 반환한다(정렬 규칙 동일 유지) */
export async function getHistoryRuntime(): Promise<typeof gitHistory> {
  const raw = await getManagedJson<HistoryEvent[]>(MANAGED_FILES.history);
  if (!raw) return gitHistory;
  return raw.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** 행정 교직원 — 파일 순서가 표 순서다(정렬 없음, content.ts 와 동일) */
export async function getStaffRuntime(): Promise<typeof gitStaff> {
  const raw = await getManagedJson<StaffMember[]>(MANAGED_FILES.staff);
  return raw ?? gitStaff;
}

/** 교수진 인명록 — 사진 매칭(public/img/faculty)은 소스와 무관하게 같은 어댑터로 적용 */
export async function getFacultyDirectoryRuntime(): Promise<FacultyRecord[]> {
  const raw = await getManagedJson<
    (Omit<FacultyRecord, 'photo'> & { photo?: string | null })[]
  >(MANAGED_FILES.facultyDirectory);
  if (!raw) return gitFacultyDirectory();
  return adaptFacultyRecords(raw, getFacultyPhotoMap());
}

/** 연구실 목록 — 어댑터 없이 원본 그대로 쓰는 데이터 */
export async function getLabsDirectoryRuntime(): Promise<LabDirectoryEntry[]> {
  const raw = await getManagedJson<LabDirectoryEntry[]>(MANAGED_FILES.labs);
  return raw ?? gitLabsDirectory();
}

/** 동아리 인덱스 — 로고(slug 매핑)는 소스와 무관하게 같은 어댑터로 적용 */
export async function getClubsRuntime(): Promise<ClubSummary[]> {
  const raw = await getManagedJson<ClubSummary[]>(MANAGED_FILES.clubs);
  if (!raw) return gitClubs();
  return adaptClubs(raw);
}

/** 학부 교과목 — 편람 표와 교과목 체계도가 함께 읽는 데이터 */
export async function getCoursesUndergraduateRuntime(): Promise<typeof coursesUndergraduateJson> {
  const raw = await getManagedJson<typeof coursesUndergraduateJson>(
    MANAGED_FILES.coursesUndergraduate,
  );
  return raw ?? coursesUndergraduateJson;
}

/** 교과목 설명 — 학정번호를 키로 하는 객체(체계도 상세 패널) */
export async function getCourseDescriptionsRuntime(): Promise<typeof courseDescriptionsJson> {
  const raw = await getManagedJson<typeof courseDescriptionsJson>(
    MANAGED_FILES.courseDescriptions,
  );
  return raw ?? courseDescriptionsJson;
}

/** 대학원 교과목 */
export async function getCoursesGraduateRuntime(): Promise<typeof coursesGraduateJson> {
  const raw = await getManagedJson<typeof coursesGraduateJson>(MANAGED_FILES.coursesGraduate);
  return raw ?? coursesGraduateJson;
}

/** content/pages/<slug>.md 원문. 관리 대상(장학금·동아리 본문)만 DB 를 보고,
 *  나머지 임포트 문서는 기존처럼 파일에서 읽는다. */
export async function getPageMarkdownRuntime(slug: string): Promise<string | null> {
  const path = `content/pages/${slug}.md`;
  if (isManagedPath(path)) {
    const text = await getManagedText(path);
    if (text !== null) return text;
  }
  return getPageMarkdown(slug);
}
