import { getTranslations } from 'next-intl/server';
import { pick } from '@/lib/content';
import { LandingScope } from '@/components/LandingScope';
import type { Locale } from '@/i18n/routing';
import aboutStatsData from '@content/about-stats.json';

const visionKeys = ['0', '1', '2'] as const;

/** 숫자로 보는 학부 — content/about-stats.json (수치·라벨 모두 콘텐츠) */
const aboutStats = aboutStatsData as { value: string; label: { ko: string; en: string } }[];

/**
 * 학부 소개 문구 + 비전과 목표 + 숫자 스트립을 에디토리얼 타이포그래피로 묶은
 * 서버 컴포넌트. 카드·박스·그림자 없이 여백·헤어라인·번호 매김으로만 위계를
 * 만든다 (Anthropic/Claude 무드). '학과 소개' 탭 안에서 HistoryTimeline 위에 놓여
 * 소개→비전→숫자→연혁의 흐름을 만든다.
 */
export async function AboutIntro({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'about' });

  return (
    // 탭 진입 랜딩 — 제목 리빌 → 형광 밑줄이 그어짐 → 본문 → 비전 3열 → 숫자 카운트업.
    // (숫자 스트립은 대개 화면 밖이라 훅이 자동으로 ScrollTrigger 로 넘긴다)
    <LandingScope name="about-intro">
    <div className="mb-16">
      {/* 소개 문구 — 큰 디스플레이 제목 + 왼쪽 정렬 본문 */}
      <div>
        <p data-land="rise" data-land-order="0" className="eyebrow">
          ABOUT
        </p>
        {/* 세부탭 소제목 서체 = Paperlogy 7 Bold(사용자 지정) — EditorialTab 제목과 통일 */}
        <h3
          data-land="rise"
          data-land-order="1"
          style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
          className="mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.1] tracking-tight text-content"
        >
          {/* <u> 태그(ko 메시지의 "기계공학부")를 멀티라인 형광 밑줄 span 으로 렌더 —
              CodePen 원본 그대로 시범(사용자 지시). en 메시지는 태그 없음(그대로 통과). */}
          {t.rich('intro.title', {
            u: (chunks) => (
              <span data-land="underline" data-land-order="2" className="underline-magical">
                {chunks}
              </span>
            ),
          })}
        </h3>
        <p
          data-land="rise"
          data-land-order="3"
          className="mt-6 max-w-prose text-lg leading-relaxed text-content-soft"
        >
          {t('intro.body')}
        </p>
      </div>

      {/* 비전과 목표 — 카드 없이 번호 + 헤어라인 룰로 구성한 에디토리얼 리스트 */}
      <div className="mt-16 border-t border-surface-border pt-8">
        <p data-land="rise" data-land-order="4" className="eyebrow">
          OUR VISION
        </p>
        <h4
          data-land="rise"
          data-land-order="4"
          className="mt-3 text-2xl font-bold tracking-tight text-content"
        >
          {t('vision.title')}
        </h4>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {visionKeys.map((key, i) => (
            <li key={key} data-land="rise" data-land-order="5" className="border-t border-surface-border pt-5">
              <span className="block text-4xl font-light tabular-nums text-yonsei-blue/40">
                {String(i + 1).padStart(2, '0')}
              </span>
              {/* 제목 1.5배(18→27px) — 사용자 지시 */}
              <h5 className="mt-4 text-[1.6875rem] font-bold leading-snug text-content">
                {t(`vision.items.${key}.title`)}
              </h5>
              <p className="mt-2 text-sm leading-relaxed text-content-soft">
                {t(`vision.items.${key}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* 숫자로 보는 학부 — 큰 네이비 숫자 + 아래 라벨 (기존 통계 스트립 타이포 유지).
          수치·라벨은 content/about-stats.json 에서 편집 */}
      {/* 가운데 정렬 + 위아래 헤어라인(아래 선이 연혁과의 구분선 역할) */}
      <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 border-b border-t border-surface-border py-12 text-center md:grid-cols-4">
        {aboutStats.map((stat) => (
          <div key={stat.label.en}>
            {/* leading-none: 숫자 라인박스의 여분 공간을 제거해 라벨과의 간격을 고르게 */}
            <dd
              data-land="count"
              data-land-order="6"
              className="text-5xl font-bold leading-none text-yonsei-navy tabular-nums"
            >
              {stat.value}
            </dd>
            {/* 라벨 1.5배(14/16→21/24px) — 사용자 지시 */}
            <dt
              data-land="rise"
              data-land-order="6"
              className="mt-3 text-[1.3125rem] font-semibold text-content-soft sm:text-2xl"
            >
              {pick(stat.label, locale as Locale)}
            </dt>
          </div>
        ))}
      </dl>
    </div>
    </LandingScope>
  );
}
