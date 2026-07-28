/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text --
   여기의 <img>·<div> 는 DOM 이 아니라 Satori 가 PNG 로 그리는 가상 노드다.
   next/image 도 alt 도 적용 대상이 아니다(대체 텍스트는 아래 export const alt). */
// 링크 공유용 OG 이미지 (1200×630) — 카톡·슬랙 등에 뜨는 미리보기 카드.
// 사이트와 동일한 폰트(지마켓산스 Bold / Pretendard)와 네이비 #00285E 사용.
// 로고는 Satori 가 SVG 를 안정적으로 못 그리므로 public/og/logo.png (PNG 변환본) 사용.
//
// 위치가 [locale] 아래인 이유: 이 세그먼트 하위 모든 페이지가 이 이미지를 물려받는다.
// 루트(src/app)에 두면 실제 페이지가 사는 /ko·/en 에 적용되지 않는다.
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { routing } from '@/i18n/routing';

export const runtime = 'nodejs';

// [locale] 이 동적 세그먼트라 정적 생성에 파라미터 목록이 필요하다(레이아웃과 동일 규칙)
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
export const alt = '연세대학교 기계공학부 · School of Mechanical Engineering';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const asset = (rel: string) => readFile(join(process.cwd(), rel));
const dataUrl = async (rel: string, mime: string) =>
  `data:${mime};base64,${(await asset(rel)).toString('base64')}`;

export default async function Image() {
  const [eagle, logo, gmarket, pretendard] = await Promise.all([
    dataUrl('public/img/eagle.png', 'image/png'),
    dataUrl('public/og/logo.png', 'image/png'),
    asset('src/app/fonts/GmarketSansBold.woff2'),
    asset('src/app/fonts/PretendardVariable.woff2'),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          background: '#00285E',
          fontFamily: 'Pretendard',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex',
            background:
              'radial-gradient(ellipse 820px 620px at 72% 38%, rgba(46,134,214,0.28) 0%, rgba(0,40,94,0) 65%)',
          }}
        />
        <img src={eagle} width={520} style={{ position: 'absolute', right: 36, top: 106, opacity: 0.28 }} />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0 68px 88px', width: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <img src={logo} width={56} height={56} />
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 700, letterSpacing: '0.22em' }}>
              YONSEI UNIVERSITY
            </div>
          </div>
          <div
            style={{
              display: 'flex', flexDirection: 'column', color: '#ffffff',
              fontFamily: 'GmarketSans', fontSize: 84, lineHeight: 1.05, letterSpacing: '-0.02em',
            }}
          >
            <div>연세대학교</div>
            <div>기계공학부</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26 }}>
            <div style={{ width: 32, height: 1, background: 'rgba(255,255,255,0.5)', display: 'flex' }} />
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 22, fontWeight: 500 }}>
              School of Mechanical Engineering
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'GmarketSans', data: gmarket, weight: 700 },
        { name: 'Pretendard', data: pretendard, weight: 500 },
      ],
    },
  );
}
