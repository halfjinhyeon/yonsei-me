import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { auth } from '@/auth';
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

  // 콘솔은 사이트 크롬(헤더·히어로·푸터) 없는 전용 전체화면 도구다.
  // 크롬은 레이아웃의 SiteChrome 래퍼가 이 경로에서 렌더하지 않고, 히어로도
  // 두지 않는다 — 전고 사이드바·자체 상단 바가 화면을 온전히 쓰기 위함이다.
  // 본문은 Container 없이 풀블리드, 좌우 여백은 콘솔 내부가 각자 책임진다.
  return (
    <>
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
