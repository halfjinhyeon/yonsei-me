import { cn } from '@/lib/utils';
import { SWEEP_PATHS, SWIRL_PATHS } from './flow-paths';

/**
 * 유선(流線) 라인아트 장식 — Cornell Human Ecology 웨이브 SVG 를 연세 톤으로 재채색한
 * 순수 장식 레이어(흰 배경 여백 채움 리디자인). 얇은 11겹 평행선 번들이 여백을 가로지른다.
 *
 *  - sweep: 풀폭 가로 스윕(viewBox 1512×814) — 섹션 배경·섹션 사이 크로싱 스트립용.
 *  - swirl: 세로 소용돌이(viewBox 742×1308) — 빈 열/전환부를 채우는 루프 번들.
 *
 * 색은 CSS 변수(--flow-a → --flow-b, globals.css)로 라이트=블루→네이비, 다크=밝은 블루
 * 계열로 자동 전환. 원본의 선별 그라디언트 11개는 색조 차가 미미해 단일 그라디언트로
 * 단순화(마크업 1/10). 항상 aria-hidden + pointer-events-none — 순수 장식.
 *
 * 배치는 부모가 className(absolute 좌표·크기·opacity·마스크)으로 지정한다.
 * viewBox 프롭으로 원본의 특정 구역만 잘라 쓸 수 있다(스트립용 가로 밴드 등).
 * gid 는 SVG 그라디언트 id — 한 페이지에 여러 개 쓸 때 겹치지 않게 인스턴스마다 고유값.
 */
const META = {
  sweep: {
    viewBox: '0 0 1512 814',
    strokeWidth: 0.5,
    paths: SWEEP_PATHS,
    // 원본 그라디언트 방향(좌→우, 살짝 하강)을 단일화 — 좌 1/3 은 블루 유지 후 네이비로.
    grad: { x1: 0, y1: 280, x2: 1512, y2: 560 },
  },
  swirl: {
    viewBox: '0 0 742 1308',
    strokeWidth: 0.5,
    paths: SWIRL_PATHS,
    // 원본 방향(좌상→우하 대각) 근사.
    grad: { x1: -180, y1: 250, x2: 700, y2: 1100 },
  },
} as const;

export function FlowLines({
  variant,
  gid,
  className,
  viewBox,
  preserve = 'xMidYMid slice',
}: {
  variant: keyof typeof META;
  /** 그라디언트 id — 페이지 내 인스턴스마다 고유하게(예: "flow-goals") */
  gid: string;
  /** 위치·크기·opacity·마스크 등 배치 스타일(부모 결정) */
  className?: string;
  /** 원본 좌표계의 일부만 보여줄 때 오버라이드(예: "0 150 1512 380") */
  viewBox?: string;
  /** preserveAspectRatio — 기본 중앙 슬라이스 */
  preserve?: string;
}) {
  const m = META[variant];
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox ?? m.viewBox}
      preserveAspectRatio={preserve}
      fill="none"
      className={cn('pointer-events-none select-none', className)}
    >
      <defs>
        <linearGradient
          id={gid}
          gradientUnits="userSpaceOnUse"
          x1={m.grad.x1}
          y1={m.grad.y1}
          x2={m.grad.x2}
          y2={m.grad.y2}
        >
          <stop offset="0" stopColor="var(--flow-a)" />
          <stop offset="0.33" stopColor="var(--flow-a)" />
          <stop offset="0.92" stopColor="var(--flow-b)" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gid})`} strokeWidth={m.strokeWidth} strokeMiterlimit={10}>
        {m.paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
