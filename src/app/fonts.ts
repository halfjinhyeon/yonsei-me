import localFont from 'next/font/local';

/**
 * 본문·제목 공통 폰트 Pretendard(가변폰트) 자체 호스팅.
 *
 * 왜 자체 호스팅: 이전에는 CSS 에서 'Pretendard' 이름만 지정하고 폰트 파일을
 * 싣지 않아, 방문자 기기에 Pretendard 가 설치돼 있어야만 의도한 서체로 보였다
 * (없으면 OS 기본 고딕으로 대체 → 기기마다 다른 모습). next/font/local 로 폰트를
 * 사이트에 포함하면 모든 기기에서 동일하게 렌더된다.
 *
 * - 가변폰트 woff2 한 파일이 100~900 전 굵기를 커버(요청 1회, 캐시 후 재사용)
 * - display: 'swap' — 폰트 로드 전에는 폴백으로 즉시 텍스트 표시(빈 화면 방지)
 * - variable: '--font-sans' — 기존 tailwind/globals 의 var(--font-sans) 에 그대로
 *   연결된다. next/font 가 지표 보정된 폴백까지 이 변수에 자동 포함해 CLS 를 줄인다.
 */
export const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
  fallback: ['system-ui', 'sans-serif'],
});

/**
 * 히어로 제목 전용 폰트 지마켓산스 Bold — 폰트 시험 후 사용자 확정(2026-07).
 * 적용처는 홈 히어로 "연세대학교 기계공학부" 한 곳(HeroSlideshow.module.css .title,
 * var(--font-hero) 참조). 전용 변수를 쓰는 이유: globals 의 --font-display 별칭
 * (display=sans)과 충돌하지 않는 격리 경로. 원본 TTF(2.4MB)는 woff2(591KB)로 변환.
 */
export const gmarket = localFont({
  src: './fonts/GmarketSansBold.woff2',
  variable: '--font-hero',
  display: 'swap',
  weight: '700',
  fallback: ['Pretendard', 'system-ui', 'sans-serif'],
});
