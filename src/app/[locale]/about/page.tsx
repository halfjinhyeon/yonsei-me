import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { ContactInfoPanel } from '@/components/ContactInfoPanel';
import { DirectionsInfo } from '@/components/DirectionsInfo';
import { AboutIntro } from '@/components/AboutIntro';
import { Prose } from '@/components/Prose';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { AdmissionGuide } from '@/components/AdmissionGuide';
import { CareerPaths } from '@/components/CareerPaths';
import { FacultyDirectoryGrid } from '@/components/FacultyDirectoryGrid';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { KakaoMap } from '@/components/KakaoMap';
import { getFacultyProfileNames } from '@/lib/faculty';
import { getHistoryImages } from '@/lib/history-images';
import { pick } from '@/lib/content';
import {
  getHistoryRuntime,
  getStaffRuntime,
  getFacultyDirectoryRuntime,
} from '@/lib/content-runtime';
import { pageAlternates } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 연혁·교수진·교직원이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'about' });
  return {
    title: t('hero.title'),
    description: t('hero.subtitle'),
    // hreflang(ko/en/x-default) + 자기 canonical. 통째로 대입해야 한다 — 부분만 넣으면
    // 얕은 병합이라 레이아웃의 canonical 이 사라진다.
    alternates: pageAlternates('about'),
  };
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

  // 콘텐츠 데이터 — 소스(db/git)는 lib/content-runtime 이 판별. 기존 매핑 코드를
  // 그대로 쓰기 위해 모듈 상수와 같은 이름(history/staff)의 지역 변수로 받는다.
  const history = await getHistoryRuntime();
  const staff = await getStaffRuntime();
  const faculty = await getFacultyDirectoryRuntime();

  const contactRows = [
    // footer.address 가 이미 "[03722] …" 로 시작한다 — 뒤에 우편번호를 또 붙이지 말 것
    { label: tContact('addressLabel'), value: tFooter('address') },
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
          <HistoryTimeline
            events={history}
            locale={params.locale as Locale}
            images={getHistoryImages()}
          />
        </>
      ),
    },
    {
      key: 'faculty',
      label: tMenu('about.items.faculty'),
      markdown: null,
      content: (
        <FacultyDirectoryGrid
          items={faculty}
          moreLabel={tFaculty('moreLabel')}
          profileNames={getFacultyProfileNames()}
        />
      ),
    },
    {
      key: 'staff',
      label: tMenu('about.items.staff'),
      markdown: null,
      // 행정 교직원 표 — 데이터는 content/staff.json (콘텐츠/코드 분리).
      // 에디토리얼 표 문법(prose-content table 과 동일): 네이비 상단 룰 + 헤어라인,
      // 배경 없는 작은 헤더, 넉넉한 행(py-5), 첫 컬럼(구분) 볼드 행 라벨.
      content: (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <thead className="border-b border-t-2 border-surface-border border-t-yonsei-navy">
              <tr>
                {(['role', 'name', 'phone', 'location', 'email'] as const).map((col) => (
                  <th key={col} scope="col" className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-bold text-content-faint">
                    {t(`staffTable.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.email} className="border-b border-surface-border">
                  <td className="whitespace-nowrap px-3 py-5 font-semibold text-content">{pick(s.role, params.locale as Locale)}</td>
                  <td className="whitespace-nowrap px-3 py-5 font-medium text-content">{pick(s.name, params.locale as Locale)}</td>
                  <td className="whitespace-nowrap px-3 py-5 tabular-nums text-content-soft">{s.phone}</td>
                  <td className="whitespace-nowrap px-3 py-5 text-content-soft">{pick(s.location, params.locale as Locale)}</td>
                  <td className="px-3 py-5">
                    <a href={`mailto:${s.email}`} className="font-medium text-yonsei-blue underline-offset-2 hover:underline">
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
    {
      key: 'careers',
      label: tMenu('about.items.careers'),
      markdown: null,
      // 졸업 후 진로 — 타임라인 + 진로 분야(직무/경로/직렬) + 학위 요건 인포그래픽
      content: <CareerPaths locale={params.locale as Locale} />,
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
