import { Link } from '@/i18n/navigation';
import { BoardList, type BoardRow } from '@/components/BoardList';
import type { Locale } from '@/i18n/routing';

/** 헤딩의 리드 단어 — prose-content 헤딩과 동일한 세리프 대비 */
function LeadHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h3 className="text-4xl font-bold leading-tight tracking-tight text-content sm:text-5xl">
      <span className="mr-[0.08em] font-normal [font-family:var(--font-serif)]">{lead}</span>
      {rest}
    </h3>
  );
}

/**
 * 동문 인사말 — 좌측 동문회장 사진(플레이스홀더), 우측 큰 타이포 헤딩 + 본문.
 * (Cornell 편집형 레이아웃)
 */
export function AlumniGreeting({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';

  const paragraphs = ko
    ? [
        '연세대학교 기계공학부 동문 여러분, 안녕하십니까. 신촌 언덕의 공학관에서 함께 밤을 지새우던 시간은 달랐어도, 우리는 모두 같은 강의실과 실험실의 기억을 공유하는 한 가족입니다.',
        '1950년대의 작은 학과에서 출발한 우리 기계공학부는 이제 산업과 학계, 연구소와 창업 현장 곳곳에서 세상을 움직이는 수천 명의 동문을 배출한 커뮤니티로 성장했습니다. 선배들이 쌓아온 신뢰가 후배들의 길을 열고, 후배들의 도전이 다시 동문 전체의 자부심이 되는 선순환 — 그것이 우리 동문회가 존재하는 이유입니다.',
        '동문회는 정기총회와 홈커밍데이, 산업별 네트워킹, 재학생 멘토링과 장학 사업을 통해 세대를 잇는 다리를 놓고 있습니다. 어디에 계시든 다시 연결되어 주십시오. 여러분의 경험과 이야기가 연세 기계공학의 가장 큰 자산입니다.',
      ]
    : [
        'Dear alumni of the School of Mechanical Engineering, greetings. Though we studied in different eras, we all share the same memories of the lecture halls and laboratories on the Sinchon campus.',
        'From a small department in the 1950s, our school has grown into a community of thousands of alumni moving the world across industry, academia, research institutes, and startups. The trust built by those who came before opens doors for those who follow — and their achievements become the pride of us all. That cycle is why our association exists.',
        'Through general assemblies, homecoming day, industry networking, student mentoring, and scholarship programs, the association bridges generations. Wherever you are, please stay connected. Your experience and stories are the greatest asset of Yonsei Mechanical Engineering.',
      ];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
      {/* 동문회장 사진 (실제 사진 확보 전까지 플레이스홀더) */}
      <figure className="anim-nav-item">
        <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-yonsei-navy to-yonsei-blue">
          <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="text-7xl font-bold text-white/20">朴</span>
          </div>
        </div>
        <figcaption className="mt-4">
          <p className="font-bold text-content">
            {ko ? '박정호' : 'Jungho Park'}
            <span className="ml-2 text-sm font-medium text-content-faint">
              {ko ? '기계공학과 82학번' : "Class of '82"}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-content-soft">
            {ko ? '연세대학교 기계공학부 동문회장' : 'President, Yonsei ME Alumni Association'}
          </p>
        </figcaption>
      </figure>

      {/* 큰 타이포 헤딩 + 본문 */}
      <div className="anim-nav-item" style={{ animationDelay: '90ms' }}>
        {ko ? <LeadHeading lead="동문" rest=" 인사말" /> : <LeadHeading lead="a" rest=" greeting" />}
        <div className="mt-8 space-y-5">
          {paragraphs.map((p, i) => (
            <p key={i} className="max-w-2xl text-base leading-[1.8] text-content-soft">
              {p}
            </p>
          ))}
        </div>
        <p className="mt-8 font-bold text-content">
          {ko
            ? '연세대학교 기계공학부 동문회장 박정호'
            : 'Jungho Park, President of the Alumni Association'}
        </p>
      </div>
    </div>
  );
}

const ORGANIZATION = [
  {
    ko: { title: '회장단', desc: '회장 1인, 수석부회장 1인, 부회장 4인, 감사 2인 — 임기 2년' },
    en: { title: 'Executive Board', desc: 'President, senior VP, four VPs, and two auditors — two-year terms' },
  },
  {
    ko: { title: '사무국', desc: '총무·재정·홍보 분과 운영, 학부 사무실과 연락 체계 상시 유지' },
    en: { title: 'Secretariat', desc: 'General affairs, finance, and communications; standing liaison with the department office' },
  },
  {
    ko: { title: '기별 대표', desc: '입학 기수별 대표 1인 — 기수 모임과 동문 명부 관리' },
    en: { title: 'Class Representatives', desc: 'One representative per entering class — class reunions and the alumni directory' },
  },
  {
    ko: { title: '산업·지역 분과', desc: '모빌리티·에너지·바이오 등 산업별 소모임과 해외 지역 지부' },
    en: { title: 'Industry & Regional Chapters', desc: 'Interest groups by industry (mobility, energy, bio) and overseas chapters' },
  },
] as const;

/** 동문회 조직 — 번호 매긴 편집형 리스트 */
export function AlumniOrganization({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  return (
    <div>
      <p className="max-w-2xl text-base leading-[1.8] text-content-soft">
        {ko
          ? '동문회는 회장단과 사무국을 중심으로, 기수·산업·지역 단위의 자율적인 모임이 유기적으로 연결된 구조로 운영됩니다.'
          : 'The association is organized around an executive board and secretariat, connected organically with autonomous class, industry, and regional groups.'}
      </p>
      <ul className="mt-8 border-t-2 border-content">
        {ORGANIZATION.map((o, i) => {
          const item = ko ? o.ko : o.en;
          return (
            <li
              key={item.title}
              className="anim-nav-item border-b border-surface-border"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex flex-col gap-1 py-6 sm:flex-row sm:items-baseline sm:gap-10">
                <span className="shrink-0 text-sm font-bold tabular-nums text-yonsei-blue">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h4 className="text-xl font-bold tracking-tight text-content sm:text-2xl">
                    {item.title}
                  </h4>
                  <p className="mt-1 text-sm text-content-soft">{item.desc}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const NOTABLE = [
  {
    year: '2026',
    ko: { name: '최예원 (26학번)', role: '고려대학교 자유전공학부 쩌리', desc: '상온초전도체 개발에 성공함.' },
    en: { name: "Seungwoo Lee ('91)", role: 'CEO, hydrogen mobility company', desc: 'Alumni of the Year for bringing hydrogen fuel-cell commercial vehicles to the global market.' },
  },
  {
    year: '2025',
    ko: { name: '김하늘 (03학번)', role: '항공우주 연구원 책임연구원', desc: '차세대 발사체 터보펌프 국산화 개발을 주도해 과학기술훈장 수훈.' },
    en: { name: "Haneul Kim ('03)", role: 'Principal researcher, aerospace institute', desc: 'Led the domestic development of next-generation launch-vehicle turbopumps; national Order of Science Merit.' },
  },
  {
    year: '2025',
    ko: { name: '정민서 (98학번)', role: '의료로봇 스타트업 창업자', desc: '수술보조 로봇으로 글로벌 인증을 획득, 국내 의료로봇 수출의 문을 열다.' },
    en: { name: "Minseo Jung ('98)", role: 'Founder, medical robotics startup', desc: 'Earned global certification for a surgical-assist robot, opening Korean medical-robot exports.' },
  },
  {
    year: '2024',
    ko: { name: '최다인 (87학번)', role: '대학 총장·기계공학 석좌교수', desc: '열유체 분야 연구와 공학교육 혁신 공로로 자랑스러운 연세인상 수상.' },
    en: { name: "Dain Choi ('87)", role: 'University president & chaired professor', desc: 'Honored as a Proud Yonseian for thermofluids research and engineering-education innovation.' },
  },
] as const;

/** 자랑스러운 동문 — 연도 배지 + 편집형 행 */
export function AlumniNotable({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  return (
    <div>
      <p className="max-w-2xl text-base leading-[1.8] text-content-soft">
        {ko
          ? '산업과 학계, 연구 현장에서 연세 기계공학의 이름을 빛낸 동문들을 소개합니다.'
          : 'Alumni who carry the name of Yonsei Mechanical Engineering across industry, academia, and research.'}
      </p>
      <ul className="mt-8 border-t-2 border-content">
        {NOTABLE.map((n, i) => {
          const item = ko ? n.ko : n.en;
          return (
            <li
              key={item.name}
              className="anim-nav-item border-b border-surface-border"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:gap-10">
                <span className="shrink-0 text-sm font-bold tabular-nums text-yonsei-blue">
                  {n.year}
                </span>
                <div>
                  <h4 className="text-xl font-bold tracking-tight text-content sm:text-2xl">
                    {item.name}
                  </h4>
                  <p className="mt-0.5 text-sm font-semibold text-yonsei-navy">{item.role}</p>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-content-soft">
                    {item.desc}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 동문 소식·네트워크 — 모임/행사 목록 + 연락처 업데이트 안내 */
export function AlumniNetwork({ locale, emptyLabel }: { locale: Locale; emptyLabel: string }) {
  const ko = locale === 'ko';

  const rows: BoardRow[] = [
    {
      id: 'al-1',
      date: '2026-09-19',
      title: ko
        ? '2026 동문회 정기총회 & 홈커밍데이 (졸업 20·30주년 기수 초청)'
        : '2026 General Assembly & Homecoming Day (20th/30th reunion classes)',
      tag: ko ? '행사' : 'Event',
    },
    {
      id: 'al-2',
      date: '2026-08-28',
      title: ko
        ? '모빌리티 산업 동문 네트워킹 나이트 (판교)'
        : 'Mobility Industry Alumni Networking Night (Pangyo)',
      tag: ko ? '모임' : 'Meetup',
    },
    {
      id: 'al-3',
      date: '2026-07-11',
      title: ko
        ? '동문 멘토링 데이 — 재학생 진로 상담 멘토 참여 안내'
        : 'Alumni Mentoring Day — call for mentors for student career counseling',
      tag: ko ? '멘토링' : 'Mentoring',
      href: '/news/post/cr-3',
    },
    {
      id: 'al-4',
      date: '2026-06-30',
      title: ko
        ? '동문 장학기금 2026 상반기 결산 및 장학생 선발 결과 안내'
        : 'Alumni Scholarship Fund: H1 2026 report and scholarship recipients',
      tag: ko ? '장학' : 'Scholarship',
    },
  ];

  return (
    <div>
      <BoardList items={rows} locale={locale} emptyLabel={emptyLabel} />

      {/* 연락처 업데이트 CTA */}
      <div className="mt-12 border-t-2 border-content pt-8">
        <p className="max-w-2xl text-xl font-bold leading-snug tracking-tight text-content sm:text-2xl">
          {ko ? '연락처가 바뀌셨나요?' : 'Have your details changed?'}
        </p>
        <p className="mt-3 max-w-2xl text-base leading-[1.8] text-content-soft">
          {ko
            ? '동문 명부와 소식지는 등록된 연락처로 전달됩니다. 이메일·소속이 바뀌었다면 학부 사무실로 알려주세요. 재학생 멘토링에 참여하고 싶은 동문도 언제든 환영합니다.'
            : 'The alumni directory and newsletter rely on your registered contact details. If your email or affiliation has changed, let the department office know — and mentors for current students are always welcome.'}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
          <a
            href="mailto:mech@yonsei.ac.kr"
            className="border-b-2 border-yonsei-navy pb-1 text-lg font-bold tracking-tight text-yonsei-navy transition-opacity hover:opacity-70"
          >
            mech@yonsei.ac.kr
          </a>
          <Link
            href="/news#career"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-yonsei-blue hover:underline"
          >
            {ko ? '멘토링·취업 소식 보기' : 'Mentoring & career news'}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
