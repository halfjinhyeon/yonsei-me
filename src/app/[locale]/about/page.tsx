import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Section, SectionHeader } from '@/components/Section';
import { Card } from '@/components/Card';
import { Prose } from '@/components/Prose';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { FacultyDirectoryGrid } from '@/components/FacultyDirectoryGrid';
import { getPageMarkdown } from '@/lib/pages';
import { getFacultyDirectory } from '@/lib/faculty';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'about' });
  return { title: t('hero.title') };
}

const visionKeys = ['0', '1', '2'] as const;

// 연세대 신촌캠퍼스 좌표 기반 OpenStreetMap 임베드 (API 키 불필요)
const OSM_EMBED =
  'https://www.openstreetmap.org/export/embed.html?bbox=126.933%2C37.562%2C126.943%2C37.568&layer=mapnik&marker=37.5651%2C126.9385';
const OSM_LINK = 'https://www.openstreetmap.org/?mlat=37.5651&mlon=126.9385#map=17/37.5651/126.9385';

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
    { label: tContact('addressLabel'), value: tFooter('address') },
    { label: tContact('phoneLabel'), value: '02-2123-0000' },
    { label: tContact('emailLabel'), value: 'me@yonsei.ac.kr', href: 'mailto:me@yonsei.ac.kr' },
  ];

  const historyMd = getPageMarkdown('about-history');

  const tabs: TabItem[] = [
    {
      key: 'history',
      label: tMenu('about.items.history'),
      markdown: historyMd,
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
    },
    {
      key: 'directions',
      label: tMenu('about.items.directions'),
      markdown: null,
      content: (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr]">
          <Card>
            <dl className="space-y-6">
              {contactRows.map((row) => (
                <div key={row.label}>
                  <dt className="text-xs font-bold uppercase tracking-wide text-content-faint">
                    {row.label}
                  </dt>
                  <dd className="mt-1 text-base leading-relaxed text-content">
                    {row.href ? (
                      <a href={row.href} className="text-yonsei-blue hover:underline">
                        {row.value}
                      </a>
                    ) : (
                      row.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="overflow-hidden rounded-card border border-surface-border shadow-card">
            <iframe
              src={OSM_EMBED}
              title={tContact('mapTitle')}
              loading="lazy"
              className="h-[360px] w-full lg:h-full"
              style={{ border: 0 }}
            />
            <div className="bg-surface px-4 py-3 text-right text-sm">
              <a
                href={OSM_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="text-yonsei-blue hover:underline"
              >
                {tContact('mapTitle')} ↗
              </a>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        breadcrumb={[{ label: tNav('about') }]}
      />

      {/* 소개 */}
      <Section aria-labelledby="intro-title">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <p className="eyebrow">ABOUT</p>
            <h2 id="intro-title" className="mt-3 text-headline font-bold text-content">
              {t('intro.title')}
            </h2>
          </div>
          <p className="text-lg leading-relaxed text-content-soft">{t('intro.body')}</p>
        </div>
      </Section>

      {/* 비전과 목표 */}
      <Section tone="soft" aria-labelledby="vision-title">
        <SectionHeader title={t('vision.title')} id="vision-title" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {visionKeys.map((key) => (
            <Card key={key}>
              <h3 className="text-lg font-bold text-yonsei-navy">
                {t(`vision.items.${key}.title`)}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-content-soft">
                {t(`vision.items.${key}.body`)}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* 연혁·교수진·교직원·오시는 길 — 다른 메뉴와 동일한 인덱스 탭 방식 */}
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('about.label')} />

      {/* 학부장 인사말 */}
      <Section tone="brand" aria-labelledby="dean-title">
        <figure className="mx-auto max-w-3xl text-center">
          <p className="text-yonsei-gold" aria-hidden="true">
            <span className="text-5xl font-serif leading-none">“</span>
          </p>
          <blockquote>
            <h2 id="dean-title" className="sr-only">
              {t('dean.title')}
            </h2>
            <p className="text-xl font-medium leading-relaxed text-white sm:text-2xl">
              {t('dean.body')}
            </p>
          </blockquote>
          <figcaption className="mt-8 text-sm font-semibold text-white/70">
            — {t('dean.sign')}
          </figcaption>
        </figure>
      </Section>
    </>
  );
}
