import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { LoginScreen } from '@/components/admin/LoginScreen';

// 내부 운영 도구 — 검색엔진 색인 제외
export const metadata: Metadata = {
  title: '관리자 로그인',
  robots: { index: false, follow: false },
};

// 세션 유무에 따라 응답이 갈리므로 정적 생성하지 않는다
// (그래서 generateStaticParams 도 두지 않는다).
export const dynamic = 'force-dynamic';

export default async function ContentManagementLoginPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);

  // 이미 로그인한 사람에게 로그인 화면을 다시 보여 주면 "왜 또"가 된다 — 콘솔로 보낸다.
  // ⚠️ 판정은 session 이 아니라 session.user 다 — AUTH_SECRET 미설정(dev) 등으로
  // auth() 가 오류를 낼 때 truthy 한 오류 객체가 돌아와, 미로그인 방문자를
  // 콘솔로 되돌리는 리다이렉트 루프성 오판이 실측됐다(콘솔 page.tsx 와 같은 기준).
  const session = await auth();
  if (session?.user) {
    redirect(`/${params.locale}/contentmanagement`);
  }

  return <LoginScreen locale={params.locale} />;
}
