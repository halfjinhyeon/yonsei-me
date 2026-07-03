import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { Card } from '@/components/Card';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'contact' });
  return { title: t('hero.title') };
}

// 연세대 신촌캠퍼스 좌표 기반 OpenStreetMap 임베드 (API 키 불필요)
const OSM_EMBED =
  'https://www.openstreetmap.org/export/embed.html?bbox=126.933%2C37.562%2C126.943%2C37.568&layer=mapnik&marker=37.5651%2C126.9385';
const OSM_LINK = 'https://www.openstreetmap.org/?mlat=37.5651&mlon=126.9385#map=17/37.5651/126.9385';

export default function ContactPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations('contact');
  const tNav = useTranslations('nav');
  const tFooter = useTranslations('footer');

  const info = [
    { label: t('addressLabel'), value: tFooter('address') },
    { label: t('phoneLabel'), value: '02-2123-0000' },
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
        <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr]">
          {/* 연락처 정보 */}
          <Card>
            <dl className="space-y-6">
              {info.map((row) => (
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

          {/* 지도 */}
          <div className="overflow-hidden rounded-card border border-surface-border shadow-card">
            <iframe
              src={OSM_EMBED}
              title={t('mapTitle')}
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
                {t('mapTitle')} ↗
              </a>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
