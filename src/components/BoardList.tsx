import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn, formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

export interface BoardRow {
  id: string;
  /** 없으면 날짜 칸을 생략 (자료실 등 바로가기형 행) */
  date?: string;
  title: string;
  subtitle?: string;
  tag?: string;
  href?: string;
  /** 우측 썸네일 — 없으면 흰 공백(데스크톱)으로 레이아웃 유지 */
  image?: string;
  /** 카테고리 필터용 식별자 (FilterableBoardList 의 categories 와 매칭). 표시엔 안 씀 */
  category?: string;
  /** 목록 최상단 고정 글 — 핀 배지를 붙인다(정렬은 상류가 이미 마쳤다) */
  pinned?: boolean;
}

/**
 * 게시판 목록 — 에디토리얼 행 스타일 (홍익 조형대 뉴스 레퍼런스).
 * 좌: 네이비 배지(tag) + 큰 볼드 제목 + 발췌 2줄(subtitle) + 하단 날짜,
 * 우: 16:10 썸네일(없으면 흰 공백 유지). 행 사이는 헤어라인.
 * 공지/뉴스/세미나/행사/학위논문/자료실/취업 등 모든 게시판 탭 공용.
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
  const t = useTranslations('board');

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
        {/* 빈 상태 마스코트 — eagle_empty 이미지 (뉴스 카드 미등록 상태와 동일 자산) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/eagle_empty.png" alt="" aria-hidden="true" className="h-20 w-auto opacity-70" />
        <p className="max-w-sm text-content-soft">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-surface-border border-y border-surface-border">
      {items.map((item) => {
        const row = (
          <div className="grid gap-5 py-7 sm:grid-cols-[minmax(0,1fr)_15rem] sm:gap-10 sm:py-8">
            {/* 좌: 배지 · 제목 · 발췌 · 날짜(하단 고정) */}
            <div className="flex flex-col items-start">
              {/* 배지 줄 — 고정 핀이 먼저, 그 뒤에 게시판 태그. 둘 다 없으면 줄 자체를 내지 않는다.
                  외곽선 배지의 패딩을 0.0625rem 씩 줄인 이유는 1px 테두리 때문 — 칠한 배지와
                  나란히 설 때 높이가 어긋나면 안 된다(자료실 목록과 같은 보정). */}
              {(item.pinned || item.tag) && (
                <span className="mb-3 flex flex-wrap items-center gap-2">
                  {item.pinned && (
                    <span className="inline-flex items-center gap-1.5 border border-yonsei-navy bg-surface px-[0.5625rem] py-[0.1875rem] text-xs font-bold text-yonsei-navy">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                        <path d="M16 3v2l-1 1v5l3 3v2h-5v5l-1 1-1-1v-5H6v-2l3-3V6L8 5V3h8Z" />
                      </svg>
                      {t('pinned')}
                    </span>
                  )}
                  {item.tag && (
                    <span className="inline-block bg-yonsei-navy px-2.5 py-1 text-xs font-bold text-white">
                      {item.tag}
                    </span>
                  )}
                </span>
              )}
              <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-content transition-colors group-hover:text-yonsei-blue sm:text-xl">
                {item.title}
              </h3>
              {item.subtitle && (
                <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-content-soft">
                  {item.subtitle}
                </p>
              )}
              {item.date && (
                <time
                  dateTime={item.date}
                  className="mt-auto block pt-4 text-sm tabular-nums text-content-faint"
                >
                  {formatDate(item.date, locale)}
                </time>
              )}
            </div>

            {/* 우: 썸네일 — 없으면 흰 공백(데스크톱만, 모바일은 통째로 생략) */}
            <div
              aria-hidden={item.image ? undefined : 'true'}
              className={cn(
                'aspect-[16/10] w-full overflow-hidden bg-surface',
                !item.image && 'hidden sm:block',
              )}
            >
              {item.image && (
                // eslint-disable-next-line @next/next/no-img-element -- R2/외부 썸네일
                <img
                  src={item.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              )}
            </div>
          </div>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="group block">
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
