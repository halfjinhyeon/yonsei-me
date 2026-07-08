import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Section } from '@/components/Section';
import { Hero } from '@/components/Hero';
import { BoardShell, type BoardShellTab } from '@/components/BoardShell';
import { PostArticle } from '@/components/PostArticle';
import { Link } from '@/i18n/navigation';
import { alumniEvents, getAlumniEventById, pick } from '@/lib/content';
import { routing, type Locale } from '@/i18n/routing';

// 동문 페이지(/alumni)와 동일한 3개 탭 (key/label)
async function getAlumniTabs(locale: Locale): Promise<BoardShellTab[]> {
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  return [
    { key: 'greeting', label: tMenu('alumni.items.greeting') },
    { key: 'news', label: tMenu('alumni.items.news') },
    { key: 'network', label: tMenu('alumni.items.network') },
  ];
}

// 모든 로케일 × 동문 소식(alumniEvents) id를 정적 생성
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    alumniEvents.map((event) => ({ locale, id: event.id })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const event = getAlumniEventById(params.id);
  if (!event) return {};
  return { title: pick(event.title, params.locale as Locale) };
}

export default async function AlumniPostPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const event = getAlumniEventById(params.id);
  const t = await getTranslations({ locale, namespace: 'news' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });

  if (!event) {
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
          paragraphs={pick(event.body, locale).split('\n\n')}
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
