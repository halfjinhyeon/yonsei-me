import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Section } from '@/components/Section';

export default function NotFound() {
  const t = useTranslations('stub');
  return (
    <Section>
      <div className="mx-auto max-w-prose py-10 text-center">
        <p className="text-6xl font-black text-yonsei-navy">404</p>
        <p className="mt-4 text-lg text-content-soft">{t('body')}</p>
        <Link href="/" className="btn-secondary mt-8">
          ← {t('back')}
        </Link>
      </div>
    </Section>
  );
}
