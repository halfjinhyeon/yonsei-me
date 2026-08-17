// 콘솔 전용 라인 아이콘 (1.5px 스트로크, currentColor) — CMS 리디자인 목업의
// SVG 패스를 그대로 옮겼다. 사이드바(AdminConsole)와 대시보드(AdminDashboard)가
// 같은 그룹 아이콘을 쓰므로 한 모듈이 단일 출처다. 사이트 본체와 어휘를 섞지
// 않기 위해 admin/ 아래에 둔다.

import type { MenuEntry } from '@/lib/admin/resources';

interface IconProps {
  size?: number;
  className?: string;
}

function svgProps({ size = 18, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  } as const;
}

/** 카카오 말풍선 심볼 — 유일한 채움(fill) 아이콘. 브랜드 마크라 스트로크 문법을
 *  따르지 않고, 노란 원(#FEE500) 위에 검정 85%로 얹는 조합을 쓰는 쪽이 책임진다. */
export function IcoKakaoMark({ size = 9, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="rgba(0,0,0,0.85)"
      className={className}
      aria-hidden
    >
      <path d="M12 3.2c-5.08 0-9.2 3.26-9.2 7.28 0 2.57 1.7 4.82 4.26 6.11-.19.68-.68 2.47-.78 2.85-.12.48.18.47.37.34.15-.1 2.4-1.63 3.38-2.3.63.09 1.29.14 1.97.14 5.08 0 9.2-3.26 9.2-7.28S17.08 3.2 12 3.2Z" />
    </svg>
  );
}

export function IcoSearch(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/** 글쓰기 — 펜 픽토그램 (게시판 목록의 새 글 버튼) */
export function IcoPen(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IcoDashboard(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IcoCalendar(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
    </svg>
  );
}

export function IcoMegaphone(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M3 11l18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

/** 학과 소개 — 기둥 있는 본관 실루엣 */
export function IcoColumns(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M3 22h18" />
      <path d="M6 18v-7" />
      <path d="M10 18v-7" />
      <path d="M14 18v-7" />
      <path d="M18 18v-7" />
      <path d="m12 2 8 5H4z" />
    </svg>
  );
}

export function IcoBook(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function IcoFlask(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4l-5.1-10.2a2 2 0 0 1-.2-.9V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16.5h10" />
    </svg>
  );
}

export function IcoGradCap(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
    </svg>
  );
}

export function IcoUsers(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IcoDocLines(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M6 8h12" />
      <path d="M6 12h12" />
      <path d="M6 16h7" />
      <rect x="2.5" y="3.5" width="19" height="17" rx="2.5" />
    </svg>
  );
}

export function IcoExternal(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

export function IcoLogout(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function IcoChevronDown(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IcoChevronRight(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IcoArrowRight(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IcoMenu(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

type IconComponent = (p: IconProps) => React.JSX.Element;

/** 사이드바 그룹 라벨 → 아이콘. 라벨은 resources.ts MENU_GROUPS 가 단일 출처다. */
export const GROUP_ICONS: Record<string, IconComponent> = {
  일정: IcoCalendar,
  '뉴스·공지': IcoMegaphone,
  '학과 소개': IcoColumns,
  '학사·교과': IcoBook,
  '학생 활동·연구': IcoFlask,
  동문: IcoGradCap,
};

/** 개별 항목에 더 어울리는 아이콘이 있으면 그것을, 없으면 그룹 아이콘을 쓴다.
 *  (최근 편집 카드 등 항목 단위 표기에 사용 — 목업의 교수진=사람, 공지=문서 대응) */
const ENTRY_ICONS: Record<string, IconComponent> = {
  'collection:facultyDirectory': IcoUsers,
  'collection:staff': IcoUsers,
  'board:noticesUndergrad': IcoDocLines,
  'board:noticesGraduate': IcoDocLines,
  'board:noticesExternal': IcoDocLines,
  'board:noticesScholarship': IcoDocLines,
  'board:calendar': IcoCalendar,
};

export function entryIcon(entry: MenuEntry, groupLabel: string): IconComponent {
  const key =
    entry.type === 'board'
      ? `board:${entry.boardKey}`
      : entry.type === 'collection'
        ? `collection:${entry.resourceKey}`
        : entry.type === 'markdown'
          ? `markdown:${entry.pageKey}`
          : '';
  return ENTRY_ICONS[key] ?? GROUP_ICONS[groupLabel] ?? IcoDocLines;
}
