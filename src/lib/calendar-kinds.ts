/**
 * 캘린더 일정의 종류(kind) 정의 — 색·라벨·정렬 순서·CMS 분류 매핑.
 *
 * 뉴스 '일정' 탭(EventCalendar)과 홈 일정 패널(HomeCalendarPanel)이 같은 값을 써야 한다.
 * 두 화면에서 '행사'의 색이 다르면 같은 일정이 다른 것처럼 읽힌다.
 *
 * ⚠️ 이 파일에 'use client' 를 붙이면 안 된다. 서버 컴포넌트(홈·뉴스 page.tsx)가
 * CALENDAR_KIND 를 읽는데, 클라이언트 모듈의 export 는 서버에서 실제 값이 아니라
 * 클라이언트 참조 프록시로 넘어온다. 그 프록시에 [category] 로 접근하면 빌드 중
 * "Could not find the module …#CALENDAR_KIND#academic in the React Client Manifest"
 * 로 프리렌더가 죽는다(실제로 한 번 겪었다). 그래서 순수 데이터 모듈로 분리해 뒀다.
 */
export interface CalendarEntry {
  id: string;
  date: string; // 시작일 YYYY-MM-DD
  endDate: string; // 종료일 YYYY-MM-DD (하루면 date 와 동일)
  title: string; // 서버에서 pick() 완료된 문자열
  kind: 'event' | 'seminar' | 'academic' | 'recruit' | 'exam';
  /** 상세 링크. 캘린더 전용 일정은 볼 본문이 없어 비어 있고, 그때는 링크가 아닌 바로 렌더된다. */
  href?: string;
}

// 종류별 색 (골드 액센트는 금지). 바는 각지고 그림자 없음 — 면은 8% 틴트, 좌측 액센트 보더.
// hover 를 bar 에서 분리한 이유: href 없는 일정은 클릭할 곳이 없으므로 hover 강조를 주면
// 안 된다. 링크로 렌더될 때만 barHover 를 덧붙인다.
export const KIND_STYLES: Record<
  CalendarEntry['kind'],
  { bar: string; barHover: string; accent: string; dot: string; badge: string }
> = {
  event: {
    bar: 'bg-yonsei-navy/[0.08] text-yonsei-navy',
    barHover: 'hover:bg-yonsei-navy/15',
    accent: 'border-yonsei-navy',
    dot: 'bg-yonsei-navy',
    badge: 'bg-yonsei-navy/10 text-yonsei-navy',
  },
  seminar: {
    bar: 'bg-yonsei-blue/[0.08] text-yonsei-blue',
    barHover: 'hover:bg-yonsei-blue/15',
    accent: 'border-yonsei-blue',
    dot: 'bg-yonsei-blue',
    badge: 'bg-yonsei-blue/10 text-yonsei-blue',
  },
  academic: {
    bar: 'bg-yonsei-sky/[0.08] text-yonsei-sky',
    barHover: 'hover:bg-yonsei-sky/15',
    accent: 'border-yonsei-sky',
    dot: 'bg-yonsei-sky',
    badge: 'bg-yonsei-sky/10 text-yonsei-sky',
  },
  recruit: {
    bar: 'bg-[#166534]/[0.08] text-[#166534]',
    barHover: 'hover:bg-[#166534]/15',
    accent: 'border-[#166534]',
    dot: 'bg-[#166534]',
    badge: 'bg-[#166534]/10 text-[#166534]',
  },
  exam: {
    bar: 'bg-[#b42318]/[0.08] text-[#b42318]',
    barHover: 'hover:bg-[#b42318]/15',
    accent: 'border-[#b42318]',
    dot: 'bg-[#b42318]',
    badge: 'bg-[#b42318]/10 text-[#b42318]',
  },
};

// 종류별 라벨 — 배지·스크린리더는 단수(en), 범례는 복수(enPlural). 한국어는 둘이 같다.
// 삼항을 겹치지 않고 맵으로 둔 이유: 종류가 5개로 늘어 삼항 사슬은 읽을 수 없다.
export const KIND_LABELS: Record<
  CalendarEntry['kind'],
  { ko: string; en: string; enPlural: string }
> = {
  event: { ko: '행사', en: 'Event', enPlural: 'Events' },
  seminar: { ko: '세미나', en: 'Seminar', enPlural: 'Seminars' },
  academic: { ko: '학사일정', en: 'Academic', enPlural: 'Academic' },
  recruit: { ko: '모집·신청', en: 'Application', enPlural: 'Applications' },
  exam: { ko: '시험', en: 'Exam', enPlural: 'Exams' },
};

// 목록 정렬용 종류 우선순위. 예전 비교자는 'event 면 -1, 아니면 1' 이라 종류가 둘일 때만
// 성립했다(academic vs seminar 가 양쪽 다 1 을 돌려주는 비대칭 비교자가 된다).
export const KIND_ORDER = Object.keys(KIND_STYLES) as CalendarEntry['kind'][];
export const kindRank = (k: CalendarEntry['kind']) => KIND_ORDER.indexOf(k);

// CMS '일정 (캘린더)' 게시판의 분류 → 캘린더 kind. CMS 의 '행사'는 행사 게시판과 같은
// 'event' 로 접는다 — 학생에게는 둘 다 그냥 행사라 범례가 '행사'로 두 줄 나오면 안 된다.
// 모르는 값(분류가 늘어난 경우)은 호출부에서 학사일정으로 떨어뜨려 최소한 달력에는 뜨게 한다.
export const CALENDAR_KIND: Record<string, CalendarEntry['kind']> = {
  academic: 'academic',
  event: 'event',
  recruit: 'recruit',
  exam: 'exam',
};
