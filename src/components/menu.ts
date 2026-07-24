/** 현행 학부 홈페이지의 6개 대분류 메뉴 구조.
 *  labelKey는 messages의 menu.<group>.label / menu.<group>.items.<key> 를 가리킨다.
 *  세부항목 추가/수정은 이 파일과 메시지 파일만 편집하면 된다. */
export interface MenuSubItem {
  key: string;
  href: string;
}

export interface MenuGroup {
  key: string;
  href: string;
  items: MenuSubItem[];
}

export const menu: MenuGroup[] = [
  {
    key: 'about',
    href: '/about',
    items: [
      { key: 'history', href: '/about#history' },
      { key: 'faculty', href: '/about#faculty' },
      { key: 'staff', href: '/about#staff' },
      { key: 'directions', href: '/about#directions' },
      { key: 'admission', href: '/about#admission' },
      { key: 'careers', href: '/about#careers' },
    ],
  },
  {
    key: 'undergraduate',
    href: '/undergraduate',
    items: [
      { key: 'goals', href: '/undergraduate#goals' },
      { key: 'requirements', href: '/undergraduate#requirements' },
      { key: 'checker', href: '/undergraduate#checker' },
      { key: 'mileage', href: '/undergraduate#mileage' },
      { key: 'courses', href: '/undergraduate#courses' },
      { key: 'curriculum', href: '/undergraduate#curriculum' },
      { key: 'clubs', href: '/undergraduate#clubs' },
      { key: 'scholarship', href: '/undergraduate#scholarship' },
    ],
  },
  {
    key: 'graduate',
    href: '/graduate',
    items: [
      { key: 'requirements', href: '/graduate#requirements' },
      { key: 'courses', href: '/graduate#courses' },
      { key: 'labs', href: '/graduate#labs' },
      { key: 'bk21', href: '/graduate#bk21' },
    ],
  },
  {
    key: 'research',
    href: '/research',
    items: [
      { key: 'vision', href: '/research#vision' },
      { key: 'capacity', href: '/research#capacity' },
      { key: 'labs', href: '/research#labs' },
      { key: 'internships', href: '/research#internships' },
      { key: 'social', href: '/research#social' },
      { key: 'recruit', href: '/research#recruit' },
    ],
  },
  {
    key: 'news',
    href: '/news',
    items: [
      { key: 'notices', href: '/news#notices' },
      { key: 'news', href: '/news#news' },
      { key: 'thesis', href: '/news#thesis' },
      { key: 'resources', href: '/news#resources' },
      { key: 'career', href: '/news#career' },
      { key: 'events', href: '/news#events' },
      { key: 'seminars', href: '/news#seminars' },
      { key: 'calendar', href: '/news#calendar' },
    ],
  },
  {
    key: 'alumni',
    href: '/alumni',
    items: [
      { key: 'greeting', href: '/alumni#greeting' },
      { key: 'news', href: '/alumni#news' },
      { key: 'network', href: '/alumni#network' },
    ],
  },
];
