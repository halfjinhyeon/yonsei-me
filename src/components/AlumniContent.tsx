import type { Locale } from '@/i18n/routing';

/** 큰 타이포 헤딩 — prose-content 헤딩과 동일한 굵기 */
function GreetingHeading({ children }: { children: string }) {
  return (
    <h3 className="text-4xl font-bold leading-tight tracking-tight text-content sm:text-5xl">
      {children}
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
        <GreetingHeading>{ko ? '동문 인사말' : 'A greeting'}</GreetingHeading>
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
