'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * 레거시 해시 링크 구제 — 게시판 목록 페이지 전용.
 *
 * 탭이 경로 기반(/news/notices)이 되기 전의 외부 링크·북마크는 `/news#seminars`
 * 형태다. 해시는 서버로 전송되지 않아 서버 리다이렉트로는 못 잡고, 브라우저가
 * 리다이렉트를 따라가며 해시를 보존하므로(`/news` 308 → `/news/notices#seminars`)
 * 목록 페이지에 이 컴포넌트를 얹어 최종 목적지로 client replace 한다.
 *
 * 게시판 목록의 기본 탭과 콘텐츠 섹션(about·undergraduate·graduate·research)의
 * 기본 탭 페이지에 마운트한다 — 2차 개편으로 콘텐츠 탭도 전부 경로가 되면서
 * `/undergraduate#checker` 류 구 링크도 같은 방식으로 구제한다.
 */
export function LegacyBoardHash({ map }: { map: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname(); // 로케일 접두사 없는 경로 ('/news/notices')
  useEffect(() => {
    const key = window.location.hash.slice(1);
    if (!key) return;
    const target = map[key];
    // 자기 자신을 가리키는 해시(/news/notices#notices)는 그대로 두면 자연 소멸한다
    if (target && target !== pathname) router.replace(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
