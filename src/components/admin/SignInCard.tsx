// 로그인 유도 카드. 미들웨어가 미인증 접근을 막지만, 세션에 accessToken 이
// 없는 경우(예: 만료·스코프 문제)를 위한 방어적 진입 화면이다.
// 사이트 톤(네이비/골드, 독수리 마스코트, rounded)으로 구성한다.
//
// 내부 운영 도구라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

interface Props {
  /** 로그인 후 복귀할 경로에 쓸 로케일 */
  locale: string;
}

export function SignInCard({ locale }: Props) {
  const callbackUrl = `/${locale}/contentmanagement`;
  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-card border border-surface-border bg-surface p-8 text-center shadow-card">
        <div
          aria-hidden
          className="mx-auto mb-6 h-16 w-16 bg-yonsei-navy eagle-mask dark:bg-yonsei-sky"
        />
        <p className="eyebrow">콘텐츠 관리</p>
        <h1 className="mt-2 text-2xl font-bold text-content">관리자 로그인</h1>
        <p className="mt-3 text-sm leading-relaxed text-content-soft">
          허용된 GitHub 계정으로 로그인하면 연혁·교수진·교과목·게시판 등 사이트
          콘텐츠를 편집하고 저장소에 바로 커밋할 수 있습니다.
        </p>
        <a href={signInHref} className="btn-primary mt-6 w-full">
          GitHub으로 로그인
        </a>
      </div>
    </div>
  );
}
