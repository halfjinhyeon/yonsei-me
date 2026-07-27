import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface FacultyLab {
  nameKo: string;
  nameEn: string;
  url: string;
}

export interface FacultyRecord {
  name: string;
  title: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  room: string | null;
  specialty: string | null;
  yearRange: string | null;
  /** 명예·퇴임 교원 수동 표시 — 재직 기간(yearRange)을 모르는 경우를 위한 보완 스위치.
   *  기간이 적혀 있으면 그것만으로도 퇴임으로 분류되므로, 둘 중 하나만 있으면 된다.
   *  구 데이터엔 이 키가 없어 optional 이다(없으면 false 취급). */
  emeritus?: boolean;
  moreInfoUrl: string | null;
  photoAlt: string;
  lab: FacultyLab | null;
  photo: string | null;
}

export interface ClubSummary {
  slug: string;
  name: string;
  teaser: string;
  /** 카드 왼쪽 배경에 깔리는 동아리 로고 (public/img/clubs/) */
  logo?: string;
  /** 상세 페이지 카드뉴스 패널에서 좌우 교대로 쓰는 사진 (public/img/club-photos/) */
  images?: string[];
}

/** slug → 로고 파일 매핑 (public/img/clubs/) */
const CLUB_LOGOS: Record<string, string> = {
  yonseidrone: '/img/clubs/yonseidrone.jpeg',
  mecar: '/img/clubs/mecar.jpeg',
  roboin: '/img/clubs/roboin.jpg',
  spacey: '/img/clubs/spacey.jpeg',
};

/** 6개 연구 분야 taxonomy 키 (분야 필터 공통 타입) */
export type ResearchField =
  | 'bioNano'
  | 'thermoFluid'
  | 'dynamicsControl'
  | 'manufacturingDesign'
  | 'computation'
  | 'mechanicsMaterials';

export interface LabDirectoryEntry {
  nameKo: string;
  nameEn: string;
  professorKo: string;
  professorEn: string;
  location: string;
  phone: string;
  /** 연구실 외부 사이트 링크. 빈 문자열이면 링크 없는 카드로 처리한다. */
  url: string;
  /** 연구실 소개 문단(로케일별) — 목록의 특색 홍보용. 없으면 소개 없이 렌더되며,
   *  content/labs-directory.json 에 채우는 즉시 표시된다. */
  description?: { ko: string; en: string };
  /** 연구실별 실제 이미지 경로(public 기준). 없으면 더미 이미지 3장을 순환 사용. */
  image?: string;
  /** 연구실 소개 영상 URL (YouTube watch 또는 Google Drive file 링크). 없으면 영상 미제공 */
  video?: string;
  /** 6개 연구 분야 중 하나 (분야 필터용) */
  field: ResearchField;
  /** 학부 인턴 모집 여부 — 연구실 목록의 "학부 인턴 모집 중" 배지 + 상단 필터에 사용 */
  internRecruiting?: boolean;
  /** 학부 인턴 모집 인원 (모집 중일 때만 의미). 없으면 인원 미표기 */
  internCount?: number;
}

/** content/faculty-profiles/<한글이름>.json — 교수 개인 상세(학술활동) 크롤 데이터.
 *  직위·보직·연구실·사진은 여기 없다. 같은 이름의 faculty-directory 레코드와 합쳐 쓴다. */
export interface FacultyProfileArticleRow {
  /** "2025-12" (연-월) */
  date: string | null;
  title: string;
  journal: string | null;
}

export interface FacultyProfileAwardRow {
  title: string;
  contents: string | null;
  /** "2024-04-18" (연-월-일) */
  date: string | null;
}

export interface FacultyProfileConferenceRow {
  title: string;
  conference: string | null;
  /** "2023.08.21~2023.08.25" (시작~끝) */
  period: string | null;
}

export interface FacultyProfileFundingRow {
  title: string;
  org: string | null;
  /** "2026-03-01~2027-02-28" (시작~끝) */
  period: string | null;
}

export interface FacultyProfilePatentRow {
  title: string;
  /** 특허 / 상표 등 */
  type: string | null;
  applicant: string | null;
  /** "2026-01-27" (연-월-일) */
  date: string | null;
}

export interface FacultyProfile {
  name: string;
  nameEn: string | null;
  email: string | null;
  phone: string | null;
  office: string | null;
  homepage: string | null;
  sourceUrl: string | null;
  crawledAt: string | null;
  /** AI 연구요약 — 학술활동 데이터를 바탕으로 미리 생성해 둔 문단(실시간 생성 아님).
   *  없으면 상세 페이지에서 요약 버튼 자체를 그리지 않는다. */
  aiSummary?: string | null;
  /** 배열 5종은 항상 존재한다(빈 배열일 수는 있다) */
  articles: FacultyProfileArticleRow[];
  awards: FacultyProfileAwardRow[];
  conferences: FacultyProfileConferenceRow[];
  fundings: FacultyProfileFundingRow[];
  patents: FacultyProfilePatentRow[];
}

const FACULTY_PROFILE_DIR = 'faculty-profiles';

function readJson<T>(name: string): T {
  const path = join(process.cwd(), 'content', name);
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/** public/img/faculty 에 있는 "{교수 이름}.{ext}" 프로필 사진을 이름 기준으로 매핑 */
function getFacultyPhotoMap(): Map<string, string> {
  const dir = join(process.cwd(), 'public', 'img', 'faculty');
  const map = new Map<string, string>();
  for (const file of readdirSync(dir)) {
    const dot = file.lastIndexOf('.');
    if (dot <= 0) continue;
    map.set(file.slice(0, dot), `/img/faculty/${file}`);
  }
  return map;
}

/** content/faculty-directory.json — 교수진 게시판에서 구조화 추출한 실제 데이터.
 *  사진은 JSON 의 명시적 photo(관리자 콘솔 업로드가 채움)를 우선하고, 없으면
 *  기존 컨벤션대로 public/img/faculty 의 "<이름>.<ext>" 파일을 이름으로 매칭한다. */
export function getFacultyDirectory(): FacultyRecord[] {
  const records = readJson<(Omit<FacultyRecord, 'photo'> & { photo?: string | null })[]>(
    'faculty-directory.json',
  );
  const photos = getFacultyPhotoMap();
  return records.map(({ photo, ...rest }) => {
    const explicit = typeof photo === 'string' && photo.trim() !== '' ? photo.trim() : null;
    return { ...rest, photo: explicit ?? photos.get(rest.name) ?? null };
  });
}

/** content/clubs.json — 동아리 인덱스(슬러그/이름/티저) + 로고 매핑 */
export function getClubs(): ClubSummary[] {
  return readJson<ClubSummary[]>('clubs.json').map((c) => ({
    ...c,
    logo: CLUB_LOGOS[c.slug],
  }));
}

/** content/labs-directory.json — 연구실 목록(지도교수·위치·연락처·사이트 링크) */
export function getLabsDirectory(): LabDirectoryEntry[] {
  return readJson<LabDirectoryEntry[]>('labs-directory.json');
}

/** content/faculty-profiles/*.json 파일명(확장자 제거) = 교수 상세 페이지 slug 목록.
 *  디렉터리가 아직 없는 체크아웃에서도 빌드가 깨지지 않도록 빈 배열로 떨어진다. */
export function getFacultyProfileNames(): string[] {
  const dir = join(process.cwd(), 'content', FACULTY_PROFILE_DIR);
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length));
  } catch {
    return [];
  }
}

/** 이름(한글)으로 교수 개인 상세를 읽는다. 목록에 없는 이름은 즉시 null —
 *  slug 가 URL 에서 오므로 파일명을 조립하기 전에 화이트리스트로 거른다. */
export function getFacultyProfile(name: string): FacultyProfile | null {
  if (!getFacultyProfileNames().includes(name)) return null;
  const path = join(process.cwd(), 'content', FACULTY_PROFILE_DIR, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as FacultyProfile;
}
