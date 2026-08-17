'use client';

// 콘텐츠 관리 콘솔 로그인 — 사이트 크롬 없이 화면 전체를 쓰는 독립 진입 화면.
//
// 수단이 셋(이메일 인증번호 · 카카오 · GitHub)이지만 셋을 나란히 놓으면
// "나는 뭘 눌러야 하나"가 매번 새 결정이 된다. 그래서 기본 경로인 이메일
// 인증번호만 폼으로 펼쳐 두고, 나머지 둘은 구분선 아래 보조 수단으로 내린다.
// 카카오·GitHub 는 이미 등록된 계정에만 열리므로 처음 오는 사람은 이메일로만
// 들어올 수 있다 — 그 순서가 화면 위에서 그대로 보이게 한다.
//
// 인증번호 검증은 fetch 가 아니라 Auth.js 의 signIn('email-otp') 이다.
// 세션 쿠키를 굽는 주체가 Auth.js 라, 코드 확인만 따로 API 로 하면 "맞았는데
// 로그인은 안 된" 상태가 생긴다.
//
// 내부 운영 도구라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** 로그인 후 돌아갈 콘솔 경로에 쓸 로케일 */
  locale: string;
}

/** 재전송 잠금(초) — 서버 발송 제한과 같은 값이라 눌러 봐야 429 가 나는 시간대를 없앤다 */
const RESEND_SECONDS = 60;

/** 로그인 실패로 되돌려 보낼 때 Auth.js 가 붙이는 ?error= 값 → 화면 안내 */
const ERROR_NOTICES: Record<string, string> = {
  'kakao-unlinked':
    '아직 연결되지 않은 카카오 계정입니다. 먼저 이메일 인증으로 로그인한 뒤, 콘솔의 계정 영역에서 카카오를 연결해 주세요.',
  AccessDenied: '허용되지 않은 계정입니다. 학과 관리자에게 문의해 주세요.',
};

export function LoginScreen({ locale }: Props) {
  const consoleUrl = `/${locale}/contentmanagement`;

  // 단계는 둘뿐이다: 이메일을 받는 화면 → 코드를 받는 화면.
  // 한 화면에 둘 다 두면(코드 칸을 미리 비워 두면) 아직 오지도 않은 번호를
  // 넣으라고 재촉하는 꼴이라, 실제로 발송에 성공했을 때만 다음 칸을 연다.
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** dev 서버가 내려주는 고정 코드 — 메일 발송 없이 흐름을 시험할 수 있게 안내만 한다 */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const emailFieldId = useId();
  const codeFieldId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // ?error= 안내 — useSearchParams 는 이 프로젝트에서 정적 생성과 충돌해 금지다.
  // 읽은 뒤 쿼리를 지운다: 새로고침해도 남아 있으면 이미 해결된 사정을 계속 말한다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('error');
    if (!key) return;
    setNotice(ERROR_NOTICES[key] ?? '로그인하지 못했습니다. 다시 시도해 주세요.');
    params.delete('error');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  // 재전송 카운트다운
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  // 단계가 바뀌면 그 단계의 입력으로 초점을 옮긴다 — 코드를 받아 놓고 커서를
  // 직접 찾아 클릭하게 두면 6자리를 넣기까지의 동작이 두 배가 된다.
  useEffect(() => {
    if (step === 'email') emailRef.current?.focus();
    else codeRef.current?.focus();
  }, [step]);

  const requestCode = useCallback(async (target: string): Promise<boolean> => {
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const data: { error?: string; devCode?: string; retryAfter?: number } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok) {
        // 429 는 남은 대기 시간을 알려 준다 — 그만큼 재전송을 잠가야 버튼이
        // "눌리지만 매번 실패하는" 상태로 남지 않는다.
        if (res.status === 429 && typeof data.retryAfter === 'number') {
          setCooldown(Math.max(1, Math.ceil(data.retryAfter)));
        }
        setError(data.error ?? '인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return false;
      }
      setDevCode(data.devCode ?? null);
      setCooldown(RESEND_SECONDS);
      return true;
    } catch {
      setError('네트워크 오류로 인증번호를 보내지 못했습니다.');
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  async function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const target = email.trim();
    if (!target) {
      setError('이메일을 입력해 주세요.');
      return;
    }
    if (await requestCode(target)) {
      setCode('');
      setNotice(null);
      setStep('code');
    }
  }

  async function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (verifying) return;
    setError(null);
    setVerifying(true);
    try {
      const res = await signIn('email-otp', { email: email.trim(), code, redirect: false });
      if (res?.error) {
        setError('인증번호가 올바르지 않거나 만료되었습니다.');
        setCode('');
        codeRef.current?.focus();
        return;
      }
      // router.push 가 아니라 전체 이동 — 세션 쿠키가 막 생겼으므로 서버
      // 컴포넌트를 새 요청으로 다시 그려야 콘솔이 인증된 상태로 뜬다.
      window.location.href = consoleUrl;
    } catch {
      setError('로그인 처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      {/* 좌측 브랜드 패널 — 다크모드에서도 네이비를 유지한다. 이 면은 배경이
          아니라 "학과의 도구"라는 표시라, 배경색이 따라 반전되면 정체가 흐려진다. */}
      <aside className="relative flex flex-col justify-center overflow-hidden bg-yonsei-navy px-6 py-10 sm:px-10 lg:w-[42%] lg:px-14 lg:py-16">
        <DecorLines />
        <div className="relative">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-white/60">
            Yonsei Mechanical Engineering
          </p>
          <h1 className="mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-white">
            콘텐츠 관리 콘솔
          </h1>
          <p className="mt-4 max-w-[36ch] text-[13.5px] leading-[1.8] text-white/70 lg:text-sm">
            학과 홈페이지의 모든 콘텐츠를 한곳에서 편집합니다.
          </p>
        </div>
      </aside>

      {/* 우측 폼 — 세로·가로 모두 가운데. 폼 폭을 400px 로 묶어 두면 넓은 화면에서도
          한 줄 길이가 읽기 좋은 범위에 남는다. */}
      <div className="flex flex-1 items-center justify-center bg-surface px-6 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <h2 className="text-lg font-bold text-content">관리자 로그인</h2>
          <p className="mt-2 text-[13px] leading-[1.7] text-content-soft">
            등록된 계정의 이메일로 인증번호를 보내 드립니다.
          </p>

          {step === 'email' ? (
            <form onSubmit={onSubmitEmail} className="mt-7" noValidate>
              <label htmlFor={emailFieldId} className="block text-[13px] font-semibold text-content">
                이메일
              </label>
              <input
                ref={emailRef}
                id={emailFieldId}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-[2px] border border-surface-border bg-surface px-3.5 py-3 text-sm text-content outline-none transition-colors placeholder:text-content-faint focus:border-yonsei-blue"
              />
              {error && <ErrorText>{error}</ErrorText>}
              <button
                type="submit"
                disabled={sending}
                className="mt-4 w-full rounded-[2px] bg-yonsei-navy px-4 py-3 text-sm font-semibold text-white transition-colors duration-200 ease-out-expo hover:bg-yonsei-blue disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? '전송 중…' : '인증번호 받기'}
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmitCode} className="mt-7" noValidate>
              <div className="flex items-center justify-between gap-3 border border-surface-border bg-surface-soft px-3.5 py-2.5">
                <span className="min-w-0 truncate text-[13px] text-content-soft">{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setDevCode(null);
                    setStep('email');
                  }}
                  className="shrink-0 text-[12px] font-semibold text-yonsei-blue transition-colors duration-200 ease-out-expo hover:text-yonsei-navy"
                >
                  변경
                </button>
              </div>

              <label
                htmlFor={codeFieldId}
                className="mt-5 block text-[13px] font-semibold text-content"
              >
                인증번호
              </label>
              <input
                ref={codeRef}
                id={codeFieldId}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                // 숫자만 남긴다 — 붙여넣기로 공백·하이픈이 섞여 들어오는 쪽이 흔하다
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-2 w-full rounded-[2px] border border-surface-border bg-surface px-3.5 py-3 text-center text-lg tracking-[0.4em] text-content outline-none transition-colors focus:border-yonsei-blue"
              />
              <p className="mt-2 text-[12px] leading-[1.7] text-content-faint">
                메일로 받은 6자리 코드를 입력하세요 · 10분간 유효
              </p>
              {devCode && (
                <p className="mt-1 text-[12px] font-semibold text-content-faint">
                  개발 모드 코드: {devCode}
                </p>
              )}
              {error && <ErrorText>{error}</ErrorText>}

              <button
                type="submit"
                disabled={verifying || code.length !== 6}
                className="mt-4 w-full rounded-[2px] bg-yonsei-navy px-4 py-3 text-sm font-semibold text-white transition-colors duration-200 ease-out-expo hover:bg-yonsei-blue disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifying ? '확인 중…' : '로그인'}
              </button>

              <button
                type="button"
                onClick={() => void requestCode(email.trim())}
                disabled={sending || cooldown > 0}
                className="mt-3 w-full text-[12.5px] font-semibold text-yonsei-blue transition-colors duration-200 ease-out-expo hover:text-yonsei-navy disabled:cursor-not-allowed disabled:text-content-faint"
              >
                {cooldown > 0 ? `재전송 (${cooldown}초)` : '인증번호 재전송'}
              </button>
            </form>
          )}

          <div className="my-7 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-surface-border" />
            <span className="text-[12px] text-content-faint">또는</span>
            <span className="h-px flex-1 bg-surface-border" />
          </div>

          {notice && (
            <p className="mb-4 border border-surface-border bg-surface-soft px-3.5 py-3 text-[13px] leading-[1.7] text-content-soft">
              {notice}
            </p>
          )}

          {/* 카카오는 브랜드 규격(노랑 #FEE500 + 검정 85%)을 지켜야 하는 유일한 예외라
              사이트 토큰을 쓰지 않고 다크모드에서도 그대로 둔다. */}
          <button
            type="button"
            onClick={() => void signIn('kakao', { callbackUrl: consoleUrl })}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[2px] bg-[#FEE500] text-sm font-semibold text-black/85 transition-opacity duration-200 ease-out-expo hover:opacity-90"
          >
            <KakaoMark />
            카카오로 로그인
          </button>

          <button
            type="button"
            onClick={() => void signIn('github', { callbackUrl: consoleUrl })}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-[2px] border border-surface-border bg-surface text-sm font-semibold text-content transition-colors duration-200 ease-out-expo hover:border-yonsei-blue hover:text-yonsei-blue"
          >
            <GithubMark />
            GitHub으로 로그인
          </button>

          <p className="mt-10 text-[12px] leading-[1.7] text-content-faint">
            이 콘솔은 학과 관계자 전용입니다 · 계정 문의: 기계공학부 사무실
          </p>
        </div>
      </div>
    </div>
  );
}

/** 오류 문구 — 색만으로 말하지 않도록 항상 문장으로 적고 alert 로 읽어 준다 */
function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={cn('mt-2.5 text-[12.5px] leading-[1.7] text-red-600 dark:text-red-400')}
    >
      {children}
    </p>
  );
}

/** 좌측 패널 장식 — 유선형 곡선 몇 줄. 면을 채우는 그래픽 대신 1px 선만 쓴다
 *  (그림자·그라디언트 금지 규칙 안에서 빈 네이비 면에 깊이를 주는 최소 수단) */
function DecorLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      fill="none"
      stroke="#ffffff"
      strokeWidth="1"
    >
      <path d="M-40 470C60 470 120 400 160 300S260 110 400 110" opacity="0.12" />
      <path d="M-40 530C60 530 120 460 160 360S260 170 400 170" opacity="0.09" />
      <path d="M-40 590C60 590 120 520 160 420S260 230 400 230" opacity="0.06" />
    </svg>
  );
}

/** 카카오 말풍선 심볼 — 외부 이미지를 물어오지 않도록 인라인 SVG 로 둔다 */
function KakaoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.2c-5.08 0-9.2 3.26-9.2 7.28 0 2.57 1.7 4.82 4.26 6.11-.19.68-.68 2.47-.78 2.85-.12.48.18.47.37.34.15-.1 2.4-1.63 3.38-2.3.63.09 1.29.14 1.97.14 5.08 0 9.2-3.26 9.2-7.28S17.08 3.2 12 3.2Z" />
    </svg>
  );
}

/** GitHub 마크 — currentColor 라 버튼 호버 색을 그대로 따라간다 */
function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}
