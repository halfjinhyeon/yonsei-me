import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ContactInfoPanel } from '@/components/ContactInfoPanel';
import { DirectionsInfo } from '@/components/DirectionsInfo';
import { KakaoMap } from '@/components/KakaoMap';
import { AboutTabPage } from '../_shared/AboutTabPage';
import { aboutTabMetadata } from '../_shared/tabs';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return aboutTabMetadata(params.locale, 'directions');
}

// 연세대 신촌캠퍼스 제4공학관 좌표 기반 카카오맵 링크 (한글 포함 → encodeURI)
const KAKAO_MAP_LINK = encodeURI(
  'https://map.kakao.com/link/map/연세대학교 제4공학관,37.5651,126.9385',
);

/** 오시는 길 — 연락처 패널 + 카카오맵 + 지하철·버스 교통편 */
export default async function AboutDirectionsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tContact = await getTranslations({ locale: params.locale, namespace: 'contact' });
  const tFooter = await getTranslations({ locale: params.locale, namespace: 'footer' });

  const contactRows = [
    // footer.address 가 이미 "[03722] …" 로 시작한다 — 뒤에 우편번호를 또 붙이지 말 것
    { label: tContact('addressLabel'), value: tFooter('address') },
    { label: tContact('phoneLabel'), value: '02-2123-2810' },
    { label: tContact('emailLabel'), value: 'me@yonsei.ac.kr', href: 'mailto:me@yonsei.ac.kr' },
  ];

  return (
    <AboutTabPage locale={params.locale} tab="directions">
      {/* 연락처 패널과 지도를 한 카드로 합침 — 각진 톤(라운드 없이 테두리+그림자).
          좌측 카드는 우측 지도보다 좁게(총폭은 컨테이너 고정이라 불변) */}
      <div className="grid overflow-hidden border border-surface-border shadow-card lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.5fr)]">
        <ContactInfoPanel rows={contactRows} />
        {/* 지도 — 하단 링크 바 없이 카드 바닥까지 채우고, 약도 링크는 지도 위 배지로.
            min-w-0: 지도가 그리드 트랙보다 넓어지지 못하게(KakaoMap 주석 참고) */}
        <div className="relative flex min-w-0 flex-col">
          <KakaoMap className="h-[270px] w-full lg:h-auto lg:flex-1" />
          <a
            href={KAKAO_MAP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 left-3 z-10 bg-surface/90 px-3 py-1.5 text-xs font-semibold text-yonsei-blue shadow-card transition-colors hover:bg-surface"
          >
            {tContact('mapTitle')} ↗
          </a>
        </div>
      </div>
      {/* 지하철·버스 교통편 안내 */}
      <DirectionsInfo locale={params.locale as Locale} />
    </AboutTabPage>
  );
}
