'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** 한 번에 노출하는 페이지 번호 개수 — 현재 페이지를 가운데 두는 창 */
const WINDOW = 5;

/** hrefTemplate 안에서 페이지 번호가 들어갈 자리 */
const PAGE_TOKEN = '{page}';

/**
 * 자리표시자를 실제 번호로 바꾼다. 1페이지만은 `page=1` 을 떼어 목록의 기본 주소와
 * 같은 URL 로 만든다 — 같은 화면이 두 주소로 갈리면 정본 판정과 뒤로가기가 지저분해진다.
 */
function fillPage(template: string, page: number): string {
  const [path, query = ''] = template.split('?');
  const params = new URLSearchParams(query.replace(PAGE_TOKEN, String(page)));
  if (page === 1) params.delete('page');
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * 게시판 목록 하단 페이지네이션 — ‹ 1 2 3 4 5 › (현재 페이지는 굵게 + 아래 짧은 룰).
 * 페이지가 하나뿐이어도 그린다: "여기가 목록의 끝"이라는 신호가 UX 상 필요하고,
 * 글이 쌓여 2페이지가 생기는 순간 컨트롤이 갑자기 나타나는 것보다 낫다.
 * 사이트 톤에 맞춰 각지게(밑줄 3px 룰) + 네이비, 그림자·라운드 없음.
 *
 * 두 가지 모드로 쓴다 — 클라이언트 목록은 onChange(상태 갱신), 서버에서 그리는 목록은
 * hrefTemplate(진짜 링크). 겉모습·클래스는 완전히 같다.
 */
export function BoardPagination({
  page,
  pageCount,
  onChange,
  hrefTemplate,
}: {
  /** 1-based 현재 페이지 */
  page: number;
  pageCount: number;
  /** 클라이언트 목록의 페이지 전환. hrefTemplate 를 쓰는 링크 모드에서는 필요 없다. */
  onChange?: (page: number) => void;
  /**
   * 링크 모드 — `{page}` 자리표시자가 든 목록 경로
   * (예: `/news/notices?cat=undergrad&page={page}`). 콜백이 아니라 **문자열**인 이유는
   * 이 컴포넌트가 클라이언트 컴포넌트라 서버 부모가 함수를 경계 너머로 넘길 수 없기
   * 때문이다. 문자열이면 서버에서 그대로 만들어 줄 수 있고, 각 페이지가 진짜 링크가 되어
   * 새 탭·뒤로가기·크롤이 모두 통한다.
   */
  hrefTemplate?: string;
}) {
  const t = useTranslations('board.pagination');

  const total = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), total);

  // 현재 페이지를 창 가운데 두되, 양 끝에서는 창을 안쪽으로 붙여 항상 같은 개수를 보인다
  const size = Math.min(WINDOW, total);
  const start = Math.max(1, Math.min(current - Math.floor(WINDOW / 2), total - size + 1));
  const pages = Array.from({ length: size }, (_, i) => start + i);

  return (
    <nav aria-label={t('label')} className="mt-10 flex items-center justify-center gap-1 sm:gap-2">
      <Arrow
        direction="prev"
        label={t('prev')}
        disabled={current === 1}
        onClick={() => onChange?.(current - 1)}
        {...(hrefTemplate ? { href: fillPage(hrefTemplate, current - 1) } : {})}
      />

      {pages.map((p) => {
        const active = p === current;
        const className = cn(
          'relative min-w-[2.25rem] px-2 py-2 text-sm tabular-nums transition-colors sm:min-w-[2.75rem]',
          active
            ? 'font-bold text-yonsei-navy'
            : 'font-semibold text-content-soft hover:text-yonsei-blue',
        );
        // 현재 페이지 밑의 3px 네이비 룰 — 두 모드가 같은 조각을 쓴다
        const rule = active && (
          <span
            aria-hidden="true"
            className="absolute inset-x-2 bottom-0.5 h-[3px] bg-yonsei-navy"
          />
        );

        if (hrefTemplate) {
          return (
            <Link
              key={p}
              href={fillPage(hrefTemplate, p)}
              // 상세 페이지 하단에서 쓰므로 열 페이지 링크를 미리 당겨오지 않는다
              prefetch={false}
              aria-label={t('page', { page: p })}
              aria-current={active ? 'page' : undefined}
              className={cn(className, 'inline-block text-center')}
            >
              {p}
              {rule}
            </Link>
          );
        }

        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange?.(p)}
            aria-label={t('page', { page: p })}
            aria-current={active ? 'page' : undefined}
            className={className}
          >
            {p}
            {rule}
          </button>
        );
      })}

      <Arrow
        direction="next"
        label={t('next')}
        disabled={current === total}
        onClick={() => onChange?.(current + 1)}
        {...(hrefTemplate ? { href: fillPage(hrefTemplate, current + 1) } : {})}
      />
    </nav>
  );
}

/** 좌우 이동 셰브론 — 끝 페이지에서는 비활성(옅은 회색, 클릭 불가) */
function Arrow({
  direction,
  label,
  disabled,
  onClick,
  href,
}: {
  direction: 'prev' | 'next';
  label: string;
  disabled: boolean;
  onClick: () => void;
  /** 링크 모드에서만 넘어온다 — 있으면 button 대신 Link 로 그린다 */
  href?: string;
}) {
  const className = cn(
    'p-2 transition-colors sm:mx-2',
    disabled
      ? 'cursor-default text-content-faint/45'
      : 'text-content hover:text-yonsei-blue',
  );
  const icon = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-5 w-5"
    >
      <path
        d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (href !== undefined) {
    // 끝 페이지의 화살표는 갈 곳이 없다 — 비활성 링크는 없으므로 클릭·포커스가 닿지
    // 않는 span 으로 자리만 지킨다(모양은 disabled 버튼과 같다).
    return disabled ? (
      <span aria-hidden="true" className={className}>
        {icon}
      </span>
    ) : (
      <Link href={href} prefetch={false} aria-label={label} className={className}>
        {icon}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={className}>
      {icon}
    </button>
  );
}
