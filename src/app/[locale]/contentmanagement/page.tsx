import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { auth } from '@/auth';
import { AdminConsole } from '@/components/admin/AdminConsole';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// 내부 운영 도구 — 검색엔진 색인 제외
export const metadata: Metadata = {
  title: '콘텐츠 관리',
  robots: { index: false, follow: false },
};

// 세션 검증이 필요하므로 동적 렌더링.
export const dynamic = 'force-dynamic';

export default async function ContentManagementPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);

  // 미들웨어가 이미 미인증 접근을 막지만, 방어적으로 세션을 다시 확인한다.
  // 게이트 기준은 이제 GitHub 토큰이 아니라 "세션이 있는가"다 — 로그인 수단이
  // 셋으로 늘면서(이메일 인증번호·카카오) 토큰 없는 정상 세션이 생겼기 때문.
  const session = await auth();
  // 개발 편의: 로컬 dev 서버에서 실제 세션이 없어도 콘솔을 띄운다.
  // 프로덕션 빌드에서는 이 분기가 절대 실행되지 않아 인증이 약화되지 않는다.
  const devBypass = process.env.NODE_ENV !== 'production' && !session?.user;

  if (!session?.user && !devBypass) {
    redirect(`/${params.locale}/contentmanagement/login`);
  }

  // 저장은 전부 /api/admin/* 를 거치므로 토큰은 저장소·배포 상태 라벨용 잔재다.
  const token = session?.accessToken ?? (devBypass ? process.env.DEV_GITHUB_TOKEN ?? '' : '');
  const login = devBypass
    ? 'dev'
    : session?.user?.name ??
      session?.user?.login ??
      session?.user?.email?.split('@')[0] ??
      '';
  // cms_users 행이 없는 세션(env allowlist 폴백 관리자)은 최고 권한으로 본다
  const role = devBypass ? 'admin' : session?.user?.role ?? 'admin';

  // 콘솔은 사이트 헤더·히어로·푸터 없이 독립 전체 화면으로 선다(빌더형 레이아웃).
  // 헤더는 레이아웃의 HeaderChrome 이, 푸터는 SiteChrome 이 이 경로에서 감춘다 —
  // 사이드바가 화면 맨 위부터 끝까지 닿아야 "여기서부터는 도구"가 분명해진다.
  // 본문은 Container 없이 풀블리드, 좌우 여백은 콘솔 내부가 각자 책임진다.
  return <AdminConsole token={token} login={login} role={role} />;
}
