import { Container } from '@/components/Container';
import { Link } from '@/i18n/navigation';

/**
 * 상세 페이지용 상단 sticky 내비 바 — 히어로 바로 아래 풀와이드 남색 띠.
 *
 * TabbedContent(목록)·BoardShell(게시글 상세)이 쓰는 바와 같은 문법이지만, 형제 탭이
 * 없는 단일 상세 페이지(교수 프로필 등)를 위한 것이라 드롭다운 없이 경로만 보여 준다.
 * 목록으로 돌아가는 버튼은 본문 맨 앞·맨 뒤에 따로 있으므로 여기엔 두지 않는다
 * (같은 목적지 링크가 한 화면에 두 번 나오지 않게).
 *
 * 높이·색·구분선은 TabbedContent 의 바와 일치시킨다(sticky top-16 / lg:top-20 는
 * 헤더 높이에 맞춘 값이라 함께 바뀌어야 한다).
 */
export function DetailNavBar({
  homeLabel,
  sectionLabel,
  sectionHref,
  currentLabel,
}: {
  /** 홈 아이콘 aria-label */
  homeLabel: string;
  /** 소속 섹션명 (예: "교수진") — 목록으로 돌아가는 링크.
   *  목록 페이지 자신에서는 생략한다(자기 자신으로 가는 링크가 되므로). */
  sectionLabel?: string;
  sectionHref?: string;
  /** 현재 페이지 이름 (상세는 교수 이름, 목록 페이지는 "교수진") */
  currentLabel: string;
}) {
  return (
    <div className="sticky top-16 z-30 w-full border-b border-white/10 bg-yonsei-navy lg:top-20">
      <Container>
        <nav aria-label={sectionLabel ?? currentLabel} className="flex h-12 items-stretch">
          {/* 홈 — TabbedContent 바와 같은 아이콘·구분선 */}
          <Link
            href="/"
            aria-label={homeLabel}
            className="flex items-center border-r border-white/15 pr-4 text-white transition-colors hover:text-white/70"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M3 10.5 12 4l9 6.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 9.5V20h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          {/* 섹션명 — 목록으로 가는 링크(브레드크럼 역할). 목록 페이지에선 생략 */}
          {sectionLabel && sectionHref && (
            <Link
              href={sectionHref}
              className="flex items-center border-r border-white/15 px-4 text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              {sectionLabel}
            </Link>
          )}

          {/* 현재 페이지 — 정적 표기. 좁은 화면에선 말줄임 */}
          <span
            aria-current="page"
            className="flex min-w-0 items-center px-4 text-sm font-semibold text-white"
          >
            <span className="truncate">{currentLabel}</span>
          </span>

        </nav>
      </Container>
    </div>
  );
}
