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
 * ⚠️ 콘텐츠 탭 페이지(undergraduate 등, TabbedContent)는 해시가 현역 문법이다 —
 *    이 컴포넌트는 게시판 목록에만 마운트한다.
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
