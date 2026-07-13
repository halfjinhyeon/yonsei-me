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
};

export default withNextIntl(nextConfig);
