import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AnimatedHero } from '@/components/AnimatedHero';
import { BgFlow } from '@/components/BgFlow';
import { Section } from '@/components/Section';
import { ProgramTabs } from '@/components/ProgramTabs';
import { NoticeShowcase } from '@/components/NoticeShowcase';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { LabCarousel } from '@/components/LabCarousel';
import { Reveal } from '@/components/Reveal';
import { Container } from '@/components/Container';
import { programs, board, pick, getCalendarEntries } from '@/lib/content';
import { getLabsDirectory } from '@/lib/faculty';
import { formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

const stats = [
  { key: 'faculty', value: 24, unitKey: 'facultyUnit' },
  { key: 'students', value: 620, unitKey: 'studentsUnit' },
  { key: 'labs', value: 33, unitKey: 'labsUnit' },
  { key: 'papers', value: 150, unitKey: 'papersUnit' },
] as const;

export default function HomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const t = useTranslations('home');
  const tBoard = useTranslations('board');
  const tMenu = useTranslations('menu');
  const tNews = useTranslations('news');
  const labs = getLabsDirectory();

  // 공지 쇼케이스 데이터: 학부·대학원 공지를 합쳐 날짜 내림차순, 상위 7건.
  // group 라벨은 기존 board 키를 재사용(신규 메시지 키 금지).
  const showcaseNotices = [
    ...board.noticesUndergrad.map((n) => ({ ...n, groupLabel: tBoard('noticesUndergrad.title') })),
    ...board.noticesGraduate.map((n) => ({ ...n, groupLabel: tBoard('noticesGraduate.title') })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 7)
    .map((n) => ({
      id: n.id,
      date: n.date,
      title: pick(n.title, locale),
      groupLabel: n.groupLabel,
    }));

  return (
    <>
      {/* 홈 단일 연속 배경(고정 그라디언트 레이어 + 섹션별 스크롤 색 전환) */}
      <BgFlow />

      {/* 1. 애니메이션 히어로 (풀뷰포트) */}
      <AnimatedHero />

      {/* 2. 컬러 스테이트먼트 — 배경 플로우 위 흰 텍스트(대형이라 AA large).
          상단 패딩을 줄여 텍스트를 위로 올림(디졸브 타이밍이 자연스럽게). */}
      <section data-flow className="px-6 pb-16 pt-8 text-white sm:px-10 lg:px-16 lg:pb-24 lg:pt-12">
        <Reveal className="mx-auto max-w-5xl">
          <p className="text-[clamp(2rem,5.5vw,4.75rem)] font-black leading-[1.12] tracking-tighter">
            {t.rich('weAre.statement', {
              c1: (c) => <span className="text-yonsei-gold">{c}</span>,
              c2: (c) => <span className="text-yonsei-sky">{c}</span>,
              br: () => <br />,
            })}
          </p>
          <Link
            href="/about"
            className="mt-10 inline-flex items-center gap-2 border-b-2 border-white pb-1 text-base font-semibold text-white transition-opacity hover:opacity-70"
          >
            {t('weAre.link')}
          </Link>
        </Reveal>
      </section>

      {/* 3. 통계 스트립 (풀블리드) — 배경 플로우 위 흰 텍스트.
          숫자를 위로 올리고 아래에 다크 여백을 둬, ProgramTabs 디졸브가
          글자 없는 구간에서 일어나게 한다. */}
      <section data-flow className="full-bleed border-t border-white/15 text-white">
        <Container>
          <dl className="grid grid-cols-2 gap-6 pb-28 pt-10 sm:pb-40 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.key} className="text-center">
                <dd className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  {s.value.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')}
                  <span className="text-yonsei-gold">{t(`stats.${s.unitKey}`)}</span>
                </dd>
                <dt className="mt-1 text-sm text-white/70">{t(`stats.${s.key}`)}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* 4. 프로그램 탭 (이미지 스왑 + 학부/대학원) */}
      <ProgramTabs
        undergraduate={programs.undergraduate}
        graduate={programs.graduate}
        locale={locale}
      />

      {/* 5. 연구실 카드 캐러셀 (자동 흐름 + 스와이프) — 흰 배경(디졸브 이후 구간) */}
      <section className="full-bleed pb-10 pt-10 sm:pb-14 sm:pt-14">
        {/* 모바일: 헤더를 한 줄 컴팩트(작은 타이포·좁은 여백)로 */}
        <div className="mx-auto mb-4 max-w-[1360px] px-6 sm:mb-8 sm:px-10 lg:px-16">
          <div className="flex items-end justify-between gap-3 sm:gap-4">
            <h2 className="text-lg font-bold text-content sm:text-headline">
              {t.rich('people.heading', {
                count: labs.length,
                em: (c) => <em className="font-display font-normal not-italic text-yonsei-blue">{c}</em>,
              })}
            </h2>
            <Link href="/research#labs" className="whitespace-nowrap pb-1 text-xs font-semibold text-yonsei-blue hover:underline sm:text-sm">
              {t('people.cta')}
            </Link>
          </div>
        </div>
        <LabCarousel labs={labs} locale={locale} />
      </section>

      {/* 6. 공지 쇼케이스 (풀블리드) — 학부·대학원 공지를 밝은 로열블루 위에 지그재그로 */}
      <NoticeShowcase
        notices={showcaseNotices}
        locale={locale}
        heading={tMenu('news.items.notices')}
        subtitle={tNews('hero.subtitle')}
        moreLabel={t('newsPreview.viewAll')}
      />

      {/* 6-b. 세미나 (독립 풀폭 섹션 — 가로 카드 3장). 흰 배경 위 라이트 톤. */}
      <Section size="sm" aria-labelledby="seminars-title">
        <div className="mb-6 flex items-center justify-between border-b-2 border-yonsei-navy pb-2">
          <h2 id="seminars-title" className="text-lg font-bold text-content">
            {tBoard('seminars.title')}
          </h2>
          <Link href="/news#seminars" className="text-sm font-semibold text-yonsei-blue hover:underline">
            {tBoard('seminars.more')} →
          </Link>
        </div>
        <ul className="grid gap-6 md:grid-cols-3">
          {board.seminars.slice(0, 3).map((s) => (
            <li key={s.id}>
              <Link
                href={`/news/post/${s.id}`}
                className="group flex h-full flex-col gap-2 rounded-card border border-surface-border bg-surface p-5 transition-all hover:-translate-y-1 hover:border-yonsei-blue/40 hover:shadow-card"
              >
                <time dateTime={s.date} className="text-sm font-semibold tabular-nums text-yonsei-blue">
                  {formatDate(s.date, locale)}
                </time>
                <span className="line-clamp-3 font-medium text-content group-hover:text-yonsei-blue">
                  {pick(s.title, locale)}
                </span>
                <span className="mt-auto pt-1 text-sm text-content-faint">
                  {tBoard('seminars.hostLabel')}: {pick(s.host, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* 6-b-2. 행사 (독립 풀폭 섹션). 같은 보드 그룹인 세미나와 묶여 보이도록 상단 패딩 제거. */}
      <Section size="sm" className="!pt-0" aria-labelledby="events-title">
        <div className="mb-6 flex items-center justify-between border-b-2 border-yonsei-navy pb-2">
          <h2 id="events-title" className="text-lg font-bold text-content">
            {tBoard('events.title')}
          </h2>
          <Link href="/news#events" className="text-sm font-semibold text-yonsei-blue hover:underline">
            {tBoard('events.more')} →
          </Link>
        </div>
        <ul className="grid gap-6 md:grid-cols-3">
          {board.events.slice(0, 3).map((e) => (
            <li key={e.id}>
              <Link
                href={`/news/post/${e.id}`}
                className="group flex h-full flex-col gap-3 rounded-card border border-surface-border bg-surface p-5 transition-all hover:-translate-y-1 hover:border-yonsei-blue/40 hover:shadow-card"
              >
                <span className="w-fit shrink-0 rounded-md bg-yonsei-navy/5 px-2.5 py-1 text-xs font-bold text-yonsei-navy">
                  {pick(e.dateLabel, locale)}
                </span>
                <span className="line-clamp-3 font-medium text-content group-hover:text-yonsei-blue">
                  {pick(e.title, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* 6-d. 금주의 행사 캘린더 — 행사 게시판 + 동문(행사 표시분) 통합 */}
      <WeeklyCalendar entries={getCalendarEntries()} locale={locale} />
    </>
  );
}
