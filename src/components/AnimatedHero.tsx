import { useTranslations } from 'next-intl';
import { MeshCanvas } from './MeshCanvas';

/**
 * 풀뷰포트 히어로 — 초대형 캡스 2행 타이틀 배너.
 * - 네이비 애니메이션 그라디언트 + 캔버스 웨이브 배경
 * - "COLLEGE OF / MECHANICAL ENGINEERING" 정적 타이틀(브랜드 고정 요소라
 *   양 로케일 모두 영어, 값은 messages 양쪽에 동일하게 둠)
 * - 1행 끝에 흰색 톱니 기어가 천천히 회전(기계공학 모티프) + 하단 중앙 태그라인
 */

/** 굵은 기하학 톱니 기어 — font-black 캡스와 어울리는 두꺼운 톱니 8개 + 축 구멍.
 *  크기는 em 단위(부모 폰트 비례), currentColor 로 칠해 흰 타이틀을 따라간다. */
function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" className={className}>
      <mask id="gear-hole">
        <rect width="100" height="100" fill="white" />
        <circle cx="50" cy="50" r="15" fill="black" />
      </mask>
      <g mask="url(#gear-hole)">
        <circle cx="50" cy="50" r="34" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect
            key={i}
            x="43"
            y="4"
            width="14"
            height="22"
            rx="3"
            transform={`rotate(${i * 45} 50 50)`}
          />
        ))}
      </g>
    </svg>
  );
}
export function AnimatedHero() {
  const t = useTranslations('home.animHero');

  return (
    <section className="anim-gradient relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden pb-[14vh] text-white sm:pb-[16vh]">
      {/* 캔버스 웨이브 배경 */}
      <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full [mask-image:linear-gradient(to_top,transparent,black_22%)]" />

      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        <h1 className="text-[clamp(2.4rem,7vw,6.5rem)] font-black uppercase leading-[1.04] tracking-tight text-white">
          <span className="slide-enter block">
            {t('title1')}
            {/* 회전하는 흰색 톱니 기어 — 기계공학 모티프 (reduced-motion 시 전역 규칙이 정지) */}
            <span className="ml-[0.32em] inline-block h-[0.72em] w-[0.72em] align-baseline">
              <GearIcon className="h-full w-full animate-[spin_9s_linear_infinite]" />
            </span>
          </span>
          <span className="slide-enter block" style={{ animationDelay: '0.12s' }}>
            {t('title2')}
          </span>
        </h1>

        <p
          className="slide-enter mt-8 max-w-2xl text-base font-semibold leading-relaxed text-white/85 sm:mt-10 sm:text-xl"
          style={{ animationDelay: '0.24s' }}
        >
          {t('tagline')}
        </p>
      </div>
    </section>
  );
}
