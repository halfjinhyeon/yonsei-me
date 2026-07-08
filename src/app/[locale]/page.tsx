import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AnimatedHero } from '@/components/AnimatedHero';
import { Section } from '@/components/Section';
import { ProgramTabs } from '@/components/ProgramTabs';
import { NoticeShowcase } from '@/components/NoticeShowcase';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { LabCarousel } from '@/components/LabCarousel';
import { Reveal } from '@/components/Reveal';
import { Container } from '@/components/Container';
import { programs, board, pick } from '@/lib/content';
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
      {/* 1. 애니메이션 히어로 (풀뷰포트) */}
      <AnimatedHero />

      {/* 2. 컬러 스테이트먼트 */}
      <section className="px-6 py-24 sm:px-10 lg:px-16 lg:py-32">
        <Reveal className="mx-auto max-w-5xl">
          <p className="text-[clamp(2rem,5.5vw,4.75rem)] font-black leading-[1.12] tracking-tighter text-content">
            {t.rich('weAre.statement', {
              c1: (c) => <span className="text-yonsei-navy">{c}</span>,
              c2: (c) => <span className="text-yonsei-blue">{c}</span>,
              br: () => <br />,
            })}
          </p>
          <Link
            href="/about"
            className="mt-10 inline-flex items-center gap-2 border-b-2 border-yonsei-navy pb-1 text-base font-semibold text-yonsei-navy transition-opacity hover:opacity-70"
          >
            {t('weAre.link')}
          </Link>
        </Reveal>
      </section>

      {/* 3. 통계 스트립 (풀블리드) */}
      <section className="full-bleed border-y border-surface-border bg-surface-soft">
        <Container>
          <dl className="grid grid-cols-2 gap-6 py-10 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.key} className="text-center">
                <dd className="text-3xl font-extrabold tracking-tight text-yonsei-navy sm:text-4xl">
                  {s.value.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')}
                  <span className="text-yonsei-blue">{t(`stats.${s.unitKey}`)}</span>
                </dd>
                <dt className="mt-1 text-sm text-content-soft">{t(`stats.${s.key}`)}</dt>
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

      {/* 5. 연구실 카드 캐러셀 (자동 흐름 + 스와이프) — 아래 공지 쇼케이스가
          네이비 베일(ScrollVeil)로 시작하므로 경계는 스크롤 시 애니메이션으로 전환 */}
      <section className="full-bleed bg-yonsei-navy pb-10 pt-10 sm:pb-14 sm:pt-14">
        {/* 모바일: 헤더를 한 줄 컴팩트(작은 타이포·좁은 여백)로 */}
        <div className="mx-auto mb-4 max-w-[1360px] px-6 sm:mb-8 sm:px-10 lg:px-16">
          <div className="flex items-end justify-between gap-3 sm:gap-4">
            <h2 className="text-lg font-bold text-white sm:text-headline">
              {t.rich('people.heading', {
                count: labs.length,
                em: (c) => <em className="font-display font-normal not-italic text-yonsei-gold">{c}</em>,
              })}
            </h2>
            <Link href="/research#labs" className="whitespace-nowrap pb-1 text-xs font-semibold text-yonsei-gold hover:underline sm:text-sm">
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

      {/* 6-b. 세미나 (구 학과 사이트처럼 독립 풀폭 섹션 — 가로 카드 3장).
          세미나→행사→공지는 한 "보드 그룹"이라 size=sm 으로 세로 리듬을 좁힌다. */}
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

      {/* 6-b-2. 행사 (독립 풀폭 섹션 — 뒤 6-c 공지가 soft 라 여긴 기본 톤으로 두어 soft 연속을 피함).
          같은 보드 그룹인 세미나와 한 묶음으로 읽히도록 상단 패딩은 제거. */}
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

      {/* 6-d. 금주의 행사 캘린더 */}
      <WeeklyCalendar events={board.events} locale={locale} />
    </>
  );
}
