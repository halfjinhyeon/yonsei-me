import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { pick } from '@/lib/content';
import { fetchAlumniEventById, postsBodyFormat } from '@/lib/posts';
import { documentMetadata } from '@/lib/seo';
import { htmlToDescription } from '@/lib/excerpt';
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
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const event = await fetchAlumniEventById(params.id);
  // 없는 글은 notFound() 로 떨어져 not-found 페이지가 자기 메타를 갖는다 → 여기선 빈 객체.
  if (!event) return {};
  const locale = params.locale as Locale;
  // description 이 비면 레이아웃의 사이트 기본 설명이 그대로 붙어 문서마다 같아진다
  // (GSC 중복 신호). 요약이 있으면 그것을, 없으면 본문에서 만들어 쓴다.
  const description =
    (event.excerpt ? pick(event.excerpt, locale).trim() : '') ||
    htmlToDescription(pick(event.body, locale));
  return {
    title: pick(event.title, locale),
    ...(description ? { description } : {}),
    // 판정 필드는 사이트맵(목록 조회)과 동일한 제목·요약만 — 본문은 넘기지 않는다.
    ...documentMetadata({
      path: `alumni/post/${params.id}`,
      locale,
      fields: [event.title, event.excerpt],
    }),
  };
}

export default async function AlumniPostPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const event = await fetchAlumniEventById(params.id);
  const t = await getTranslations({ locale, namespace: 'news' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });

  // 없는 글은 진짜 404 다(예전 인라인 "찾을 수 없음" 렌더는 HTTP 200 → GSC Soft 404).
  if (!event) notFound();

  const boardName = tMenu('alumni.items.network');
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
      <BoardShell tabs={tabs} activeKey="network" navTitle={tMenu('alumni.label')} basePath="/alumni">
        <PostArticle
          boardName={boardName}
          title={pick(event.title, locale)}
          date={event.date}
          metaValue={pick(event.host, locale)}
          body={pick(event.body, locale)}
          bodyFormat={postsBodyFormat()}
          attachments={event.attachments}
          attachmentLabels={event.attachments?.map((a) => pick(a.label, locale))}
          backHref="/alumni#network"
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
