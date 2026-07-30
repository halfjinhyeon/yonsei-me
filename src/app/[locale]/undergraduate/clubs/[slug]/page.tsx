import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { Container } from '@/components/Container';
import { Link } from '@/i18n/navigation';
import { ClubCardNews } from '@/components/ClubCardNews';
import { parseClubContent } from '@/lib/pages';
import { getClubsRuntime, getPageMarkdownRuntime } from '@/lib/content-runtime';
import { routing } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 동아리 인덱스·소개 본문이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateStaticParams() {
  const clubs = await getClubsRuntime();
  return routing.locales.flatMap((locale) => clubs.map((c) => ({ locale, slug: c.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const club = (await getClubsRuntime()).find((c) => c.slug === params.slug);
  return { title: club?.name, description: club?.teaser };
}

export default async function ClubDetailPage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(params.locale);
  const club = (await getClubsRuntime()).find((c) => c.slug === params.slug);
  if (!club) notFound();

  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  // 카드뉴스 파싱은 순수 함수(parseClubContent) — 원문만 데이터 레이어에서 받아 넘긴다.
  const raw = await getPageMarkdownRuntime(`club-${club.slug}`);
  const content = raw ? parseClubContent(raw) : { panels: [], links: [] };

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
      {/* 뒤로가기 — 동아리 목록(학부#clubs)으로. history.back 대신 명시적 링크라
          진입 경로와 무관하게 항상 목록으로 돌아간다. */}
      <Container className="pt-8 lg:pt-10">
        <Link
          href="/undergraduate#clubs"
          className="group inline-flex items-center gap-2 text-sm font-semibold text-content-soft transition-colors hover:text-yonsei-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
        >
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center border border-surface-border transition-colors group-hover:border-yonsei-navy"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {tMenu('undergraduate.items.clubs')}
        </Link>
      </Container>
      {/* 흰 배경 에디토리얼 본문(내부 Container 포함) — 마지막 Connect 블록만
          그라데이션 풀블리드 */}
      {content.panels.length > 0 ? (
        <ClubCardNews content={content} images={club.images ?? []} clubName={club.name} />
      ) : null}
    </>
  );
}
