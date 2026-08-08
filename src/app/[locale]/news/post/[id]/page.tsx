import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { pick } from '@/lib/content';
import { fetchBoardPost, postsBodyFormat } from '@/lib/posts';
import { documentMetadata } from '@/lib/seo';
import { htmlToDescription } from '@/lib/excerpt';
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
  // 없는 글은 notFound() 로 떨어져 not-found 페이지가 자기 메타를 갖는다 → 여기선 빈 객체.
  if (!post) return {};
  const locale = params.locale as Locale;
  // 게시판 글에는 excerpt 필드가 없어 description 이 비어 있었고, 그러면 레이아웃의
  // 사이트 기본 설명이 수천 문서에 똑같이 붙는다(GSC 중복 신호) — 본문에서 만들어 준다.
  const description = htmlToDescription(pick(post.body, locale));
  return {
    title: pick(post.title, locale),
    ...(description ? { description } : {}),
    // ⚠️ 번역 판정 필드는 사이트맵(목록 조회)과 같아야 한다. BoardPost 에는 excerpt 가
    //    없으므로 **제목만** 넘긴다. 본문을 넣으면 사이트맵과 결론이 갈린다.
    ...documentMetadata({ path: `news/post/${params.id}`, locale, fields: [post.title] }),
  };
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

  // 없는 글은 진짜 404 다(예전 인라인 "찾을 수 없음" 렌더는 HTTP 200 → GSC Soft 404).
  if (!post) notFound();

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

  // 자료실만 '분류' 메타 행을 한 줄 더 세운다. 공지의 학부/대학원 구분은 이미 위
  // author(post.meta) 칸에 실려 있어 여기 또 쓰면 같은 말이 두 번 나온다.
  const libraryCategory =
    post.boardKey === 'resources' && (post.category === 'form' || post.category === 'rule')
      ? t(post.category === 'form' ? 'library.catForm' : 'library.catRule')
      : undefined;

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
          categoryLabel={libraryCategory ? t('detail.categoryLabel') : undefined}
          categoryValue={libraryCategory}
          body={pick(post.body, locale)}
          bodyFormat={postsBodyFormat()}
          attachments={post.attachments}
          attachmentLabels={post.attachments?.map((a) => pick(a.label, locale))}
          postId={post.id}
          backHref={`${sectionHref}#${post.boardKey}`}
          labels={{
            title: t('detail.titleLabel'),
            date: t('detail.dateLabel'),
            metaRow: t('detail.authorLabel'),
            attachments: t('detail.attachmentsLabel'),
            backToList: t('backToList'),
            // ZIP 문구는 게시판을 가리지 않고 넘긴다 — 첨부가 여럿인 글이면 자료실이든
            // 공지든 한 번에 받는 편이 낫고, /api/download-zip 도 게시판을 구분하지 않는다.
            attachmentsZip: t('library.attachmentsZip'),
            zipPreparing: t('library.zipPreparing'),
            zipFailed: t('library.zipFailed'),
            zipFileName: t('library.zipFileName'),
          }}
          locale={locale}
        />
      </BoardShell>
    </>
  );
}
