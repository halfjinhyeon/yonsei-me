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

  // 콘솔도 다른 세부 페이지와 똑같이 사이트 히어로 아래에서 시작한다.
  // 관리 도구라고 별세계처럼 보이면 "학생이 보는 화면 그대로 고친다"는 원칙이
  // 첫 화면부터 깨지기 때문이다. 다만 본문은 Container 없이 풀블리드로 두고
  // 좌우 여백은 콘솔 내부(상단 바·사이드바·본문)가 각자 책임진다 —
  // 사이드바가 화면 왼쪽 끝에 붙어야 편집 화면에서 목록과 메뉴가 함께 보인다.
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
