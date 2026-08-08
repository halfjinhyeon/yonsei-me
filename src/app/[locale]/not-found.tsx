import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Section } from '@/components/Section';

/**
 * 로케일 404 — `notFound()` 가 이 파일을 [locale] 레이아웃 안에서 렌더한다
 * (헤더·푸터가 그대로 남아 사용자가 길을 잃지 않는다).
 * 진입 경로는 둘: 매칭 안 된 경로를 잡는 `[locale]/[...rest]/page.tsx`,
 * 그리고 없는 글에서 `notFound()` 를 부르는 게시판 상세 라우트들.
 *
 * ⚠️ not-found 파일은 params 를 받지 못한다. 로케일은 next-intl 이 요청 컨텍스트
 *    (레이아웃의 setRequestLocale / 미들웨어 헤더)에서 해석한다 — 그래서 여기서는
 *    번역 훅만 쓰고 로케일을 직접 다루지 않는다.
 *
 * 디자인 규칙(CLAUDE.md): 각진 엣지, 그림자·그라디언트 없음, 금색 금지.
 * 위계는 크기 · 헤어라인 · 여백으로만 만든다.
 */
export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <Section>
      <div className="mx-auto max-w-prose py-10 text-center sm:py-16">
        <p className="text-[64px] font-bold leading-none tracking-tight text-yonsei-navy sm:text-[88px]">
          404
        </p>
        {/* 숫자와 문구를 가르는 헤어라인 — 박스·그림자 대신 이 한 줄이 위계를 만든다 */}
        <hr className="mx-auto mt-8 w-16 border-0 border-t border-surface-border" />
        <h1 className="mt-8 font-subhead text-2xl font-semibold text-content sm:text-3xl">
          {t('title')}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-content-soft">{t('body')}</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-secondary">
            ← {t('home')}
          </Link>
          <Link href="/news" className="btn-secondary">
            {t('news')}
          </Link>
        </div>
      </div>
    </Section>
  );
}
