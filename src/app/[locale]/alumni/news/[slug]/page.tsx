import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Section } from '@/components/Section';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/content';
import { fetchAlumniNewsBySlug, postsBodyFormat } from '@/lib/posts';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 요청 시 렌더 + ISR (revalidateTag('posts') 가 즉시 갱신)
export const revalidate = 300;

// 동문 페이지(/alumni)와 동일한 3개 탭 (key/label)
async function getAlumniTabs(locale: Locale): Promise<BoardShellTab[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return [
    { key: 'association', label: tMenu('alumni.items.association') },
    { key: 'news', label: tMenu('alumni.items.news') },
    { key: 'network', label: tMenu('alumni.items.network') },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const item = await fetchAlumniNewsBySlug(params.slug);
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
  const item = await fetchAlumniNewsBySlug(params.slug);
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
          bodyFormat={postsBodyFormat()}
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
