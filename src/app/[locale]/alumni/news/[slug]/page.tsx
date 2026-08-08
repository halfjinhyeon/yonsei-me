import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { BoardShell } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { pick } from '@/lib/content';
import { fetchAlumniNewsBySlug, postsBodyFormat } from '@/lib/posts';
import { documentMetadata } from '@/lib/seo';
import { getAlumniTabs } from '../../_shared/tabs';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 요청 시 렌더 + ISR (revalidateTag('posts') 가 즉시 갱신)
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const item = await fetchAlumniNewsBySlug(params.slug);
  // 없는 글은 notFound() 로 떨어져 not-found 페이지가 자기 메타를 갖는다 → 여기선 빈 객체.
  if (!item) return {};
  const locale = params.locale as Locale;
  return {
    title: pick(item.title, locale),
    description: pick(item.excerpt, locale),
    // 판정 필드는 사이트맵(목록 조회)과 동일한 제목·요약만 — 본문은 넘기지 않는다.
    ...documentMetadata({
      path: `alumni/news/${params.slug}`,
      locale,
      fields: [item.title, item.excerpt],
    }),
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

  // 없는 글은 진짜 404 다(예전 인라인 "찾을 수 없음" 렌더는 HTTP 200 → GSC Soft 404).
  if (!item) notFound();

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
      <BoardShell tabs={tabs} activeKey="news" navTitle={tMenu('alumni.label')}>
        <PostArticle
          boardName={boardName}
          title={pick(item.title, locale)}
          date={item.date}
          metaValue={t(`categories.${item.category}`)}
          body={pick(item.body, locale)}
          bodyFormat={postsBodyFormat()}
          attachments={item.attachments}
          attachmentLabels={item.attachments?.map((a) => pick(a.label, locale))}
          backHref="/alumni/news"
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
