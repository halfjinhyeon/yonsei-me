import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { auth } from '@/auth';
import { Hero } from '@/components/Hero';
import { AdminConsole } from '@/components/admin/AdminConsole';
import { SignInCard } from '@/components/admin/SignInCard';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// 내부 운영 도구 — 검색엔진 색인 제외
export const metadata: Metadata = {
  title: '콘텐츠 관리',
  robots: { index: false, follow: false },
};

// 세션(GitHub OAuth) 검증이 필요하므로 동적 렌더링.
export const dynamic = 'force-dynamic';

export default async function ContentManagementPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);

  // 미들웨어가 이미 미인증 접근을 막지만, 방어적으로 세션을 다시 확인한다.
  const session = await auth();
  let token = session?.accessToken;
  let login = session?.user?.login ?? session?.user?.name ?? '';
  // 개발 편의: 로컬 dev 서버에서 실제 세션이 없으면 우회 토큰으로 콘솔을 띄운다.
  // 프로덕션 빌드에서는 이 분기가 절대 실행되지 않아 인증이 약화되지 않는다.
  const devBypass = process.env.NODE_ENV !== 'production' && !token;

  if (devBypass) {
    // DEV_GITHUB_TOKEN 미설정 시 빈 문자열 → 콘솔 UI 는 뜨되 목록 조회/저장은 401 실패.
    token = process.env.DEV_GITHUB_TOKEN ?? '';
    login = 'dev';
  }

  // 콘솔은 사이트 헤더·히어로 아래에서 시작한다(다른 세부 페이지와 동일). 다만
  // 푸터는 렌더하지 않는다(레이아웃의 SiteChrome) — 콘솔 하단에는 변경 트레이가
  // 고정되는데, 그 아래로 사이트 푸터가 이어지면 "도구의 끝"이 흐려지기 때문.
  // 스크롤이 히어로를 지나면 사이드바가 헤더 아래에 고정된다(졸업요건 페이지 문법).
  // 본문은 Container 없이 풀블리드, 좌우 여백은 콘솔 내부가 각자 책임진다.
  return (
    <>
      <Hero
        eyebrow="Content Management"
        title="콘텐츠 관리 콘솔"
        subtitle="연혁·교수진·교과목·게시판 등 사이트의 모든 콘텐츠를 한곳에서 편집하고 저장소에 바로 반영합니다."
        breadcrumb={[{ label: '콘텐츠 관리' }]}
      />
      {token !== undefined ? (
        <AdminConsole token={token} login={login} />
      ) : (
        <div className="mx-auto w-full max-w-md px-6 py-20">
          <SignInCard locale={params.locale} />
        </div>
      )}
    </>
  );
}
