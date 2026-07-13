import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { ContactInfoPanel } from '@/components/ContactInfoPanel';
import { DirectionsInfo } from '@/components/DirectionsInfo';
import { AboutIntro } from '@/components/AboutIntro';
import { Prose } from '@/components/Prose';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { AdmissionGuide } from '@/components/AdmissionGuide';
import { FacultyDirectoryGrid } from '@/components/FacultyDirectoryGrid';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { KakaoMap } from '@/components/KakaoMap';
import { getFacultyDirectory } from '@/lib/faculty';
import { history, staff, pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'about' });
  return { title: t('hero.title') };
}

// 연세대 신촌캠퍼스 제4공학관 좌표 기반 카카오맵 링크 (한글 포함 → encodeURI)
const KAKAO_MAP_LINK = encodeURI(
  'https://map.kakao.com/link/map/연세대학교 제4공학관,37.5651,126.9385',
);

export default async function AboutPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'about' });
  const tNav = await getTranslations({ locale: params.locale, namespace: 'nav' });
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tFaculty = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  const tContact = await getTranslations({ locale: params.locale, namespace: 'contact' });
  const tFooter = await getTranslations({ locale: params.locale, namespace: 'footer' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  const contactRows = [
    { label: tContact('addressLabel'), value: `${tFooter('address')} (03722)` },
    { label: tContact('phoneLabel'), value: '02-2123-2810' },
    { label: tContact('emailLabel'), value: 'me@yonsei.ac.kr', href: 'mailto:me@yonsei.ac.kr' },
  ];

  const tabs: TabItem[] = [
    {
      key: 'history',
      label: tMenu('about.items.history'),
      markdown: null,
      // 학부 소개 문구는 모든 탭 공통 상단이 아니라 연혁 탭 안에서만 보여준다 (UX)
      content: (
        <>
          <AboutIntro locale={params.locale} />
          <HistoryTimeline events={history} locale={params.locale as Locale} />
        </>
      ),
    },
    {
      key: 'faculty',
      label: tMenu('about.items.faculty'),
      markdown: null,
      content: <FacultyDirectoryGrid items={getFacultyDirectory()} moreLabel={tFaculty('moreLabel')} />,
    },
    {
      key: 'staff',
      label: tMenu('about.items.staff'),
      markdown: null,
      // 행정 교직원 표 — 데이터는 content/staff.json (콘텐츠/코드 분리)
      content: (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-center text-sm sm:text-base">
            <thead>
              <tr className="border-b-2 border-yonsei-navy bg-surface-soft">
                {(['role', 'name', 'phone', 'location', 'email'] as const).map((col) => (
                  <th key={col} scope="col" className="px-4 py-3 font-bold text-content">
                    {t(`staffTable.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.email} className="border-b border-surface-border">
                  <td className="whitespace-nowrap px-4 py-3 text-content-soft">{pick(s.role, params.locale as Locale)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-content">{pick(s.name, params.locale as Locale)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-content-soft">{s.phone}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-soft">{pick(s.location, params.locale as Locale)}</td>
                  <td className="px-4 py-3">
                    <a href={`mailto:${s.email}`} className="text-yonsei-blue hover:underline">
                      {s.email}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      key: 'directions',
      label: tMenu('about.items.directions'),
      markdown: null,
      content: (
        <>
          {/* 연락처 패널과 지도를 한 카드로 합침 — 모서리는 rounded-lg로 각지게 */}
          <div className="grid overflow-hidden rounded-lg border border-surface-border shadow-card lg:grid-cols-[1fr_1.5fr]">
            <ContactInfoPanel rows={contactRows} />
            {/* 지도 — 하단 링크 바 없이 카드 바닥까지 채우고, 약도 링크는 지도 위 배지로 */}
            <div className="relative flex flex-col">
              <KakaoMap className="h-[270px] w-full lg:h-auto lg:flex-1" />
              <a
                href={KAKAO_MAP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 left-3 z-10 rounded-md bg-surface/90 px-3 py-1.5 text-xs font-semibold text-yonsei-blue shadow-card transition-colors hover:bg-surface"
              >
                {tContact('mapTitle')} ↗
              </a>
            </div>
          </div>
          {/* 지하철·버스 교통편 안내 */}
          <DirectionsInfo locale={params.locale as Locale} />
        </>
      ),
    },
    {
      key: 'admission',
      label: tMenu('about.items.admission'),
      markdown: null,
      // 입학 안내 — 대학/대학원 2단 섹션(문안·버튼은 content/admission-guide.json)
      content: <AdmissionGuide locale={params.locale as Locale} />,
    },
  ];

  return (
    <>
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        breadcrumb={[{ label: tNav('about') }]}
      />

      {/* 연혁·교수진·교직원·오시는 길 — 다른 메뉴와 동일한 인덱스 탭 방식 */}
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('about.label')} />
    </>
  );
}
