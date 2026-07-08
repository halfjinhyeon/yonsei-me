import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

export interface BoardRow {
  id: string;
  /** 없으면 날짜 칸을 생략 (자료실 등 바로가기형 행) */
  date?: string;
  title: string;
  subtitle?: string;
  tag?: string;
  href?: string;
}

/**
 * 공지/세미나/행사 등 게시판 스타일 목록. 날짜 + 제목(+ 부제/태그) 행,
 * href가 있으면 링크로 감싼다. 목록형 카테고리 탭에서 공용으로 쓴다.
 */
export function BoardList({
  items,
  locale,
  emptyLabel,
}: {
  items: BoardRow[];
  locale: Locale;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
        {/* 독수리 마스코트 실루엣 (파란 계열 색조) — 빈 상태의 브랜드 마크 */}
        <span aria-hidden="true" className="eagle-mask h-20 w-20 bg-yonsei-blue/35" />
        <p className="max-w-sm text-content-soft">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-surface-border border-y border-surface-border">
      {items.map((item) => {
        const row = (
          <div className="flex flex-col gap-1 py-5 sm:flex-row sm:items-center sm:gap-6">
            {item.date && (
              <time dateTime={item.date} className="shrink-0 text-sm tabular-nums text-content-faint sm:w-28">
                {formatDate(item.date, locale)}
              </time>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {item.tag && (
                  <span className="rounded-full bg-yonsei-navy/10 px-2.5 py-0.5 text-xs font-semibold text-yonsei-navy">
                    {item.tag}
                  </span>
                )}
                <h3 className="text-base font-medium text-content">{item.title}</h3>
              </div>
              {item.subtitle && <p className="mt-1 text-sm text-content-soft">{item.subtitle}</p>}
            </div>
          </div>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                href={item.href}
                className="group -mx-2 block rounded-md px-2 transition-colors hover:bg-surface-soft/60"
              >
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
