import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// 로케일을 인지하는 래퍼: 이 프로젝트 전역에서 next/link, next/navigation 대신 사용
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
