'use client';

import { useEffect, useState } from 'react';

export type ContactRow = { label: string; value: string; href?: string };

/**
 * 카드 하단 대각선 사진에 얹을 캠퍼스 사진 목록.
 * 사용자 제공 캠퍼스 사진으로 교체하려면 public/img 아래에 파일을 넣고
 * 이 배열의 경로만 수정하면 된다(그라데이션·크로스페이드는 자동 순환).
 */
const PANEL_PHOTOS = [
  '/img/directions/directions-1.jpg',
  '/img/directions/directions-2.jpg',
  '/img/directions/directions-3.jpg',
  '/img/directions/directions-4.jpg',
];

// 동아리 카드(ClubGrid)와 동일한 브랜드 그라데이션 팔레트.
const ACCENTS = [
  'from-yonsei-navy to-yonsei-blue',
  'from-yonsei-blue to-yonsei-sky',
  'from-yonsei-navy to-yonsei-gold',
  'from-yonsei-sky to-yonsei-navy',
];

// 사진·그라데이션 크로스페이드 간격(ms)
const CYCLE_MS = 6000;

/**
 * 연락처 정보(주소/전화/이메일)를 동아리 카드 스타일의 다크 비주얼 패널로 보여준다.
 * - 카드 전체 배경은 브랜드 그라데이션 4종이 6초 간격으로 부드럽게 크로스페이드.
 * - 카드 하단 ~42% 영역은 대각선으로 잘린 캠퍼스 사진(오른쪽이 높은 사선 엣지)이
 *   같은 타이머로 함께 전환된다.
 * - 사진은 순수 장식이므로 aria-hidden, 연락처는 <dl>로 시맨틱 유지.
 * - prefers-reduced-motion이면 타이머 없이 첫 조합으로 고정한다.
 */
export function ContactInfoPanel({
  rows,
  className,
}: {
  rows: ContactRow[];
  className?: string;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    // 모션 최소화 선호 시 전환하지 않고 첫 조합 고정
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.matches) return;
    }

    const id = window.setInterval(() => {
      // 백그라운드 탭에서는 진행 생략(불필요한 렌더 방지)
      if (typeof document !== 'undefined' && document.hidden) return;
      setActive((i) => (i + 1) % PANEL_PHOTOS.length);
    }, CYCLE_MS);

    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      // 모서리·테두리·그림자는 지도와 합쳐진 부모 컨테이너가 담당한다.
      className={`relative isolate flex min-h-[19rem] flex-col overflow-hidden text-white lg:min-h-[24rem] ${className ?? ''}`}
    >
      {/* 그라데이션 레이어(브랜드 팔레트 4종) — 활성 인덱스만 노출, 나머지는 페이드아웃 */}
      {ACCENTS.map((accent, i) => (
        <div
          key={accent}
          aria-hidden="true"
          className={`anim-gradient-flow absolute inset-0 -z-20 bg-gradient-to-br transition-opacity duration-1000 ${accent} ${
            i === active ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      {/* 하단 대각선 사진 컨테이너 — 오른쪽이 높은 사선 상단 엣지 */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-[42%]"
        style={{ clipPath: 'polygon(0 28%, 100% 0, 100% 100%, 0 100%)' }}
      >
        {PANEL_PHOTOS.map((src, i) => (
          <div
            key={src}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
              i === active ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backgroundImage: `url(${src})` }}
          />
        ))}
        {/* 사진 위 얇은 톤 오버레이 — 브랜드 톤과 조화, 텍스트 대비 보조 */}
        <div className="absolute inset-0 bg-yonsei-navy/30" />
      </div>

      {/* 콘텐츠 — 사진 영역과 겹치지 않게 상단 배치, 하단 여백 확보 */}
      <dl className="relative z-10 space-y-6 p-8 pb-[46%]">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs font-bold uppercase tracking-wide text-white/60">
              {row.label}
            </dt>
            <dd className="mt-1 text-base leading-relaxed text-white">
              {row.href ? (
                <a href={row.href} className="text-yonsei-gold hover:underline">
                  {row.value}
                </a>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
