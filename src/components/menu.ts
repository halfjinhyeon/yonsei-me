/** 현행 학부 홈페이지의 6개 대분류 메뉴 구조.
 *  labelKey는 messages의 menu.<group>.label / menu.<group>.items.<key> 를 가리킨다.
 *  세부항목 추가/수정은 이 파일과 메시지 파일만 편집하면 된다.
 *
 *  ⚠️ 소식·동문 그룹의 세부항목은 해시가 아니라 **경로**다(게시판이 각자 URL 을 갖는다).
 *     경로 문법의 단일 출처는 @/lib/board-links — 여기서 문자열을 조립하지 말 것.
 *     key 는 라벨 조회 키라 URL 세그먼트와 다를 수 있다(뉴스: key 'news' ↔ /news/press). */
import { newsTabHref } from '@/lib/board-links';

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
      { key: 'notices', href: newsTabHref('notices') },
      // 라벨 키는 'news' 지만 URL 세그먼트는 'press' 다(/news/news 중첩 회피 — board-links 참고)
      { key: 'news', href: newsTabHref('press') },
      { key: 'thesis', href: newsTabHref('thesis') },
      { key: 'resources', href: newsTabHref('resources') },
      { key: 'career', href: newsTabHref('career') },
      { key: 'events', href: newsTabHref('events') },
      { key: 'seminars', href: newsTabHref('seminars') },
      { key: 'calendar', href: newsTabHref('calendar') },
    ],
  },
  {
    key: 'alumni',
    href: '/alumni',
    items: [
      // /alumni 자체가 '동문회 소개' 페이지다(리다이렉트가 아니라 그 콘텐츠를 직접 렌더)
      { key: 'association', href: '/alumni' },
      { key: 'news', href: '/alumni/news' },
      { key: 'network', href: '/alumni/network' },
    ],
  },
];
