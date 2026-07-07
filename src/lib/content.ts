import facultyData from '@content/faculty.json';
import researchData from '@content/research.json';
import newsData from '@content/news.json';
import programsData from '@content/programs.json';
import boardData from '@content/board.json';
import historyData from '@content/history.json';
import staffData from '@content/staff.json';
import type { Locale } from '@/i18n/routing';

/** 한/영 문자열 쌍 → 현재 로케일 값으로 뽑아내는 헬퍼 */
type Localized<T = string> = { ko: T; en: T };
export function pick<T>(value: Localized<T>, locale: Locale): T {
  return value[locale] ?? value.ko;
}

// ---- 타입 ----
/** 게시물 첨부파일 (있을 때만 상세 페이지에 표시) */
export interface Attachment {
  label: Localized;
  href: string;
}

export type FacultyField = 'energy' | 'robotics' | 'design' | 'bio';

export interface Faculty {
  id: string;
  name: Localized;
  title: Localized;
  field: FacultyField;
  specialty: Localized;
  email: string;
  lab: Localized;
  photo: string;
}

export interface Research {
  id: string;
  title: Localized;
  pi: Localized;
  summary: Localized;
  keywords: Localized<string[]>;
  accent: FacultyField;
  image: string;
}

export type NewsCategory = 'notice' | 'seminar' | 'achievement';

export interface NewsItem {
  slug: string;
  category: NewsCategory;
  date: string;
  title: Localized;
  excerpt: Localized;
  body: Localized;
  image: string;
  attachments?: Attachment[];
}

/** 행정 교직원 (학부 소개 > 교직원 탭) */
export interface StaffMember {
  role: Localized;
  name: Localized;
  phone: string;
  location: Localized;
  email: string;
}

// ---- 접근자 ----
export const faculty = facultyData as Faculty[];
export const staff = staffData as StaffMember[];
export const research = researchData as Research[];

/** 뉴스는 항상 최신순 정렬해서 반환 */
export const news = (newsData as NewsItem[])
  .slice()
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export function getNewsBySlug(slug: string): NewsItem | undefined {
  return news.find((n) => n.slug === slug);
}

export interface Program {
  id: string;
  title: Localized;
  desc: Localized;
  image: string;
  href: string;
}

export const programs = programsData as {
  undergraduate: Program[];
  graduate: Program[];
};

export interface Seminar {
  id: string;
  date: string;
  host: Localized;
  title: Localized;
  body: Localized;
  attachments?: Attachment[];
}

export interface EventItem {
  id: string;
  date: string;
  dateLabel: Localized;
  title: Localized;
  body: Localized;
  attachments?: Attachment[];
}

export interface Notice {
  id: string;
  date: string;
  title: Localized;
  body: Localized;
  attachments?: Attachment[];
}

export const board = boardData as {
  seminars: Seminar[];
  events: EventItem[];
  noticesUndergrad: Notice[];
  noticesGraduate: Notice[];
  thesis: Notice[];
  career: Notice[];
};

/** 게시판 글(공지/세미나/행사/학위논문/취업)을 상세 페이지에서 단일 형태로 다루기 위한 통합 타입 */
export interface BoardPost {
  id: string;
  date: string;
  title: Localized;
  body: Localized;
  /** 소속 게시판 (뉴스 탭 key와 동일) */
  boardKey: 'notices' | 'seminars' | 'events' | 'thesis' | 'career';
  /** 부가 정보 한 줄 — 세미나 연사, 행사 기간, 공지 구분(학부/대학원) 등 */
  meta?: Localized;
  attachments?: Attachment[];
}

export function getAllBoardPosts(): BoardPost[] {
  return [
    ...board.noticesUndergrad.map((n): BoardPost => ({
      ...n,
      boardKey: 'notices',
      meta: { ko: '학부 공지', en: 'Undergraduate' },
    })),
    ...board.noticesGraduate.map((n): BoardPost => ({
      ...n,
      boardKey: 'notices',
      meta: { ko: '대학원 공지', en: 'Graduate' },
    })),
    ...board.seminars.map((s): BoardPost => ({
      id: s.id,
      date: s.date,
      title: s.title,
      body: s.body,
      boardKey: 'seminars',
      meta: s.host,
      attachments: s.attachments,
    })),
    ...board.events.map((e): BoardPost => ({
      id: e.id,
      date: e.date,
      title: e.title,
      body: e.body,
      boardKey: 'events',
      meta: e.dateLabel,
      attachments: e.attachments,
    })),
    ...board.thesis.map((t): BoardPost => ({ ...t, boardKey: 'thesis' })),
    ...board.career.map((c): BoardPost => ({ ...c, boardKey: 'career' })),
  ];
}

export function getBoardPost(id: string): BoardPost | undefined {
  return getAllBoardPosts().find((p) => p.id === id);
}

// ---- 연혁 ----
/** 학과 연혁 이벤트. date는 "YYYY-MM" 형태 */
export interface HistoryEvent {
  date: string;
  title: Localized;
}

/** 연혁은 항상 과거→현재 오름차순으로 반환 */
export const history = (historyData as HistoryEvent[])
  .slice()
  .sort((a, b) => (a.date < b.date ? -1 : 1));
