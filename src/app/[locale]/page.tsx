import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AnimatedHero } from '@/components/AnimatedHero';
import { Section } from '@/components/Section';
import { ProgramTabs } from '@/components/ProgramTabs';
import { NewsCarousel } from '@/components/NewsCarousel';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { Reveal } from '@/components/Reveal';
import { Container } from '@/components/Container';
import { news, research, programs, board, pick } from '@/lib/content';
import { formatDate } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

const stats = [
  { key: 'faculty', value: 24, unitKey: 'facultyUnit' },
  { key: 'students', value: 620, unitKey: 'studentsUnit' },
  { key: 'labs', value: 18, unitKey: 'labsUnit' },
  { key: 'papers', value: 150, unitKey: 'papersUnit' },
] as const;

export default function HomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const t = useTranslations('home');
  const tBoard = useTranslations('board');
  const featuredResearch = research.slice(0, 3);

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

      {/* 5. 연구 쇼케이스 (이미지 그리드) */}
      <section className="full-bleed bg-yonsei-navy">
        <div className="mx-auto max-w-[1360px] px-6 pt-14 sm:px-10 lg:px-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-headline font-bold text-white">
              {t.rich('people.heading', {
                em: (c) => <em className="font-display font-normal not-italic text-yonsei-gold">{c}</em>,
              })}
            </h2>
            <Link href="/research" className="pb-1 text-sm font-semibold text-yonsei-gold hover:underline">
              {t('people.cta')}
            </Link>
          </div>
        </div>
        <ul className="mt-8 grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
          {featuredResearch.map((r) => (
            <li key={r.id}>
              <Link
                href="/research"
                className="group relative block aspect-[4/5] overflow-hidden"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url(${r.image})` }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-yonsei-navy/90 via-yonsei-navy/30 to-transparent"
                />
                <span className="absolute inset-x-0 bottom-0 p-6">
                  <span className="block text-lg font-bold text-white">{pick(r.title, locale)}</span>
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded bg-black/40 px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {t('people.detail')} →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 6. 뉴스 캐러셀 (다크) */}
      <NewsCarousel items={news.slice(0, 6)} locale={locale} />

      {/* 6-b. 세미나 · 행사 */}
      <Section aria-labelledby="board-title">
        <h2 id="board-title" className="sr-only">
          {tBoard('seminars.title')} · {tBoard('events.title')}
        </h2>
        <div className="grid gap-10 lg:grid-cols-2">
          {/* 세미나 */}
          <div>
            <div className="mb-4 flex items-center justify-between border-b-2 border-yonsei-navy pb-2">
              <h3 className="text-lg font-bold text-content">{tBoard('seminars.title')}</h3>
              <Link href="/news#seminars" className="text-sm font-semibold text-yonsei-blue hover:underline">
                {tBoard('seminars.more')} →
              </Link>
            </div>
            <ul className="divide-y divide-surface-border">
              {board.seminars.map((s) => (
                <li key={s.id}>
                  <Link href={`/news/post/${s.id}`} className="group flex gap-4 py-4">
                    <time
                      dateTime={s.date}
                      className="shrink-0 text-sm font-semibold tabular-nums text-yonsei-blue"
                    >
                      {formatDate(s.date, locale)}
                    </time>
                    <span className="min-w-0">
                      <span className="line-clamp-2 font-medium text-content group-hover:text-yonsei-blue">
                        {pick(s.title, locale)}
                      </span>
                      <span className="mt-0.5 block text-sm text-content-faint">
                        {tBoard('seminars.hostLabel')}: {pick(s.host, locale)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 행사 */}
          <div>
            <div className="mb-4 flex items-center justify-between border-b-2 border-yonsei-navy pb-2">
              <h3 className="text-lg font-bold text-content">{tBoard('events.title')}</h3>
              <Link href="/news#events" className="text-sm font-semibold text-yonsei-blue hover:underline">
                {tBoard('events.more')} →
              </Link>
            </div>
            <ul className="divide-y divide-surface-border">
              {board.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/news/post/${e.id}`} className="group flex gap-4 py-4">
                    <span className="shrink-0 rounded-md bg-yonsei-navy/5 px-2.5 py-1 text-xs font-bold text-yonsei-navy">
                      {pick(e.dateLabel, locale)}
                    </span>
                    <span className="line-clamp-2 font-medium text-content group-hover:text-yonsei-blue">
                      {pick(e.title, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 6-c. 학부 · 대학원 공지사항 */}
      <Section tone="soft" aria-labelledby="notices-title">
        <h2 id="notices-title" className="sr-only">
          {tBoard('noticesUndergrad.title')} · {tBoard('noticesGraduate.title')}
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { key: 'noticesUndergrad', items: board.noticesUndergrad, href: '/news#notices' },
            { key: 'noticesGraduate', items: board.noticesGraduate, href: '/news#notices' },
          ].map((col) => (
            <div key={col.key} className="rounded-card border border-surface-border bg-surface p-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-bold text-content">{tBoard(`${col.key}.title`)}</h3>
                <Link href={col.href} className="text-sm font-semibold text-yonsei-blue hover:underline">
                  {tBoard(`${col.key}.more`)} →
                </Link>
              </div>
              <ul className="divide-y divide-surface-border">
                {col.items.map((n) => (
                  <li key={n.id}>
                    <Link href={`/news/post/${n.id}`} className="group flex items-center justify-between gap-4 py-3">
                      <span className="line-clamp-1 text-sm text-content-soft group-hover:text-yonsei-blue">
                        {pick(n.title, locale)}
                      </span>
                      <time dateTime={n.date} className="shrink-0 text-xs tabular-nums text-content-faint">
                        {formatDate(n.date, locale)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* 6-d. 금주의 행사 캘린더 */}
      <WeeklyCalendar events={board.events} locale={locale} />

      {/* 7. 이노베이트 배너 + 비디오 */}
      <section className="bg-gradient-to-b from-surface-soft to-surface px-6 pt-16 text-center sm:px-10">
        <Reveal>
          <h2 className="text-[clamp(2.25rem,7vw,5.5rem)] font-black tracking-tight text-yonsei-navy/85">
            {t.rich('innovate.heading', {
              em: (c) => <em className="font-display font-normal not-italic">{c}</em>,
            })}
          </h2>
        </Reveal>
        <div className="mx-auto mt-10 flex aspect-video max-h-[520px] w-full max-w-5xl items-center justify-center rounded-t-lg bg-yonsei-navy text-white/50">
          <span className="flex items-center gap-3 text-sm">
            <span aria-hidden="true" className="text-2xl">▶</span>
            {t('innovate.videoLabel')}
          </span>
        </div>
      </section>

      {/* 8. CTA 밴드 */}
      <section className="full-bleed relative isolate overflow-hidden bg-yonsei-navy text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-30"
          style={{ backgroundImage: 'url(/img/hero.svg)' }}
        />
        <Container>
          <div className="flex flex-col items-start gap-6 py-section-sm md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-headline font-bold">{t('cta.title')}</h2>
              <p className="mt-3 text-white/80">{t('cta.body')}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admission" className="btn-primary bg-white !text-yonsei-navy hover:bg-yonsei-gold">
                {t('cta.primary')}
              </Link>
              <Link href="/contact" className="btn border border-white/40 text-white hover:bg-white/10">
                {t('cta.secondary')}
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
