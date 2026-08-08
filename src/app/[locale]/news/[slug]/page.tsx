import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { pick } from '@/lib/content';
import { fetchNewsBySlug, postsBodyFormat } from '@/lib/posts';
import { documentMetadata } from '@/lib/seo';
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
  // 없는 글은 notFound() 로 떨어져 not-found 페이지가 자기 메타를 갖는다 → 여기선 빈 객체.
  if (!item) return {};
  const locale = params.locale as Locale;
  return {
    title: pick(item.title, locale),
    description: pick(item.excerpt, locale),
    // hreflang + (영문 번역이 없으면) /en noindex. ⚠️ 판정 필드는 사이트맵이 목록 조회로
    // 보는 것과 같아야 한다 — 제목·요약만 넘기고 **본문은 넘기지 않는다**(본문은 목록에
    // 실려 오지 않아, 쓰면 두 곳 판정이 갈리고 hreflang 상호 참조가 깨진다).
    ...documentMetadata({
      path: `news/${params.slug}`,
      locale,
      fields: [item.title, item.excerpt],
    }),
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

  // 없는 글은 진짜 404 다. 예전에는 "찾을 수 없음" 문구를 200 으로 렌더해 GSC 가
  // Soft 404 로 적발했다 — notFound() 로 [locale]/not-found.tsx 를 띄운다.
  if (!item) notFound();

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
