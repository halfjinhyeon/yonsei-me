import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { getPageMarkdown } from '@/lib/pages';
import { getLabsDirectory } from '@/lib/faculty';
import { LabVideoGallery } from '@/components/LabVideoGallery';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  return { title: t('graduate.label') };
}

// labs 는 마크다운 대신 LabVideoGallery(연구실 소개 영상 갤러리)로 렌더 → slug null 유지
const SECTION_SLUGS: Record<string, string | null> = {
  admission: 'graduate-admission',
  requirements: 'graduate-requirements',
  courses: 'graduate-courses',
  labs: null,
  bk21: 'graduate-bk21',
};

export default async function GraduatePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tPages = await getTranslations({ locale: params.locale, namespace: 'pages' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  const tabs: TabItem[] = Object.entries(SECTION_SLUGS).map(([key, slug]) => ({
    key,
    label: tMenu(`graduate.items.${key}`),
    markdown: slug ? getPageMarkdown(slug) : null,
    content:
      key === 'labs' ? (
        <LabVideoGallery items={getLabsDirectory()} locale={params.locale as Locale} />
      ) : undefined,
  }));

  return (
    <>
      <Hero
        title={tMenu('graduate.label')}
        subtitle={tPages('graduate.subtitle')}
        breadcrumb={[{ label: tMenu('graduate.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('graduate.label')} />
    </>
  );
}
