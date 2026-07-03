import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Container } from '@/components/Container';
import { Link } from '@/i18n/navigation';
import { news, getNewsBySlug, pick } from '@/lib/content';
import { formatDate } from '@/lib/utils';
import { routing, type Locale } from '@/i18n/routing';

// 모든 로케일 × 슬러그를 정적 생성
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    news.map((item) => ({ locale, slug: item.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const item = getNewsBySlug(params.slug);
  if (!item) return {};
  return {
    title: pick(item.title, params.locale as Locale),
    description: pick(item.excerpt, params.locale as Locale),
  };
}

export default async function NewsDetailPage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const item = getNewsBySlug(params.slug);
  const t = await getTranslations({ locale, namespace: 'news' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });

  if (!item) {
    return (
      <Section>
        <div className="mx-auto max-w-prose text-center">
          <p className="text-lg text-content-soft">{t('notFound')}</p>
          <Link href="/news" className="btn-secondary mt-6">
            ← {t('backToList')}
          </Link>
        </div>
      </Section>
    );
  }

  return (
    <>
      <Breadcrumb
        items={[{ label: tNav('news'), href: '/news' }, { label: pick(item.title, locale) }]}
      />
      <article className="py-section-sm">
        <Container>
          <div className="mx-auto max-w-prose">
            <p className="text-sm font-semibold text-yonsei-blue">
              {t(`categories.${item.category}`)}
            </p>
            <h1 className="mt-3 text-headline font-bold text-content">
              {pick(item.title, locale)}
            </h1>
            <time
              dateTime={item.date}
              className="mt-3 block text-sm text-content-faint"
            >
              {formatDate(item.date, locale)}
            </time>

            <div className="mt-8 border-t border-surface-border pt-8">
              <p className="text-lg leading-relaxed text-content-soft">
                {pick(item.body, locale)}
              </p>
            </div>

            <div className="mt-12">
              <Link href="/news" className="btn-secondary">
                ← {t('backToList')}
              </Link>
            </div>
          </div>
        </Container>
      </article>
    </>
  );
}
