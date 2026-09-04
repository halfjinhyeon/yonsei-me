import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Container } from '@/components/Container';
import { Link } from '@/i18n/navigation';
import { menu } from '@/components/menu';
import { pageMetadata } from '@/lib/page-metadata';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = params.locale as Locale;
  const t = await getTranslations({ locale, namespace: 'footer' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata({
    locale,
    path: 'sitemap',
    title: t('sitemap'),
    description: tSeo('pages.sitemap'),
  });
}

/**
 * 사용자용 HTML 사이트맵 — 전체 메뉴 구조를 한 페이지에 디렉터리로 펼친다
 * (크롤러용 /sitemap.xml 과 별개). menu.ts 를 단일 출처로 자동 생성되므로
 * 메뉴가 바뀌면 이 페이지도 함께 갱신된다.
 * 문법: 그룹명(블루, 링크) → 진한 헤어라인 → 하위 링크 그리드(레퍼런스 학과 사이트 구성).
 */
export default async function SitemapPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tFooter = await getTranslations({ locale: params.locale, namespace: 'footer' });

  return (
    <>
      <Hero title={tFooter('sitemap')} breadcrumb={[{ label: tFooter('sitemap') }]} />
      <Container className="py-14 lg:py-20">
        <div className="space-y-14 lg:space-y-16">
          {menu.map((group) => (
            <section key={group.key} aria-labelledby={`sm-${group.key}`}>
              {/* 그룹명 — 블루 링크(그룹 대표 페이지로 이동) */}
              <h2 id={`sm-${group.key}`} className="text-xl font-bold sm:text-2xl">
                <Link
                  href={group.href}
                  className="text-yonsei-blue transition-colors hover:text-yonsei-navy"
                >
                  {tMenu(`${group.key}.label`)}
                </Link>
              </h2>
              {/* 진한 헤어라인 — 레퍼런스의 그룹 구분선 */}
              <div className="mt-3 border-b border-content" aria-hidden="true" />
              {/* 하위 링크 그리드 */}
              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
                {group.items.map((sub) => (
                  <li key={sub.key}>
                    <Link
                      href={sub.href}
                      className="-my-1 inline-block py-1 text-[15px] font-medium text-content transition-colors hover:text-yonsei-blue"
                    >
                      {tMenu(`${group.key}.items.${sub.key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
