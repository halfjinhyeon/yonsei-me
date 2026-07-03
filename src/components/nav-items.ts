/** 헤더/푸터가 공유하는 네비게이션 항목 정의.
 *  labelKey는 messages의 nav.* 키를 가리킨다. 새 메뉴는 여기만 수정하면 됨. */
export interface NavItem {
  href: string;
  labelKey: string;
}

export const navItems: NavItem[] = [
  { href: '/about', labelKey: 'about' },
  { href: '/faculty', labelKey: 'faculty' },
  { href: '/academics', labelKey: 'academics' },
  { href: '/research', labelKey: 'research' },
  { href: '/news', labelKey: 'news' },
  { href: '/admission', labelKey: 'admission' },
  { href: '/alumni', labelKey: 'alumni' },
  { href: '/contact', labelKey: 'contact' },
];
