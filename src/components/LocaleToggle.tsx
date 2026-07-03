'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTransition } from 'react';

/**
 * 언어 토글. 현재 경로/쿼리를 유지한 채 ko ↔ en 전환.
 * tone='dark'는 어두운 배경(네이비 헤더)용.
 */
export function LocaleToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const t = useTranslations('langToggle');
  const activeLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: string) {
    if (nextLocale === activeLocale) return;
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- 동적 라우트 파라미터를 그대로 전달
        { pathname, params },
        { locale: nextLocale },
      );
    });
  }

  const isDark = tone === 'dark';

  return (
    <div
      role="group"
      aria-label={t('label')}
      className={cn(
        'inline-flex items-center rounded-full border p-0.5 text-sm',
        isDark ? 'border-white/25 bg-white/5' : 'border-surface-border bg-surface',
        isPending && 'opacity-60',
      )}
    >
      {routing.locales.map((loc) => {
        const isActive = loc === activeLocale;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => switchTo(loc)}
            aria-pressed={isActive}
            disabled={isPending}
            className={cn(
              'rounded-full px-3 py-1 font-semibold transition-colors',
              isActive
                ? isDark
                  ? 'bg-white text-yonsei-navy'
                  : 'bg-yonsei-navy text-white'
                : isDark
                  ? 'text-white/70 hover:text-white'
                  : 'text-content-soft hover:text-yonsei-blue',
            )}
          >
            {loc.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
