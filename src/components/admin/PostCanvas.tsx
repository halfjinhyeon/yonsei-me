'use client';

// PostCanvas — CMS 의 편집기·미리보기가 공개 화면과 **같은 자리에서 줄바꿈되게** 하는 캔버스.
//
// 문제: 관리자 폼은 공개 게시물 열(1022px)보다 좁을 수 있는데, 폭이 다르면 같은 글이
// 다른 곳에서 접힌다. "쓴 대로 보인다"가 깨지는 지점이 대개 여기다.
// 해법: 안쪽 박스를 언제나 설계 폭(POST_BODY_WIDTH)으로 **레이아웃**해 놓고, 칸이 좁으면
// CSS zoom 으로 통째로 줄인다. 글자 크기는 실치수가 아니게 되지만(사용자 승인) 줄바꿈은
// 공개 화면과 한 글자도 어긋나지 않는다. transform: scale 이 아니라 zoom 인 이유는
// scale 이 레이아웃 박스를 남겨 아래 요소가 빈 공간에 밀리기 때문이다.
//
// 측정 규약(Chrome 151 실측):
//   - offsetWidth/clientWidth/offsetHeight → 자기 zoom 과 무관한 **레이아웃 px**
//   - getBoundingClientRect() → zoom 이 반영된 **화면 px**
//   그래서 zoom = min(1, host.clientWidth / inner.offsetWidth) 이 자기참조 없이 안정적이다.
//
// 알려진 한계: prosemirror-tables 의 열 폭 드래그는 offsetWidth(레이아웃 px)와
// clientX(화면 px)를 섞어 쓰기 때문에 zoom<1 에서 열 경계가 커서보다 느리게 따라온다.
// 라이브러리 내부라 손대지 않았다 — 대신 폼 폭을 설계 폭에 맞춰 두어 데스크톱에서는
// zoom=1 이라 영향이 없다. 우리가 만든 행 높이 드래그(rte-row-resize)는 zoom 보정을 했다.

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { POST_BODY_WIDTH, POST_CANVAS_MIN_ZOOM } from '@/lib/post-layout';

export function PostCanvas({ children, className }: { children: ReactNode; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  /** 마지막으로 계산에 쓴 host 폭 — 같은 폭으로 다시 부르면 그냥 넘긴다(관찰자 되먹임 방지) */
  const lastWidth = useRef(-1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;

    // zoom 미지원 브라우저에서는 축소를 포기하고 그냥 흐르게 둔다(줄바꿈만 달라진다)
    const supported = typeof CSS !== 'undefined' && CSS.supports('zoom', '1');

    const apply = () => {
      if (!supported) {
        inner.removeAttribute('data-fit');
        inner.style.zoom = '';
        return;
      }
      inner.setAttribute('data-fit', ''); // 설계 폭 레이아웃을 켠 상태에서 잰다
      inner.style.zoom = '1';
      const layoutW = inner.offsetWidth; // zoom 과 무관한 레이아웃 px
      const z = Math.min(1, host.clientWidth / layoutW);
      if (z < POST_CANVAS_MIN_ZOOM) {
        // 이 아래로 줄이면 읽을 수 없다 — 설계 폭을 포기하고 칸 폭에 맞춰 흐른다
        inner.removeAttribute('data-fit');
        inner.style.zoom = '';
        return;
      }
      inner.style.zoom = String(z);
    };

    // React 상태를 쓰지 않는 이유: 타이핑마다 리렌더가 돌면 에디터가 무거워진다.
    // 폭 계산은 DOM 쓰기로 끝내고 리액트 트리는 건드리지 않는다.
    apply();
    lastWidth.current = host.clientWidth;

    const ro = new ResizeObserver(() => {
      // host 폭은 부모만 정한다(안쪽은 host 폭 이하로 축소되므로) — 되먹임 루프는 없지만,
      // 세로만 늘어난 흔한 경우(글 입력)에 재계산을 건너뛰어 값싸게 만든다.
      const w = host.clientWidth;
      if (w === lastWidth.current) return;
      lastWidth.current = w;
      apply();
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hostRef} className={className}>
      <div
        ref={innerRef}
        className="post-canvas"
        data-fit=""
        style={{ ['--post-body-w' as string]: `${POST_BODY_WIDTH}px` } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
