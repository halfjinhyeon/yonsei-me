'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import data from '@content/research-vision-infographic.json';
import { pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

// ScrollTrigger 는 무료 public gsap 패키지에 포함.
gsap.registerPlugin(ScrollTrigger);

// SSR 안전 layout effect — 페인트 전에 from-state 를 잡아 깜빡임 방지.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 연구 비전 인포그래픽 — 구 이미지(공과대학 비전과 교육목표 다이어그램)를
 * 홍익대 hicoda 에디토리얼 문법으로 재설계한 컴포넌트. 포인트 컬러는 연한 네이비.
 *  ① VISION 01–03: 큰 번호 + 라벨 + 헤어라인 + 볼드 문장 3열 (아이콘 없음)
 *  ② 교육목적: 번호와 라벨을 수평선이 잇는 행 3개 — 계단식 들여쓰기(데스크톱)로
 *     리듬을 만들고, 선은 스크롤 시 왼쪽에서 그어진다
 *  ③ 세부 추진 목표: 사이트 번호 그리드 문법(01. + 헤어라인)
 * 데이터는 content/research-vision-infographic.json (이중언어) — 문구 수정은 JSON 만.
 * reduced-motion: 애니메이션 없이 정적 표시.
 */

type Localized = { ko: string; en: string };

interface VisionData {
  sections: Record<'vision' | 'purpose' | 'objective', { label: Localized }>;
  visions: { title: Localized }[];
  purposes: Localized[];
  objectives: { title: Localized; body: Localized }[];
}

const d = data as unknown as VisionData;

/* ── 섹션 라벨 — 레퍼런스의 검정 박스를 네이비로 ── */

function SectionLabel({ text }: { text: string }) {
  return (
    <h4
      data-vi="fade"
      className="inline-block bg-yonsei-navy px-5 py-2.5 text-base font-bold tracking-tight text-white"
    >
      {text}
    </h4>
  );
}

/* 교육목적 다이어그램은 순수 HTML 행(번호 ─ 수평선 ─ 라벨)으로 렌더한다 —
   SVG 불필요, 모바일·스크린리더 대체물도 불필요. 계단식 들여쓰기는 데스크톱만. */

export function VisionInfographic({ locale }: { locale: Locale }) {
  const rootRef = useRef<HTMLElement | null>(null);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // 섹션별 개별 트리거 — 뷰포트 80% 지점에서 1회 등장
      root.querySelectorAll<HTMLElement>('[data-vi-section]').forEach((section) => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: section, start: 'top 80%', once: true },
        });

        // 공통 페이드업(라벨 박스·비전 컬럼·목표 행·모바일 목록)
        const fades = section.querySelectorAll<HTMLElement>('[data-vi="fade"]');
        if (fades.length) {
          tl.from(fades, { y: 26, autoAlpha: 0, duration: 0.6, stagger: 0.12, ease: 'sine.out' });
        }

        // 수평 연결선 — 번호에서 라벨 쪽으로 그어진다(scaleX, 왼쪽 기준)
        const lines = section.querySelectorAll<HTMLElement>('[data-vi-line]');
        if (lines.length) {
          gsap.set(lines, { scaleX: 0, transformOrigin: 'left center' });
          tl.to(
            lines,
            { scaleX: 1, duration: 0.7, stagger: 0.18, ease: 'power2.inOut' },
            0.15,
          );
        }
        const labels = section.querySelectorAll<HTMLElement>('[data-vi-label]');
        if (labels.length) {
          tl.from(
            labels,
            { x: -28, autoAlpha: 0, duration: 0.55, stagger: 0.18, ease: 'sine.out' },
            0.55,
          );
        }
        const nums = section.querySelectorAll<HTMLElement>('[data-vi-num]');
        if (nums.length) {
          tl.from(nums, { autoAlpha: 0, duration: 0.4, stagger: 0.18, ease: 'sine.out' }, 0.1);
        }
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      aria-label={pick(d.sections.vision.label, locale)}
      className="mt-20"
    >
      {/* ① VISION 01–03 — 큰 번호 + 라벨 + 문장 3열 */}
      <div data-vi-section>
        <SectionLabel text={pick(d.sections.vision.label, locale)} />
        <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-10">
          {d.visions.map((v, i) => (
            <li key={i} data-vi="fade">
              <span
                aria-hidden="true"
                className="block text-4xl font-light tabular-nums text-yonsei-blue/40"
              >
                {i + 1}
              </span>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-yonsei-blue">
                Vision {String(i + 1).padStart(2, '0')}
              </p>
              <div className="mt-4 border-t border-surface-border pt-5">
                <p className="text-lg font-bold leading-snug text-content sm:text-xl">
                  {pick(v.title, locale)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ② 교육목적 — 번호 ─ 수평선 ─ 라벨 행. 데스크톱은 계단식 들여쓰기로 리듬 */}
      <div data-vi-section className="mt-24">
        <SectionLabel text={pick(d.sections.purpose.label, locale)} />
        <ol className="mt-8">
          {d.purposes.map((p, i) => (
            <li key={i} className="flex items-center gap-4 py-6 sm:gap-7 sm:py-8">
              {/* 계단식 들여쓰기 — 아래 행일수록 오른쪽에서 시작 */}
              <span
                aria-hidden="true"
                className="hidden flex-none md:block"
                style={{ width: `${i * 6}rem` }}
              />
              <span
                data-vi-num
                aria-hidden="true"
                className="flex-none text-xl font-bold tabular-nums text-yonsei-blue sm:text-2xl"
              >
                {i + 1}
              </span>
              {/* 번호와 라벨을 잇는 수평 연결선 — 스크롤 시 왼쪽에서 그어진다 */}
              <span
                data-vi-line
                aria-hidden="true"
                className="h-0.5 min-w-8 flex-1 bg-yonsei-navy/45"
              />
              <span
                data-vi-label
                className="max-w-[62%] flex-none text-lg font-bold leading-snug text-content sm:text-xl md:w-[26rem] md:max-w-none"
              >
                {pick(p, locale)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* ③ 세부 추진 목표 — 사이트 번호 그리드 문법 */}
      <div data-vi-section className="mt-24">
        <SectionLabel text={pick(d.sections.objective.label, locale)} />
        <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {d.objectives.map((o, i) => (
            <li key={i} data-vi="fade" className="border-t border-surface-border pt-5">
              <span className="block text-4xl font-light tabular-nums text-yonsei-blue/40">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h5 className="mt-4 text-lg font-bold text-content">{pick(o.title, locale)}</h5>
              <p className="mt-2 text-sm leading-relaxed text-content-soft">
                {pick(o.body, locale)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
