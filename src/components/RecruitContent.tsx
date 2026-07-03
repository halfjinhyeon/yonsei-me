import type { Locale } from '@/i18n/routing';

/** 원문(_import/교수초빙안내.html)의 모집 분야 키워드를 편집형 리스트로 재구성 */
const FIELDS = [
  { title: 'Mechanics & Materials', sub: 'Solid mechanics · Advanced materials · Multiscale modeling' },
  { title: 'Thermal & Fluid Systems', sub: 'Heat transfer · Fluid dynamics · Energy systems' },
  { title: 'Dynamic Systems & Control', sub: 'Robotics · Autonomous systems · Intelligent control' },
  { title: 'Manufacturing & Design', sub: 'Precision manufacturing · Design engineering · Digital fabrication' },
  { title: 'Emerging Areas', sub: 'Bio · Medical · Nano · Micro · Optical technology' },
] as const;

const QUALIFICATIONS = [
  {
    title: 'A Ph.D. in Mechanical Engineering',
    body: 'or a closely related field, with the depth to anchor a discipline and the curiosity to cross its boundaries.',
  },
  {
    title: 'Excellence in research and teaching',
    body: 'a proven track record — and a genuine passion for mentoring the next generation of engineers.',
  },
  {
    title: 'Interdisciplinary perspective',
    body: 'diverse viewpoints and collaborative approaches to complex engineering challenges.',
  },
] as const;

const APPLY_URL = 'https://sites.google.com/yonsei.ac.kr/me-faculty-application?usp=sharing';
const CONTACT_EMAIL = 'mech@yonsei.ac.kr';

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.22em] text-yonsei-blue">{children}</p>
  );
}

/**
 * 교수 초빙 안내 탭 — 줄글 마크다운 대신 스테이트먼트 헤드라인 + 번호 매긴
 * 모집 분야 리스트 + 자격 요건으로 재구성한 편집(Cornell)형 타이포 레이아웃.
 */
export function RecruitInfo({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';

  return (
    <div className="space-y-20">
      {/* 오프닝 스테이트먼트 */}
      <section className="anim-nav-item">
        <Eyebrow>Faculty Positions</Eyebrow>
        <h3 className="mt-5 max-w-3xl text-3xl font-bold leading-[1.15] tracking-tight text-content sm:text-4xl lg:text-[2.75rem]">
          We are hiring tenure-track faculty{' '}
          <span className="text-yonsei-navy">across the full spectrum</span> of mechanical
          engineering.
        </h3>
        <p className="mt-8 max-w-2xl text-base leading-[1.8] text-content-soft">
          The School of Mechanical Engineering at Yonsei University is planning to hire numerous
          tenure-track faculty members over the coming years — a commitment to academic excellence
          and to strengthening research and education across every sub-discipline of the field.
        </p>
        <p className="mt-5 max-w-2xl text-base leading-[1.8] text-content-soft">
          We are seeking innovative thinkers and leaders eager to contribute to a dynamic,
          collaborative environment. Regardless of your specialization, if you possess a passion
          for teaching and a record of research excellence, we encourage you to express your
          interest.
        </p>
      </section>

      {/* 모집 분야 — 번호 매긴 편집형 리스트 */}
      <section>
        <Eyebrow>Research Areas</Eyebrow>
        <ul className="mt-6 border-t-2 border-content">
          {FIELDS.map((f, i) => (
            <li
              key={f.title}
              className="anim-nav-item border-b border-surface-border"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex flex-col gap-1 py-6 sm:flex-row sm:items-baseline sm:gap-10">
                <span className="shrink-0 text-sm font-bold tabular-nums text-yonsei-blue">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h4 className="text-xl font-bold tracking-tight text-content sm:text-2xl">
                    {f.title}
                  </h4>
                  <p className="mt-1 text-sm text-content-faint">{f.sub}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-content-faint">
          Keywords of major interest — but not limited to.
        </p>
      </section>

      {/* 자격 요건 */}
      <section>
        <Eyebrow>Who We Seek</Eyebrow>
        <div className="mt-6 grid gap-10 sm:grid-cols-3">
          {QUALIFICATIONS.map((q, i) => (
            <div
              key={q.title}
              className="anim-nav-item"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <h4 className="text-lg font-bold leading-snug tracking-tight text-content">
                {q.title}
              </h4>
              <p className="mt-3 text-sm leading-[1.8] text-content-soft">{q.body}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

/** 지원서 작성 탭 — 외부(Google Sites) 지원 페이지로 이동하는 CTA */
export function RecruitApply({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';

  return (
    <div className="anim-nav-item">
      <Eyebrow>Application</Eyebrow>
      <h3 className="mt-5 max-w-3xl text-3xl font-bold leading-[1.15] tracking-tight text-content sm:text-4xl lg:text-[2.75rem]">
        {ko ? (
          <>
            연세 기계공학의 미래를 <span className="text-yonsei-navy">함께 만들 준비</span>가
            되셨나요?
          </>
        ) : (
          <>
            Ready to <span className="text-yonsei-navy">shape the future</span> of mechanical
            engineering at Yonsei?
          </>
        )}
      </h3>
      <p className="mt-8 max-w-2xl text-base leading-[1.8] text-content-soft">
        {ko
          ? '지원서 작성은 아래 외부 페이지(Google Sites)에서 진행합니다.'
          : 'Applications are submitted through the external page (Google Sites) below.'}
      </p>
      <a
        href={APPLY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group mt-10 inline-flex items-center gap-3 bg-yonsei-navy px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-yonsei-blue"
      >
        {ko ? '지원서 작성 페이지 바로가기' : 'Go to the application page'}
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
    </div>
  );
}
