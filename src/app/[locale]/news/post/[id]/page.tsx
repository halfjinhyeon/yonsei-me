import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Section } from '@/components/Section';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/content';
import { fetchBoardPost, postsBodyFormat } from '@/lib/posts';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 요청 시 렌더 + ISR (revalidateTag('posts') 가 즉시 갱신)
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

// 인턴 모집 상세는 연구 메뉴 소속 — 연구 탭(비전·역량·연구실·인턴·신문고)으로 셸을 구성
async function getResearchTabs(locale: Locale): Promise<BoardShellTab[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return [
    { key: 'vision', label: tMenu('research.items.vision') },
    { key: 'capacity', label: tMenu('research.items.capacity') },
    { key: 'labs', label: tMenu('research.items.labs') },
    { key: 'internships', label: tMenu('research.items.internships') },
    { key: 'social', label: tMenu('research.items.social') },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const post = await fetchBoardPost(params.id);
  if (!post) return {};
  return { title: pick(post.title, params.locale as Locale) };
}

export default async function BoardPostPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const post = await fetchBoardPost(params.id);
  const t = await getTranslations({ locale, namespace: 'news' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });

  if (!post) {
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

  // 인턴 모집은 연구 메뉴 소속 — 브레드크럼·목록 링크·셸을 연구 컨텍스트로 전환한다.
  const isResearch = post.boardKey === 'internships';
  const tResearch = await getTranslations({ locale, namespace: 'research' });
  const boardName = isResearch
    ? tMenu('research.items.internships')
    : tMenu(`news.items.${post.boardKey}`);
  const tabs = isResearch ? await getResearchTabs(locale) : await getNewsTabs(locale);
  const sectionLabel = isResearch ? tMenu('research.label') : tMenu('news.label');
  const sectionHref = isResearch ? '/research' : '/news';
  const author = post.meta ? pick(post.meta, locale) : t('detail.defaultAuthor');

  return (
    <>
      <Hero
        title={isResearch ? tResearch('hero.title') : t('hero.title')}
        subtitle={isResearch ? tResearch('hero.subtitle') : t('hero.subtitle')}
        breadcrumb={[{ label: sectionLabel, href: sectionHref }, { label: boardName }]}
      />
      <BoardShell tabs={tabs} activeKey={post.boardKey} navTitle={sectionLabel} basePath={sectionHref}>
        <PostArticle
          boardName={boardName}
          title={pick(post.title, locale)}
          date={post.date}
          metaValue={author}
          body={pick(post.body, locale)}
          bodyFormat={postsBodyFormat()}
          attachments={post.attachments}
          attachmentLabels={post.attachments?.map((a) => pick(a.label, locale))}
          backHref={`${sectionHref}#${post.boardKey}`}
          labels={{
            title: t('detail.titleLabel'),
            date: t('detail.dateLabel'),
            metaRow: t('detail.authorLabel'),
            attachments: t('detail.attachmentsLabel'),
            backToList: t('backToList'),
          }}
          locale={locale}
        />
      </BoardShell>
    </>
  );
}
