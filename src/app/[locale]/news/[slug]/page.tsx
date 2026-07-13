import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Section } from '@/components/Section';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/content';
import { fetchNewsBySlug, postsBodyFormat } from '@/lib/posts';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 글이 DB 에 살므로 빌드 시 열거하지 않고 요청 시 렌더 + ISR.
// CMS 쓰기의 revalidateTag('posts') 가 즉시 갱신하고, 이 값은 안전망이다.
export const revalidate = 300;

// 목록 페이지(/news)와 동일한 8개 탭 (key/label)
async function getNewsTabs(locale: Locale): Promise<BoardShellTab[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return [
    { key: 'notices', label: tMenu('news.items.notices') },
    { key: 'news', label: tMenu('news.items.news') },
    { key: 'thesis', label: tMenu('news.items.thesis') },
    { key: 'resources', label: tMenu('news.items.resources') },
    { key: 'career', label: tMenu('news.items.career') },
    { key: 'events', label: tMenu('news.items.events') },
    { key: 'seminars', label: tMenu('news.items.seminars') },
    { key: 'calendar', label: tMenu('news.items.calendar') },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const item = await fetchNewsBySlug(params.slug);
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
  const item = await fetchNewsBySlug(params.slug);
  const t = await getTranslations({ locale, namespace: 'news' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });

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

  const boardName = tMenu('news.items.news');
  const tabs = await getNewsTabs(locale);

  return (
    <>
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        breadcrumb={[{ label: tMenu('news.label'), href: '/news' }, { label: boardName }]}
      />
      <BoardShell tabs={tabs} activeKey="news" navTitle={tMenu('news.label')}>
        <PostArticle
          boardName={boardName}
          title={pick(item.title, locale)}
          date={item.date}
          metaValue={t(`categories.${item.category}`)}
          body={pick(item.body, locale)}
          bodyFormat={postsBodyFormat()}
          attachments={item.attachments}
          attachmentLabels={item.attachments?.map((a) => pick(a.label, locale))}
          backHref="/news#news"
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
