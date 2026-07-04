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
  },
};

export default withNextIntl(nextConfig);
