import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Section } from '@/components/Section';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { Link } from '@/i18n/navigation';
import { alumniNews, getAlumniNewsBySlug, pick } from '@/lib/content';
import { routing, type Locale } from '@/i18n/routing';

// 동문 페이지(/alumni)와 동일한 3개 탭 (key/label)
async function getAlumniTabs(locale: Locale): Promise<BoardShellTab[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return [
    { key: 'greeting', label: tMenu('alumni.items.greeting') },
    { key: 'news', label: tMenu('alumni.items.news') },
    { key: 'network', label: tMenu('alumni.items.network') },
  ];
}

// 모든 로케일 × 동문 뉴스 슬러그를 정적 생성
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    alumniNews.map((item) => ({ locale, slug: item.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const item = getAlumniNewsBySlug(params.slug);
  if (!item) return {};
  return {
    title: pick(item.title, params.locale as Locale),
    description: pick(item.excerpt, params.locale as Locale),
  };
}

export default async function AlumniNewsDetailPage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const item = getAlumniNewsBySlug(params.slug);
  const t = await getTranslations({ locale, namespace: 'news' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });

  if (!item) {
    return (
      <Section>
        <div className="mx-auto max-w-prose text-center">
          <p className="text-lg text-content-soft">{t('notFound')}</p>
          <Link href="/alumni" className="btn-secondary mt-6">
            ← {t('backToList')}
          </Link>
        </div>
      </Section>
    );
  }

  const boardName = tMenu('alumni.items.news');
  const tabs = await getAlumniTabs(locale);

  return (
    <>
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        breadcrumb={[
          { label: tMenu('alumni.label'), href: '/alumni' },
          { label: boardName },
        ]}
      />
      <BoardShell tabs={tabs} activeKey="news" navTitle={tMenu('alumni.label')} basePath="/alumni">
        <PostArticle
          boardName={boardName}
          title={pick(item.title, locale)}
          date={item.date}
          metaValue={t(`categories.${item.category}`)}
          body={pick(item.body, locale)}
          attachments={item.attachments}
          attachmentLabels={item.attachments?.map((a) => pick(a.label, locale))}
          backHref="/alumni#news"
          labels={{
            title: t('detail.titleLabel'),
            date: t('detail.dateLabel'),
            metaRow: t('detail.categoryLabel'),
            attachments: t('detail.attachmentsLabel'),
            backToList: t('backToList'),
          }}
          locale={locale}
        />
      </BoardShell>
    </>
  );
}
