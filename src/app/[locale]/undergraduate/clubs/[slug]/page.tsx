import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { Prose } from '@/components/Prose';
import { getPageMarkdown } from '@/lib/pages';
import { getClubs } from '@/lib/faculty';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  const clubs = getClubs();
  return routing.locales.flatMap((locale) => clubs.map((c) => ({ locale, slug: c.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const club = getClubs().find((c) => c.slug === params.slug);
  return { title: club?.name };
}

export default async function ClubDetailPage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(params.locale);
  const club = getClubs().find((c) => c.slug === params.slug);
  if (!club) notFound();

  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const markdown = getPageMarkdown(`club-${club.slug}`);

  return (
    <>
      <Hero
        title={club.name}
        subtitle={club.teaser}
        breadcrumb={[
          { label: tMenu('undergraduate.label'), href: '/undergraduate' },
          { label: tMenu('undergraduate.items.clubs'), href: '/undergraduate#clubs' },
          { label: club.name },
        ]}
      />
      <Section>{markdown ? <Prose markdown={markdown} /> : null}</Section>
    </>
  );
}
