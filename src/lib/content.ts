import facultyData from '@content/faculty.json';
import researchData from '@content/research.json';
import newsData from '@content/news.json';
import alumniNewsData from '@content/alumni-news.json';
import programsData from '@content/programs.json';
import boardData from '@content/board.json';
import historyData from '@content/history.json';
import staffData from '@content/staff.json';
import calendarData from '@content/calendar.json';
import type { Locale } from '@/i18n/routing';

/** 한/영 문자열 쌍 → 현재 로케일 값으로 뽑아내는 헬퍼 */
export type Localized<T = string> = { ko: T; en: T };
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

/** 동문 뉴스 — 별도 파일(content/alumni-news.json). 항상 최신순 정렬 */
export const alumniNews = (alumniNewsData as NewsItem[])
  .slice()
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export function getAlumniNewsBySlug(slug: string): NewsItem | undefined {
  return alumniNews.find((n) => n.slug === slug);
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
  /** 종료일(YYYY-MM-DD, DB end_date) — 없으면 하루 일정 */
  endDate?: string;
  host: Localized;
  title: Localized;
  body: Localized;
  /** 목록 썸네일(DB thumbnail_url) — 없으면 목록에서 흰 공백 */
  image?: string;
  /** 목록 발췌 — 없으면 목록에서 생략 */
  excerpt?: Localized;
  attachments?: Attachment[];
}

export interface EventItem {
  id: string;
  date: string;
  /** 종료일(YYYY-MM-DD, DB end_date) — 없으면 하루 행사(구 데이터는 dateLabel 파싱 폴백) */
  endDate?: string;
  dateLabel: Localized;
  title: Localized;
  body: Localized;
  /** 목록 썸네일(DB thumbnail_url) — 없으면 목록에서 흰 공백 */
  image?: string;
  /** 목록 발췌 — 없으면 목록에서 생략 */
  excerpt?: Localized;
  attachments?: Attachment[];
}

export interface Notice {
  id: string;
  date: string;
  title: Localized;
  body: Localized;
  /** 목록 썸네일(DB thumbnail_url) — 없으면 목록에서 흰 공백 */
  image?: string;
  /** 목록 발췌 — 없으면 목록에서 생략 */
  excerpt?: Localized;
  attachments?: Attachment[];
}

/** 동문 소식·네트워크 항목 — 세미나형 + "특정 날짜 행사" 플래그.
 *  isEvent=true 면 date 가 행사일로 간주되어 금주 캘린더 '동문'에 표시된다. */
export interface AlumniEvent extends Seminar {
  isEvent?: boolean;
}

export const board = boardData as {
  seminars: Seminar[];
  events: EventItem[];
  noticesUndergrad: Notice[];
  noticesGraduate: Notice[];
  noticesExternal: Notice[];
  noticesScholarship: Notice[];
  thesis: Notice[];
  career: Notice[];
  resources: Notice[];
  internships: Notice[];
  alumniEvents: AlumniEvent[];
};

/** 게시판 글(공지/세미나/행사/학위논문/취업)을 상세 페이지에서 단일 형태로 다루기 위한 통합 타입 */
export interface BoardPost {
  id: string;
  date: string;
  title: Localized;
  body: Localized;
  /** 소속 게시판 (뉴스 탭 key와 동일) */
  boardKey: 'notices' | 'seminars' | 'events' | 'thesis' | 'career' | 'resources' | 'internships';
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
    ...board.noticesExternal.map((n): BoardPost => ({
      ...n,
      boardKey: 'notices',
      meta: { ko: '외부기관 공지', en: 'External' },
    })),
    ...board.noticesScholarship.map((n): BoardPost => ({
      ...n,
      boardKey: 'notices',
      meta: { ko: '장학생 선발공고', en: 'Scholarship' },
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
    ...board.resources.map((r): BoardPost => ({ ...r, boardKey: 'resources' })),
    ...board.internships.map((n): BoardPost => ({ ...n, boardKey: 'internships' })),
  ];
}

export function getBoardPost(id: string): BoardPost | undefined {
  return getAllBoardPosts().find((p) => p.id === id);
}

/** 동문 소식·네트워크 — board.json 의 alumniEvents(세미나형), 최신순.
 *  뉴스 상세(getAllBoardPosts)와 섞지 않고 동문 전용 라우트에서만 쓴다. */
export const alumniEvents = board.alumniEvents
  .slice()
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export function getAlumniEventById(id: string): AlumniEvent | undefined {
  return alumniEvents.find((e) => e.id === id);
}

// ---- 금주 캘린더 통합 엔트리 ----
/** 캘린더 표시 카테고리. 'event'=행사 게시판, 'alumni'=동문 소식·네트워크(행사 표시분) */
export type CalendarCategory = 'event' | 'alumni';

export interface CalendarEntry {
  id: string;
  /** 행사일 (YYYY-MM-DD) */
  date: string;
  title: Localized;
  category: CalendarCategory;
}

/**
 * 금주 캘린더에 표시할 엔트리 — 행사 게시판 전체 + 동문 소식·네트워크 중
 * isEvent 로 표시된 항목(특정 날짜 행사)을 합친다. 각 항목의 date 를 행사일로 쓴다.
 * 링크 라우트: event → /news/post/[id], alumni → /alumni/post/[id].
 */
export function getCalendarEntries(): CalendarEntry[] {
  const events: CalendarEntry[] = board.events.map((e) => ({
    id: e.id,
    date: e.date,
    title: e.title,
    category: 'event',
  }));
  const alumni: CalendarEntry[] = board.alumniEvents
    .filter((a) => a.isEvent && a.date)
    .map((a) => ({ id: a.id, date: a.date, title: a.title, category: 'alumni' }));
  return [...events, ...alumni];
}

// ---- 캘린더 전용 일정 (content/calendar.json) ----
//
// 위 getCalendarEntries() 는 "게시글이 있는" 일정만 모은다. 그런데 개강·수강신청
// 변경·시험 기간 같은 학사일정은 본문이 있는 게시글로 올릴 성격이 아니면서도
// 홈 '공지&일정' 캘린더에는 반드시 떠야 한다. 그래서 게시판과 무관한 전용 파일을
// 따로 두고, 홈에서 게시판 기반 일정과 날짜순으로 합친다.
//
// 다른 content/*.json 리소스와 같은 빌드 타임 인라인 방식이다(별도 API 없음) —
// 관리 콘솔의 커밋·트레이·충돌 처리 경로를 그대로 물려받기 위함.

/** 일정 분류 — 색과 범례만 다르고 동작은 같다 */
export type CalendarEventCategory = 'academic' | 'event' | 'recruit' | 'exam';

export interface CalendarEvent {
  id: string;
  title: Localized;
  /** 시작일 "YYYY-MM-DD" */
  start: string;
  /** 종료일. 없으면(키 생략) 하루 일정 */
  end?: string;
  category: CalendarEventCategory;
  /** 선택 — 비거나 없으면 링크 없는 정적 카드로 렌더된다 */
  href?: string;
}

/** 캘린더 전용 일정 전체 (시작일 오름차순). 정렬·필터는 소비하는 쪽이 다시 한다 */
export function getCalendarEvents(): CalendarEvent[] {
  return (calendarData as CalendarEvent[])
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

// ---- 연혁 ----
/** 학과 연혁 이벤트. date는 "YYYY-MM" 형태 */
export interface HistoryEvent {
  date: string;
  title: Localized;
}

/** 연혁은 항상 최근→과거 내림차순으로 반환 */
export const history = (historyData as HistoryEvent[])
  .slice()
  .sort((a, b) => (a.date < b.date ? 1 : -1));
