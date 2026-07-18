import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { ContactInfoPanel } from '@/components/ContactInfoPanel';
import { DirectionsInfo } from '@/components/DirectionsInfo';
import { KakaoMap } from '@/components/KakaoMap';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'contact' });
  return { title: t('hero.title'), description: t('hero.subtitle') };
}

// 연세대 신촌캠퍼스 제4공학관 좌표 기반 카카오맵 링크 (한글 포함 → encodeURI)
const KAKAO_MAP_LINK = encodeURI(
  'https://map.kakao.com/link/map/연세대학교 제4공학관,37.5651,126.9385',
);

export default function ContactPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations('contact');
  const tNav = useTranslations('nav');
  const tFooter = useTranslations('footer');

  const info = [
    { label: t('addressLabel'), value: tFooter('address') },
    { label: t('phoneLabel'), value: '02-2123-2810' },
    { label: t('emailLabel'), value: 'me@yonsei.ac.kr', href: 'mailto:me@yonsei.ac.kr' },
  ];

  return (
    <>
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        breadcrumb={[{ label: tNav('contact') }]}
      />
      <Section>
        {/* 연락처 패널과 지도를 한 카드로 합침 — 모서리는 rounded-lg로 각지게 */}
        <div className="grid overflow-hidden rounded-lg border border-surface-border shadow-card lg:grid-cols-[1fr_1.5fr]">
          {/* 연락처 정보 — 동아리 카드 스타일 비주얼 패널 */}
          <ContactInfoPanel rows={info} />

          {/* 지도 — 하단 링크 바 없이 카드 바닥까지 채우고, 약도 링크는 지도 위 배지로 */}
          <div className="relative flex flex-col">
            <KakaoMap className="h-[360px] w-full lg:h-auto lg:flex-1" />
            <a
              href={KAKAO_MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 left-3 z-10 rounded-md bg-surface/90 px-3 py-1.5 text-xs font-semibold text-yonsei-blue shadow-card transition-colors hover:bg-surface"
            >
              {t('mapTitle')} ↗
            </a>
          </div>
        </div>

        {/* 지하철·버스 교통편 안내 */}
        <DirectionsInfo locale={params.locale as Locale} />
      </Section>
    </>
  );
}
