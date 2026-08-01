import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { pick } from '@/lib/content';
import { LandingScope } from '@/components/LandingScope';
import { guardKoreanBreaks } from '@/lib/typography';
import type { Locale } from '@/i18n/routing';
import aboutStatsData from '@content/about-stats.json';

const visionKeys = ['0', '1', '2'] as const;

/** 세부탭 소제목 서체 = Paperlogy 7 Bold(사용자 지정) — EditorialTab 제목과 통일 */
const SUBHEAD_FONT = { fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' };

/**
 * 블록 소제목 클래스 — 비전/학과 현황/연혁 세 헤더가 공유한다.
 * 모바일 22px·1.25 → md 30px·1.2 (2A 확정안).
 */
const SUBHEAD_CLASS =
  'mt-2.5 text-[22px] font-bold leading-[1.25] tracking-[-0.02em] text-content md:mt-3 md:text-[30px] md:leading-[1.2]';

/** eyebrow — 공용 .eyebrow(12px) 위에 모바일 11px 만 덧씌운다(유틸리티가 components 를 이긴다) */
const EYEBROW_CLASS = 'eyebrow text-[11px] md:text-xs';

/** 블록 상단 룰 + 룰 아래 여백 — 소개(탭 첫 블록)를 제외한 세 블록이 공유 */
const BLOCK_RULE = 'border-t border-surface-border pt-[22px] md:pt-7';

/** 숫자로 보는 학부 — content/about-stats.json (수치·라벨 모두 콘텐츠) */
const aboutStats = aboutStatsData as { value: string; label: { ko: string; en: string } }[];

/**
 * 학부 소개 문구 + 비전과 목표 + 학과 현황 + 연혁 헤더를 에디토리얼 타이포그래피로 묶은
 * 서버 컴포넌트. 카드·박스·그림자 없이 여백·헤어라인·번호 매김으로만 위계를 만든다
 * (Anthropic/Claude 무드).
 *
 * 네 블록 모두 같은 헤더 문법을 쓴다 — 상단 헤어라인 → eyebrow → Paperlogy 소제목 →
 * 콘텐츠. 여백 스케일은 모바일 48/32/22/10/28 → md 72/44/28/12/40 한 벌뿐이다.
 * '학과 소개' 탭 안에서 HistoryTimeline 위에 놓여 소개→비전→현황→연혁의 흐름을 만든다.
 */
export async function AboutIntro({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'about' });

  return (
    // 탭 진입 랜딩 — 제목 리빌 → 형광 밑줄이 그어짐 → 본문 → 비전 3열 → 현황 헤더 →
    // 숫자 카운트업 → 연혁 헤더. (아래쪽 그룹은 대개 화면 밖이라 훅이 자동으로
    // ScrollTrigger 로 넘긴다)
    <LandingScope name="about-intro">
    {/* 하단 마진 = 연혁 소제목과 HistoryTimeline 사이의 "소제목→콘텐츠" 간격 */}
    <div className="mb-7 md:mb-10">
      {/* 블록 1 · 소개 — 탭의 첫 블록이라 상단 룰이 없다 */}
      <div>
        <p data-land="rise" data-land-order="0" className={EYEBROW_CLASS}>
          ABOUT
        </p>
        {/* text-pretty: 수동 줄바꿈 마커(brd/brm)를 쓰는 요소라 전역 h1~h4 의
            text-wrap: balance 를 로컬 해제한다(수동 br + balance 는 결과가 갈린다). */}
        <h3
          data-land="rise"
          data-land-order="1"
          style={SUBHEAD_FONT}
          className="mt-2.5 max-w-3xl text-pretty text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.12] tracking-tight text-content md:mt-3"
        >
          {/* <u> 태그(ko 메시지의 "기계공학부")를 멀티라인 형광 밑줄 span 으로 렌더 —
              CodePen 원본 그대로 시범(사용자 지시). en 메시지는 태그 없음(그대로 통과). */}
          {t.rich('intro.title', richBreaks({
            u: (chunks) => (
              <span data-land="underline" data-land-order="2" className="underline-magical">
                {chunks}
              </span>
            ),
          }))}
        </h3>
        <p
          data-land="rise"
          data-land-order="3"
          className="mt-[18px] max-w-prose text-[15px] leading-[1.75] text-content-soft md:mt-6 md:text-lg md:leading-[1.7]"
        >
          {/* 본문은 마커 없이 guard + measure 로 해결 — · 복합어 6개는 guard 가 통째로
              지키고, 38em 상한이 줄을 다듬는다. t.rich 로 바꾸면 문자열이 조각나
              guard 를 못 태우므로 plain t 를 유지한다. */}
          {guardKoreanBreaks(t('intro.body'))}
        </p>
      </div>

      {/* 블록 2 · 비전과 목표 — 카드 없이 번호 + 헤어라인 룰로 구성한 에디토리얼 리스트 */}
      <div className={`mt-12 md:mt-[72px] ${BLOCK_RULE}`}>
        <p data-land="rise" data-land-order="4" className={EYEBROW_CLASS}>
          OUR VISION
        </p>
        <h4 data-land="rise" data-land-order="4" style={SUBHEAD_FONT} className={SUBHEAD_CLASS}>
          {t('vision.title')}
        </h4>
        <ol className="mt-7 grid gap-7 md:mt-10 md:grid-cols-3 md:gap-10">
          {visionKeys.map((key, i) => (
            <li
              key={key}
              data-land="rise"
              data-land-order="5"
              className="border-t border-surface-border pt-4 md:pt-5"
            >
              <span className="block text-[30px] font-light leading-none tabular-nums text-yonsei-blue/40 md:text-4xl">
                {String(i + 1).padStart(2, '0')}
              </span>
              {/* 항목 제목은 블록 소제목(30px)보다 확실히 작게 — 위계가 뒤집히지 않도록 18px */}
              <h5 className="mt-3 text-[17px] font-bold leading-snug text-content md:mt-4 md:text-lg">
                {t(`vision.items.${key}.title`)}
              </h5>
              <p className="mt-1.5 text-sm leading-[1.7] text-content-soft md:mt-2">
                {guardKoreanBreaks(t(`vision.items.${key}.body`))}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* 블록 3 · 학과 현황 — 수치·라벨은 content/about-stats.json 에서 편집.
          다른 탭의 stat 아이템과 같은 톤: 항목별 상단 헤어라인 + 검정 Paperlogy 수치 +
          파란 라벨. dl 자체에는 테두리를 두지 않는다 — 위 구분선은 이 블록의 border-t 가,
          아래 구분선은 다음 연혁 블록의 border-t 가 맡는다(선이 겹치면 두 줄로 보인다). */}
      <div className={`mt-8 md:mt-11 ${BLOCK_RULE}`}>
        <p data-land="rise" data-land-order="6" className={EYEBROW_CLASS}>
          BY THE NUMBERS
        </p>
        <h4 data-land="rise" data-land-order="6" style={SUBHEAD_FONT} className={SUBHEAD_CLASS}>
          {t('stats.title')}
        </h4>
        <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-8 text-center md:mt-10 md:grid-cols-4 md:gap-10">
          {aboutStats.map((stat) => (
            // pt = 아래 여백과 같은 값(모바일 32 = gap-y-8/블록 간격, md 44 = 다음 블록 mt-11).
            // 수치+라벨이 위 헤어라인과 아래 헤어라인 정중앙에 오도록 맞춘 값이라 임의로
            // 줄이면 다시 위로 붙어 보인다.
            <div key={stat.label.en} className="border-t border-surface-border pt-8 md:pt-11">
              {/* leading-none: 숫자 라인박스의 여분 공간을 제거해 라벨과의 간격을 고르게.
                  ⚠️ 카운트업(data-land="count")이 textContent 를 파싱하므로 순수 숫자만 둔다 */}
              <dd
                data-land="count"
                data-land-order="7"
                style={SUBHEAD_FONT}
                className="text-[30px] font-bold leading-none tabular-nums text-content md:text-4xl"
              >
                {stat.value}
              </dd>
              <dt
                data-land="rise"
                data-land-order="7"
                className="mt-2.5 text-[15px] font-bold text-yonsei-blue md:mt-4 md:text-lg"
              >
                {pick(stat.label, locale as Locale)}
              </dt>
            </div>
          ))}
        </dl>
      </div>

      {/* 블록 4 · 연혁 헤더 — 타임라인 본체(HistoryTimeline)는 이 컴포넌트 바깥 형제로
          이어진다. 헤더를 여기 두는 이유는 LandingScope 안이어야 data-land 가 먹기 때문. */}
      <div className={`mt-8 md:mt-11 ${BLOCK_RULE}`}>
        <p data-land="rise" data-land-order="8" className={EYEBROW_CLASS}>
          HISTORY
        </p>
        <h4 data-land="rise" data-land-order="8" style={SUBHEAD_FONT} className={SUBHEAD_CLASS}>
          {t('history.title')}
        </h4>
      </div>
    </div>
    </LandingScope>
  );
}

/**
 * 수동 줄바꿈 마커 핸들러 — messages 문자열의 <nb>/<brd>/<brm> 태그를 렌더로 바꾼다.
 *   <nb>…</nb>     항상 한 덩어리(기기 무관)
 *   <brd></brd>    md(768px) 이상 전용 줄바꿈
 *   <brm></brm>    md 미만 전용 줄바꿈
 * next-intl 은 self-closing 태그를 지원하지 않아 빈 쌍태그로 쓴다. 케이스를 2개(md
 * 경계)로 제한한 이유: 중간 구간은 measure(max-w-prose)가 흡수하고, 케이스가 늘수록
 * 문구를 고칠 때마다 손봐야 할 지점이 함께 는다. 현재 사용처는 학과 소개 간판 문단
 * 뿐 — 다른 문단으로 확산하게 되면 이 헬퍼를 lib 로 승격한다.
 */
function richBreaks(extra: Record<string, (chunks: ReactNode) => ReactNode> = {}) {
  return {
    nb: (chunks: ReactNode) => <span className="whitespace-nowrap">{chunks}</span>,
    brd: () => <br className="hidden md:inline" />,
    brm: () => <br className="md:hidden" />,
    ...extra,
  };
}
