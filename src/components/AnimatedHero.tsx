'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { Link } from '@/i18n/navigation';
import { MeshCanvas } from './MeshCanvas';

// SplitText 는 이제 무료 — public gsap 패키지에 포함(Club 멤버십/토큰 불필요).
gsap.registerPlugin(SplitText);

// SSR 안전 layout effect — 클라이언트에선 페인트 전에 from-state 를 잡아 깜빡임을
// 막고, 서버 렌더 시 useLayoutEffect 경고를 피한다.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 풀뷰포트 히어로 — (구)히어로 배너와 (구)컬러 스테이트먼트를 한 화면에 통합.
 *
 * 같은 자리(CSS grid 단일 셀)에 두 문구를 겹쳐 두고 시간에 따라 교대한다:
 *  - 문구 A: "SCHOOL OF / MECHANICAL ENGINEERING" (브랜드 고정 영문 캡스 2행)
 *  - 문구 B: "세상을 움직이는 공학, 미래를 설계하는 사람들" (골드 밑줄 강조)
 * 각 문구는 기존 SplitText 마스크 리빌(글자가 마스크 뒤에서 솟아오름)을 그대로 쓰되,
 * 하나의 repeat:-1 타임라인으로 A등장→유지→퇴장→B등장→…를 무한 반복한다.
 * (반복 안정성을 위해 from() 대신 set()/to() 로 매 사이클 초기 상태를 명시.)
 * 독수리 마스코트는 우측에서 느린 부유 루프, '기계공학부란?' 링크는 1회 페이드업.
 *
 * 접근성:
 *  - 로테이션 시각부(grid)는 통째로 aria-hidden. h1 은 고정 aria-label(문구 A)로
 *    제목을 노출하고, 문구 B 원문은 sr-only <p> 로 병기한다.
 * reduced-motion / no-JS:
 *  - 로테이션·부유·페이드 없이 문구 A 만 정적 표시(B 는 숨김, sr-only 로만 읽힘).
 */
export function AnimatedHero() {
  const t = useTranslations('home');
  const titleARef = useRef<HTMLSpanElement | null>(null);
  const titleBRef = useRef<HTMLSpanElement | null>(null);
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const eagleRef = useRef<HTMLDivElement | null>(null);

  useIsoLayoutEffect(() => {
    const blockA = titleARef.current;
    const blockB = titleBRef.current;
    if (!blockA || !blockB) return;
    // 모션 최소화 선호 → 애니메이션 없이 문구 A 만 정적 표시(B 는 마크업에서 이미 숨김)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // 무한 트윈들(로테이션·부유)을 IO 에서 pause/play 하기 위한 참조
    let loopTl: gsap.core.Timeline | null = null;
    let floatTween: gsap.core.Tween | null = null;

    const ctx = gsap.context(() => {
      // aria:'none' — 부모 grid 가 이미 aria-hidden 이라 분해 스팬에 중복 aria 를 달지 않는다
      const splitA = SplitText.create(blockA, { type: 'chars,words', mask: 'chars', aria: 'none' });
      const splitB = SplitText.create(blockB, { type: 'chars,words', mask: 'chars', aria: 'none' });

      const HOLD = 3.2; // 문구 유지 시간(초)

      // 초기 상태: B 블록은 통째로 숨김(visibility 유지 → grid 높이는 둘 중 큰 쪽으로 고정),
      // 양쪽 글자는 자기 마스크 아래(yPercent:110)에서 대기.
      gsap.set(blockB, { autoAlpha: 0 });
      gsap.set([...splitA.chars, ...splitB.chars], { yPercent: 110 });

      const tl = gsap.timeline({ repeat: -1 });
      loopTl = tl;
      // 문구 A: 마스크 아래에서 솟아오름 → 유지 → 위로 퇴장
      tl.to(splitA.chars, { yPercent: 0, duration: 0.7, stagger: 0.02, ease: 'power4.out' });
      tl.to(splitA.chars, { yPercent: -110, duration: 0.5, stagger: 0.015, ease: 'power2.in' }, `+=${HOLD}`);
      // A→B 스왑: A 숨김·아래로 리셋 / B 노출
      tl.set(blockA, { autoAlpha: 0 });
      tl.set(splitA.chars, { yPercent: 110 });
      tl.set(blockB, { autoAlpha: 1 });
      // 문구 B: 솟아오름 → 유지 → 위로 퇴장
      tl.to(splitB.chars, { yPercent: 0, duration: 0.7, stagger: 0.02, ease: 'power4.out' });
      tl.to(splitB.chars, { yPercent: -110, duration: 0.5, stagger: 0.015, ease: 'power2.in' }, `+=${HOLD}`);
      // B→A 스왑: B 숨김·아래로 리셋 / A 노출 → 루프 처음으로
      tl.set(blockB, { autoAlpha: 0 });
      tl.set(splitB.chars, { yPercent: 110 });
      tl.set(blockA, { autoAlpha: 1 });

      // 링크: 첫 리빌에 이어 1회 페이드업(로테이션과 무관하게 계속 표시)
      if (linkRef.current) {
        gsap.fromTo(
          linkRef.current,
          { y: 20, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.6, ease: 'power2.out', delay: 0.35 },
        );
      }

      // 독수리: 1회 페이드인 + 느린 상하 부유. 스크롤 패럴랙스는 첫 화면이라 의미 없어 생략.
      // (autoAlpha·y 는 안쪽 div 에만 적용 — base 투명도는 바깥 div 클래스가 담당)
      if (eagleRef.current) {
        gsap.fromTo(eagleRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1, ease: 'power2.out' });
        floatTween = gsap.fromTo(
          eagleRef.current,
          { y: -12 },
          { y: 12, duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 },
        );
      }
    });

    // 화면 밖에선 무한 트윈(글자 로테이션·독수리 부유) 정지 — 히어로를 지나
    // 다른 섹션을 볼 때도 매 프레임 수십 개 글자의 transform 을 갱신하면
    // 섹션 페이징 트윈의 프레임 예산을 갉아먹는다(툭툭 끊김의 한 원인).
    const section = blockA.closest('section');
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        loopTl?.play();
        floatTween?.play();
      } else {
        loopTl?.pause();
        floatTween?.pause();
      }
    });
    if (section) io.observe(section);

    // context.revert() 가 SplitText 원본 마크업 복원 + 트윈 kill 을 함께 처리
    return () => {
      io.disconnect();
      ctx.revert();
    };
  }, []);

  // 강조 태그(c1/c2)는 히어로 로테이션에서는 장식 없이 평문으로 — 대형 타이포 자체가
  // 강조 역할을 하고, 마스크 리빌과 밑줄 장식이 시각적으로 충돌한다(사용자 결정).
  const em = (chunks: ReactNode) => <span>{chunks}</span>;

  return (
    <section
      className="relative isolate flex h-full flex-col justify-end overflow-hidden pb-[14vh] text-white sm:pb-[16vh]"
    >
      {/* 캔버스 웨이브 배경 */}
      <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full [mask-image:linear-gradient(to_top,transparent,black_22%)]" />

      {/* 독수리 마스코트 — 우측 배치(텍스트 옆). DOM 상 캔버스보다 나중 형제 + 동일 -z-10 →
          캔버스 위·텍스트 아래에 그려진다. 바깥 div 가 반응형 base 투명도(0.16 / lg 0.25)를
          담고, 안쪽 div 만 GSAP autoAlpha 로 페이드인·부유한다 — autoAlpha 의 인라인 opacity 가
          Tailwind 투명도 클래스를 덮어써 버리는 충돌을 피하기 위한 2겹 구조. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-[12%] right-[-12%] -z-10 w-[58%] opacity-[0.16] sm:right-0 sm:w-[42%] lg:right-[2%] lg:w-[34%] lg:opacity-25"
      >
        <div
          ref={eagleRef}
          className="h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/img/eagle.png)' }}
        />
      </div>

      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        {/* 제목 — 고정 aria-label 로 문구 A 를 노출. 시각 로테이션(grid)은 통째로 aria-hidden. */}
        <h1 aria-label={`${t('animHero.title1')} ${t('animHero.title2')}`}>
          <span aria-hidden="true" className="grid">
            {/* 문구 A — 브랜드 고정 영문 캡스 2행 (기존 히어로 타이포 그대로) */}
            <span
              ref={titleARef}
              className="[grid-area:1/1] text-[clamp(2.4rem,7vw,6.5rem)] font-black uppercase leading-[1.04] tracking-tight text-white"
            >
              <span className="block">{t('animHero.title1')}</span>
              <span className="block">{t('animHero.title2')}</span>
            </span>
            {/* 문구 B — 한글 스테이트먼트(골드 밑줄). 같은 크기 스케일, 한글이라 leading 여유.
                초기엔 visibility 로 숨김(display 유지 → grid 높이 안정). GSAP autoAlpha 가 이후 제어. */}
            <span
              ref={titleBRef}
              style={{ visibility: 'hidden' }}
              className="[grid-area:1/1] text-[clamp(2.4rem,7vw,6.5rem)] font-black leading-[1.12] tracking-tight text-white"
            >
              {t.rich('weAre.statement', { c1: em, c2: em, br: () => <br /> })}
            </span>
          </span>
        </h1>

        {/* 문구 B 원문 — 스크린리더 전용 병기(로테이션 시각부가 aria-hidden 이므로) */}
        <p className="sr-only">
          {t.rich('weAre.statement', { c1: (c) => c, c2: (c) => c, br: () => ' ' })}
        </p>

        {/* 기계공학부 소개 링크 — (구)StatementReveal 에서 클래스·구조 그대로 이식 */}
        <Link
          ref={linkRef}
          href="/about"
          className="mt-10 inline-flex items-center gap-2 border-b-2 border-white/70 pb-1 text-base font-semibold text-white transition-opacity hover:opacity-70"
        >
          {t('weAre.link')}
        </Link>
      </div>
    </section>
  );
}
