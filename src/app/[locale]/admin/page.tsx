import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { AdminConsole } from '@/components/admin/AdminConsole';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// 내부 운영 도구 — 검색엔진 색인 제외
export const metadata: Metadata = {
  title: '관리자',
  robots: { index: false, follow: false },
};

export default function AdminPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <main className="px-4 py-10 sm:px-6 lg:px-8">
      <AdminConsole />
    </main>
  );
}
