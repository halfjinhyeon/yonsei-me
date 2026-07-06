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

export interface LabDirectoryEntry {
  nameKo: string;
  nameEn: string;
  professorKo: string;
  professorEn: string;
  location: string;
  phone: string;
  /** 연구실 외부 사이트 링크. 빈 문자열이면 링크 없는 카드로 처리한다. */
  url: string;
  /** 연구실별 실제 이미지 경로(public 기준). 없으면 더미 이미지 3장을 순환 사용. */
  image?: string;
}

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

/** content/faculty-directory.json — 교수진 게시판에서 구조화 추출한 실제 데이터 */
export function getFacultyDirectory(): FacultyRecord[] {
  const records = readJson<Omit<FacultyRecord, 'photo'>[]>('faculty-directory.json');
  const photos = getFacultyPhotoMap();
  return records.map((f) => ({ ...f, photo: photos.get(f.name) ?? null }));
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
