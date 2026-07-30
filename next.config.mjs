import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // dev 서버(npm run dev)와 프로덕션(next build/start)이 같은 .next 폴더를
  // 공유하면 서로의 산출물을 덮어써 500 에러가 나므로, dev는 별도 폴더를 쓴다.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  images: {
    formats: ['image/avif', 'image/webp'],
    // CMS 첨부(썸네일 등)는 외부 스토리지에 저장된다 — next/image 는 허용 목록에
    // 없는 외부 도메인을 거부하므로 열어 준다. R2 퍼블릭 도메인(pub-*.r2.dev)이
    // 현행이고, Blob 도메인은 과거 업로드 잔존분 호환용(정리 후 제거 예정).
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
  experimental: {
    // ISR 전환(Stage A)으로 fs 읽기가 빌드 시점이 아니라 요청 시점에 실행된다:
    // content/*.json·*.md 폴백(lib/content-runtime), content/faculty-profiles(교수 상세),
    // public/img/history·faculty 의 readdir(파일명 규약 매칭). 서버리스 함수 번들에
    // 이 파일들이 없으면 폴백이 빈 값으로 떨어지므로 전 라우트에 강제 포함시킨다.
    // 키는 라우트 경로에 picomatch({contains:true})로 매칭된다 — '**' 만 '/[locale]'
    // (홈)까지 포함한다('/**/*' 는 한 세그먼트 라우트를 놓친다).
    outputFileTracingIncludes: {
      '**': ['./content/**', './public/img/history/**', './public/img/faculty/**'],
    },
  },
};

export default withNextIntl(nextConfig);
