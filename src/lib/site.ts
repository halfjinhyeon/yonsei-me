/** 사이트 공용 상수 — 배포 도메인(구조화 데이터·사이트맵·robots 공통).
 *
 *  컷오버(me.yonsei.ac.kr DNS 이전) 때는 코드를 고치지 않고 Vercel 환경변수
 *  `NEXT_PUBLIC_SITE_URL=https://me.yonsei.ac.kr` 만 넣고 재배포하면 된다 —
 *  canonical·hreflang·사이트맵·robots·JSON-LD 가 한 번에 새 도메인을 가리킨다.
 *  되돌리려면 그 변수를 지운다(기본값이 현행 Vercel 도메인).
 *  끝 슬래시는 잘라 낸다 — `${SITE_URL}/…` 조립이 이중 슬래시가 되면 안 된다. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://yonsei-me.vercel.app';
