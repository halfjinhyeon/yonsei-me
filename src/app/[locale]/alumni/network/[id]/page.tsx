import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { PostArticle } from '@/components/PostArticle';
import { BoardShell } from '@/components/BoardShell';
import { pick } from '@/lib/content';
import { fetchAlumniEventById, postsBodyFormat } from '@/lib/posts';
import { pageMetadata } from '@/lib/page-metadata';
import { htmlToDescription } from '@/lib/excerpt';
import { getAlumniTabs } from '../../_shared/tabs';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 요청 시 렌더 + ISR (revalidateTag('posts') 가 즉시 갱신)
export const revalidate = 300;

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
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return pageMetadata({
    locale,
    path: `alumni/network/${params.id}`,
    title: `${pick(event.title, locale)} | ${tMenu('alumni.items.network')}`,
    ...(description ? { description } : {}),
    type: 'article',
    image: event.image ?? null,
    publishedTime: event.date,
    // 판정 필드는 사이트맵(목록 조회)과 동일한 제목·요약만 — 본문은 넘기지 않는다.
    fields: [event.title, event.excerpt],
  });
}

export default async function AlumniNetworkDetailPage({
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
      {/* 히어로 제목은 섹션명이라 h1 은 본문의 글 제목이 갖는다(시각 변화 없음).
          crumbLeaf 는 JSON-LD 에만 붙는 마지막 항목 — 화면 크럼은 게시판까지만 그린다. */}
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        // 게시판 크럼의 href 는 JSON-LD 용이다 — 화면에서는 마지막 항목이라 링크로 그려지지
        // 않지만, 중간 항목에 item 이 없으면 구글이 crumbLeaf 까지 버린다(Hero 의 ③ 주석).
        breadcrumb={[
          { label: tMenu('alumni.label'), href: '/alumni' },
          { label: boardName, href: '/alumni/network' },
        ]}
        crumbLeaf={pick(event.title, locale)}
        titleTag="p"
      />
      <BoardShell tabs={tabs} activeKey="network" navTitle={tMenu('alumni.label')}>
        <PostArticle
          boardName={boardName}
          title={pick(event.title, locale)}
          titleTag="h1"
          date={event.date}
          metaValue={pick(event.host, locale)}
          body={pick(event.body, locale)}
          bodyFormat={postsBodyFormat()}
          attachments={event.attachments}
          attachmentLabels={event.attachments?.map((a) => pick(a.label, locale))}
          backHref="/alumni/network"
          labels={{
            title: t('detail.titleLabel'),
            date: t('detail.dateLabel'),
            metaRow: t('detail.authorLabel'),
            attachments: t('detail.attachmentsLabel'),
            backToList: t('backToList'),
            share: t('detail.share'),
            copyUrl: t('detail.copyUrl'),
            copied: t('detail.copied'),
            copyFailed: t('detail.copyFailed'),
          }}
          locale={locale}
        />
      </BoardShell>
    </>
  );
}
