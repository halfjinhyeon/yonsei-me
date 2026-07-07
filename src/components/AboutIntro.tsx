import { getTranslations } from 'next-intl/server';

const visionKeys = ['0', '1', '2'] as const;

/**
 * 학부 소개 문구 + 비전과 목표를 에디토리얼 타이포그래피로 묶은 서버 컴포넌트.
 * 카드·박스·그림자 없이 여백·헤어라인·번호 매김으로만 위계를 만든다 (Anthropic/Claude 무드).
 * 연혁 탭 안에서 HistoryTimeline 위에 놓여 소개→비전→연혁의 흐름을 만든다.
 */
export async function AboutIntro({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'about' });

  return (
    <div className="mb-16">
      {/* 소개 문구 — 큰 디스플레이 제목 + 왼쪽 정렬 본문 */}
      <div>
        <p className="eyebrow">ABOUT</p>
        <h3 className="mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.1] tracking-tight text-content">
          {t('intro.title')}
        </h3>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-content-soft">
          {t('intro.body')}
        </p>
      </div>

      {/* 비전과 목표 — 카드 없이 번호 + 헤어라인 룰로 구성한 에디토리얼 리스트 */}
      <div className="mt-16 border-t border-surface-border pt-8">
        <p className="eyebrow">OUR VISION</p>
        <h4 className="mt-3 text-2xl font-bold tracking-tight text-content">
          {t('vision.title')}
        </h4>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {visionKeys.map((key, i) => (
            <li key={key} className="border-t border-surface-border pt-5">
              <span className="block text-4xl font-light tabular-nums text-yonsei-blue/40">
                {String(i + 1).padStart(2, '0')}
                <span className="text-yonsei-gold">.</span>
              </span>
              <h5 className="mt-4 text-lg font-bold text-content">
                {t(`vision.items.${key}.title`)}
              </h5>
              <p className="mt-2 text-sm leading-relaxed text-content-soft">
                {t(`vision.items.${key}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
