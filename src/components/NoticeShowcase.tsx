// 공지 쇼케이스 (풀블리드) — 연세 학부대학 학생공지 섹션 레퍼런스.
// 밝은 로열블루 그라디언트(anim-gradient-notice) + 웨이브 라인(MeshCanvas) +
// 대형 세로 워터마크 타이포 위에, 좌측 큰 타이틀 / 우측 흰색 공지 카드 2열 지그재그.
// 카드는 Reveal(IntersectionObserver 1회 리빌)로 스크롤 시 하나씩 순차 상승 등장.
// 서버 컴포넌트 — 상호작용/리빌은 자식(MeshCanvas·Reveal)이 담당.

import { Link } from '@/i18n/navigation';
import { MeshCanvas } from './MeshCanvas';
import { Reveal } from './Reveal';
import { ScrollVeil } from './ScrollVeil';
import { formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

/** 부모에서 pick 완료된 카드 데이터. group 라벨도 부모에서 해석해 문자열로 전달. */
export interface ShowcaseNotice {
  id: string;
  date: string;
  title: string;
  groupLabel: string;
}

export function NoticeShowcase({
  notices,
  locale,
  heading,
  subtitle,
  moreLabel,
}: {
  notices: ShowcaseNotice[];
  locale: Locale;
  heading: string;
  subtitle: string;
  moreLabel: string;
}) {
  // 짝/홀 인덱스로 좌/우 열에 분배. 전역 인덱스는 리빌 지연(순차 등장)에 사용.
  const columns: { notice: ShowcaseNotice; order: number }[][] = [[], []];
  notices.forEach((notice, order) => {
    columns[order % 2].push({ notice, order });
  });

  return (
    <section className="full-bleed anim-gradient-notice relative isolate overflow-hidden py-section text-white">
      {/* 흐르는 웨이브 라인 오버레이 */}
      <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-50" />

      {/* 이전 섹션(네이비)에서 이 섹션(로열블루)으로의 스크롤 스크럽 배경 전환 —
          섹션이 떠오르는 진행률에 맞춰 네이비 베일이 걷힌다 */}
      <ScrollVeil className="pointer-events-none absolute inset-0 -z-[5] bg-yonsei-navy" />

      {/* 대형 세로 워터마크 타이포 — 왼쪽 가장자리, 잘려도 됨. lg 이상만 노출. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-2 top-1/2 hidden -translate-y-1/2 select-none font-display text-[13rem] font-black leading-none tracking-tighter text-white/10 [writing-mode:vertical-rl] lg:block"
      >
        YONSEI
      </span>

      {/* 기계 독수리 마스코트 워터마크 — YONSEI 타이포와 같은 톤으로 희미하게.
          public/img/eagle.png(투명 배경 흰색 아트). 베일(-z-[5])보다 뒤(-z-[6])라
          배경 전환과 함께 드러난다. 모바일: 헤더 우상단에 작게(가장자리 살짝 잘림),
          데스크톱: 좌하단에 크게. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 top-8 -z-[6] h-64 w-64 bg-contain bg-center bg-no-repeat opacity-10 lg:bottom-[-3rem] lg:left-[6%] lg:right-auto lg:top-auto lg:h-[30rem] lg:w-[30rem]"
        style={{ backgroundImage: 'url(/img/eagle.png)' }}
      />

      <div className="mx-auto grid max-w-[1360px] grid-cols-1 gap-12 px-6 sm:px-10 lg:grid-cols-[1fr_1.6fr] lg:px-16">
        {/* 좌: 타이틀 + 안내문 + View more (카드 스크롤 동안 고정) */}
        <div className="self-start lg:sticky lg:top-28">
          <h2 className="text-[clamp(2rem,4vw,3.25rem)] font-bold leading-tight">{heading}</h2>
          <p className="mt-5 max-w-md text-white/80">{subtitle}</p>
          <Link
            href="/news#notices"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {moreLabel}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* 우: 2열 지그재그 — 오른쪽 열이 반 칸 아래로 오프셋. 모바일은 1열 스택. */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {columns.map((column, colIndex) => (
            <div key={colIndex} className={colIndex === 1 ? 'sm:mt-20' : undefined}>
              <div className="grid gap-6">
                {column.map(({ notice, order }) => (
                  <Reveal key={notice.id} as="div" from="up" delay={order * 90}>
                    <NoticeCard notice={notice} locale={locale} />
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NoticeCard({ notice, locale }: { notice: ShowcaseNotice; locale: Locale }) {
  // 흰 카드는 다크모드에서도 흰색 유지 → 내부 텍스트는 시맨틱 토큰 대신 고정 뉴트럴.
  return (
    <Link
      href={`/news/post/${notice.id}`}
      className="group flex min-h-[11rem] flex-col rounded-lg bg-white p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <div className="flex items-center gap-2">
        <time dateTime={notice.date} className="text-sm tabular-nums text-neutral-500">
          {formatDate(notice.date, locale)}
        </time>
        <span className="text-xs font-semibold text-blue-700">{notice.groupLabel}</span>
      </div>
      <p className="mt-3 line-clamp-3 text-lg font-bold leading-snug text-neutral-900">
        {notice.title}
      </p>
      <span
        aria-hidden="true"
        className="mt-auto grid h-9 w-9 select-none place-items-center self-end rounded-md border border-blue-600/40 text-blue-700 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:bg-blue-600 group-hover:text-white"
      >
        ↗
      </span>
    </Link>
  );
}
