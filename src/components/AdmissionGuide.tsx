import guide from '@content/admission-guide.json';
import { pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

/** content/admission-guide.json 의 형태 */
interface GuideSection {
  num: string;
  /** 좌측 그래픽 — 'logo'(연세 엠블럼 logo.svg) | 'eagle'(독수리 실루엣 eagle.png 마스크) */
  graphic: 'logo' | 'eagle';
  title: { ko: string; en: string };
  body: { ko: string; en: string };
  notes: { ko: string; en: string }[];
  buttons: { label: { ko: string; en: string }; href: string }[];
}

const sections = (guide as { sections: GuideSection[] }).sections;

/**
 * 입학 안내 탭 — 홍익대 조형대학 '입학안내' 레퍼런스를 연세 톤으로 옮긴 구성.
 * 섹션마다: 번호 + 네이비 룰(전폭) → 2단(좌: 대형 제목 + 그래픽 / 우: 본문 + 회색
 * 보조 문단 + 각진 아웃라인 버튼들). 그래픽은 레퍼런스의 도형 대신 학부 정체성:
 * 학부 = 연세 엠블럼(logo.svg), 대학원 = 독수리 실루엣(eagle-mask, 네이비 틴트).
 * 문안·버튼은 content/admission-guide.json 에서 공급(콘텐츠/코드 분리) —
 * 버튼 href 는 추후 실제 입학처 링크로 교체 예정(현재 '#' 플레이스홀더).
 */
export function AdmissionGuide({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-24">
      {sections.map((sec) => (
        <section key={sec.num} aria-label={pick(sec.title, locale)}>
          {/* 번호 + 전폭 네이비 룰 (레퍼런스의 1/2 헤어라인) */}
          <div className="border-b-2 border-yonsei-navy pb-2 text-sm font-bold text-content">
            {sec.num}
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
            {/* 좌: 대형 제목 + 그래픽 */}
            <div>
              <h3 className="text-3xl font-black tracking-tight text-content sm:text-4xl">
                {pick(sec.title, locale)}
              </h3>
              <div className="mt-10">
                {sec.graphic === 'logo' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/logo.svg" alt="" aria-hidden="true" className="h-24 w-auto sm:h-28" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="eagle-mask block h-24 w-28 bg-yonsei-navy sm:h-28 sm:w-32"
                  />
                )}
              </div>
            </div>

            {/* 우: 본문 + 보조 문단 + 버튼 */}
            <div>
              <p className="text-base leading-[1.9] text-content sm:text-lg">
                {pick(sec.body, locale)}
              </p>
              <div className="mt-8 space-y-3">
                {sec.notes.map((note, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-content-faint">
                    {pick(note, locale)}
                  </p>
                ))}
              </div>

              {/* 바로가기 버튼들 — 각진 아웃라인 + ↗ (레퍼런스 버튼 문법) */}
              <div className="mt-10 flex flex-wrap gap-4">
                {sec.buttons.map((btn, i) => (
                  <a
                    key={i}
                    href={btn.href}
                    {...(btn.href.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className="group inline-flex items-center gap-3 border border-content/70 px-7 py-4 text-sm font-bold text-content transition-colors hover:border-yonsei-navy hover:bg-yonsei-navy hover:text-white"
                  >
                    {pick(btn.label, locale)}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    >
                      <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
