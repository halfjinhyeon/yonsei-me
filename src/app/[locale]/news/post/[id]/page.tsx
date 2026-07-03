import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Section } from '@/components/Section';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Container } from '@/components/Container';
import { Link } from '@/i18n/navigation';
import { getAllBoardPosts, getBoardPost, pick } from '@/lib/content';
import { formatDate } from '@/lib/utils';
import { routing, type Locale } from '@/i18n/routing';

// 모든 로케일 × 게시글을 정적 생성
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getAllBoardPosts().map((post) => ({ locale, id: post.id })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const post = getBoardPost(params.id);
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
  const post = getBoardPost(params.id);
  const t = await getTranslations({ locale, namespace: 'news' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });

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

  const boardLabel = tMenu(`news.items.${post.boardKey}`);
  const paragraphs = pick(post.body, locale).split('\n\n');

  return (
    <>
      <Breadcrumb
        items={[{ label: tNav('news'), href: '/news' }, { label: pick(post.title, locale) }]}
      />
      <article className="py-section-sm">
        <Container>
          <div className="mx-auto max-w-prose">
            <p className="text-sm font-semibold text-yonsei-blue">{boardLabel}</p>
            <h1 className="mt-3 text-headline font-bold text-content">
              {pick(post.title, locale)}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-content-faint">
              <time dateTime={post.date}>{formatDate(post.date, locale)}</time>
              {post.meta && <span>{pick(post.meta, locale)}</span>}
            </div>

            <div className="mt-8 space-y-5 border-t border-surface-border pt-8">
              {paragraphs.map((para, i) => (
                <p key={i} className="whitespace-pre-line text-lg leading-relaxed text-content-soft">
                  {para}
                </p>
              ))}
            </div>

            <div className="mt-12">
              <Link href={`/news#${post.boardKey}`} className="btn-secondary">
                ← {t('backToList')}
              </Link>
            </div>
          </div>
        </Container>
      </article>
    </>
  );
}
