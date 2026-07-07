import editorialTabs from '@content/editorial-tabs.json';
import { pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

/** 한/영 문자열 쌍 */
export type Localized = { ko: string; en: string };

export interface EditorialItem {
  title: Localized;
  body: Localized;
  /** 있으면 번호 대신 큰 지표(stat)로 강조 */
  stat?: Localized;
}

export interface EditorialStep {
  title: Localized;
  body?: Localized;
  /** 단계 수행 주체 (예: 업체 / 교육연구단 / 담당교수) */
  actor?: Localized;
}

export interface EditorialCta {
  label: Localized;
  href: string;
}

export interface EditorialTabData {
  eyebrow: string;
  /** TabbedContent가 탭 라벨 h2를 이미 렌더하므로, 라벨과 다른 제목이 필요할 때만 지정 */
  title?: Localized;
  slogan?: Localized;
  lead?: Localized;
  body?: Localized[];
  image?: string;
  items?: EditorialItem[];
  steps?: EditorialStep[];
  /** steps 아래에 크게 강조하는 최종 결과 문구 (예: 사회난제 해결) */
  outcome?: Localized;
  cta?: EditorialCta;
}

const tabs = editorialTabs as unknown as Record<string, EditorialTabData>;

/** editorial-tabs.json 에서 탭 데이터 접근 */
export function getEditorialTab(key: string): EditorialTabData {
  return tabs[key];
}

/** 문단 속 이메일 주소를 mailto 링크로 감싸 렌더 (그 외 텍스트는 그대로) */
function renderWithEmailLinks(text: string) {
  const emailRe = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
  return text.split(emailRe).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={`mailto:${part}`}
        className="font-semibold text-yonsei-blue underline decoration-yonsei-gold underline-offset-4 hover:text-yonsei-navy"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/** CTA 앵커 — 외부 링크와 mailto 를 구분해 렌더 */
function CtaLink({ cta, locale }: { cta: EditorialCta; locale: Locale }) {
  const isMailto = cta.href.startsWith('mailto:');
  const external = isMailto
    ? {}
    : { target: '_blank', rel: 'noopener noreferrer' };

  return (
    <a
      href={cta.href}
      {...external}
      className="group mt-10 inline-flex items-center gap-3 bg-yonsei-navy px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-yonsei-blue"
    >
      {pick(cta.label, locale)}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
      >
        <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/**
 * 텍스트 중심 탭을 위한 에디토리얼 타이포/인포그래픽 서버 컴포넌트.
 * 카드·박스·그림자 없이 여백·헤어라인·번호(또는 지표)로만 위계를 만든다 (AboutIntro 계승).
 * 데이터는 content/editorial-tabs.json 에서 이중언어로 공급되며 pick(field, locale)로 해석한다.
 */
export function EditorialTab({ data, locale }: { data: EditorialTabData; locale: Locale }) {
  const hasStat = data.items?.some((it) => it.stat);
  const itemCount = data.items?.length ?? 0;
  const itemGridCols = hasStat
    ? 'md:grid-cols-2'
    : itemCount >= 5
      ? 'md:grid-cols-2 lg:grid-cols-3'
      : itemCount === 3
        ? 'md:grid-cols-3'
        : 'md:grid-cols-2';

  const firstBodyMargin = data.lead ? 'mt-5' : 'mt-6';

  return (
    <div>
      {/* eyebrow (+ 탭 라벨과 다른 제목이 있을 때만 큰 디스플레이 제목) */}
      <p className="eyebrow">{data.eyebrow}</p>
      {data.title && (
        <h3 className="mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.1] tracking-tight text-content">
          {pick(data.title, locale)}
        </h3>
      )}

      {/* slogan — 인용구형 디스플레이 */}
      {data.slogan && (
        <p className="mt-6 max-w-3xl font-display text-2xl font-medium leading-snug text-content sm:text-[1.75rem]">
          <span className="text-yonsei-gold">&ldquo;</span>
          {pick(data.slogan, locale)}
          <span className="text-yonsei-gold">&rdquo;</span>
        </p>
      )}

      {/* lead 문단 */}
      {data.lead && (
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-content-soft">
          {renderWithEmailLinks(pick(data.lead, locale))}
        </p>
      )}

      {/* 추가 본문 문단 */}
      {data.body?.map((para, i) => (
        <p
          key={i}
          className={`${i === 0 ? firstBodyMargin : 'mt-5'} max-w-prose text-lg leading-relaxed text-content-soft`}
        >
          {renderWithEmailLinks(pick(para, locale))}
        </p>
      ))}

      {/* image */}
      {data.image && (
        <figure className="mt-10 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.image} alt="" className="w-full" />
        </figure>
      )}

      {/* items — stat 인포그래픽 또는 번호 리스트 (구분선은 항목별 룰 하나만) */}
      {data.items && data.items.length > 0 && (
        <div className="mt-14">
          <ol className={`grid gap-10 ${itemGridCols}`}>
            {data.items.map((item, i) => (
              <li key={i} className="border-t border-surface-border pt-5">
                {item.stat ? (
                  <span className="block text-4xl font-light text-yonsei-blue">
                    {pick(item.stat, locale)}
                  </span>
                ) : (
                  <span className="block text-4xl font-light tabular-nums text-yonsei-blue/40">
                    {String(i + 1).padStart(2, '0')}
                    <span className="text-yonsei-gold">.</span>
                  </span>
                )}
                <h4 className="mt-4 text-lg font-bold text-content">
                  {pick(item.title, locale)}
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-content-soft">
                  {pick(item.body, locale)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* steps — 01 → 02 → … 절차 (구분선은 항목별 룰 하나만) */}
      {data.steps && data.steps.length > 0 && (
        <div className="mt-14">
          <ol
            className={`grid gap-8 ${
              data.steps.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'
            }`}
          >
            {data.steps.map((step, i) => (
              <li key={i} className="border-t border-surface-border pt-5">
                <span className="block text-4xl font-light tabular-nums text-yonsei-blue/40">
                  {String(i + 1).padStart(2, '0')}
                  <span className="text-yonsei-gold">.</span>
                </span>
                <h4 className="mt-4 text-lg font-bold text-content">
                  {pick(step.title, locale)}
                </h4>
                {step.actor && (
                  <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-yonsei-blue">
                    {pick(step.actor, locale)}
                  </p>
                )}
                {step.body && (
                  <p className="mt-2 text-sm leading-relaxed text-content-soft">
                    {pick(step.body, locale)}
                  </p>
                )}
              </li>
            ))}
          </ol>

          {/* 최종 결과 강조 — 절차의 귀결을 큰 타이포로 (원본 인포그래픽의 아래 화살표 흐름) */}
          {data.outcome && (
            <div className="mt-12 text-center">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mx-auto h-6 w-6 text-yonsei-gold"
              >
                <path d="M12 4v15M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-4 text-2xl font-bold tracking-tight text-content sm:text-3xl">
                {pick(data.outcome, locale)}
                <span className="text-yonsei-gold">.</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* cta */}
      {data.cta && <CtaLink cta={data.cta} locale={locale} />}
    </div>
  );
}
