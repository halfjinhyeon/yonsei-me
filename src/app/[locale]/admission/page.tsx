import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'admission' });
  return { title: t('hero.title'), description: t('hero.subtitle') };
}

/**
 * 입학 안내 — 실제 모집 요강은 대학 입학처·대학원이 관리한다(학부가 손댈 수 없고,
 * 전형이 해마다 바뀌어 여기 복사해 두면 반드시 낡는다). 그래서 사본을 만들지 않고
 * 공식 페이지로 보내는 링크만 둔다. 링크가 곧 콘텐츠인 화면이다.
 */
const LINKS = [
  { key: 'rolling', href: 'https://admission.yonsei.ac.kr/seoul/admission/html/rolling/guide.asp' },
  { key: 'regular', href: 'https://admission.yonsei.ac.kr/seoul/admission/html/regular/guide.asp' },
  { key: 'transfer', href: 'https://admission.yonsei.ac.kr/seoul/admission/html/transfer/guide.asp' },
  { key: 'graduate', href: 'https://graduate.yonsei.ac.kr/graduate/index.do' },
] as const;

/** 외부 링크 화살표 (장식 — 라벨은 인접 텍스트) */
function ExternalArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
    >
      <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdmissionPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations('admission');
  const tNav = useTranslations('nav');

  return (
    <>
      <Hero title={t('hero.title')} breadcrumb={[{ label: tNav('admission') }]} />
      <Section>
        <p className="max-w-2xl text-content-soft">{t('intro')}</p>

        {/* 전형별 바로가기 — 전부 외부(입학처·대학원)로 나가므로 새 탭으로 연다 */}
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {LINKS.map(({ key, href }) => (
            <li key={key}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-4 border border-surface-border bg-surface px-6 py-5 transition-colors hover:border-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
              >
                <span className="text-lg font-bold text-content transition-colors group-hover:text-yonsei-blue">
                  {t(`links.${key}`)}
                </span>
                <span className="text-content-faint transition-colors group-hover:text-yonsei-blue">
                  <ExternalArrow />
                  <span className="sr-only">{t('newWindow')}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm text-content-faint">{t('note')}</p>
      </Section>
    </>
  );
}
