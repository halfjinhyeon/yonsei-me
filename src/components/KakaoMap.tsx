'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// 카카오맵 "지도 퍼가기" 임베드.
// map.kakao.com 에서 발급한 퍼가기 스니펫 기반이라 개발자 콘솔 앱 키·도메인 등록이
// 필요 없다 (JS SDK 방식은 OPEN_MAP_AND_LOCAL 서비스 활성화가 필요해 교체함).
const LOADER_SRC = 'https://ssl.daumcdn.net/dmaps/map_js_init/roughmapLoader.js';
const ROUGHMAP_TIMESTAMP = '1783404439882';
const ROUGHMAP_KEY = 'qsu9qja6hkk';

// 로드 실패 시 폴백 링크로 사용할 카카오맵 URL (한글 포함 → encodeURI)
const FALLBACK_LINK = encodeURI(
  'https://map.kakao.com/link/map/연세대학교 제4공학관,37.5651,126.9385',
);

// window.daum.roughmap 최소 타입 선언.
// 로더(1단계)는 네임스페이스(phase/cdn/url_protocal)만 만들고, Lander 클래스는
// 2단계 스크립트(roughmapLander.js)가 정의한다.
interface RoughmapLander {
  render(): void;
}
declare global {
  interface Window {
    daum?: {
      roughmap?: {
        phase?: string;
        cdn?: string;
        url_protocal?: string;
        Lander?: new (options: {
          timestamp: string;
          key: string;
          mapWidth: string;
          mapHeight: string;
        }) => RoughmapLander;
      };
    };
  }
}

/** 로더가 만든 네임스페이스 값으로 2단계(Lander) 스크립트 URL을 구성한다.
 *  로더 원본은 이 URL을 document.write로 넣는데, 동적 주입된 스크립트에서는
 *  document.write가 무시되므로 우리가 직접 만들어 주입해야 한다. */
function landerScriptSrc(): string | null {
  const rm = window.daum?.roughmap;
  if (!rm?.cdn || !rm.phase || !rm.url_protocal) return null;
  return `${rm.url_protocal}//t1.kakaocdn.net/kakaomapweb/roughmap/place/${rm.phase}/${rm.cdn}/roughmapLander.js`;
}

/**
 * 카카오맵 퍼가기(roughmap) 지도.
 * 퍼가기 지도는 고정 픽셀 크기로만 렌더되므로, 래퍼의 실측 크기를 넘겨 그리고
 * 창 크기가 바뀌면 디바운스 후 다시 그린다. 로더 스크립트는 전역 1회만 주입.
 * 로드 실패 시 한국어 안내와 카카오맵 링크로 폴백한다.
 */
export function KakaoMap({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const dedupeTimers: number[] = [];

    // roughmapLander는 내부적으로 데이터를 비동기 로드한 뒤 컨테이너에 append 한다.
    // 재렌더 직전 innerHTML을 비워도 "이전 렌더"의 비동기 결과가 늦게 도착해
    // 지도 세트(.wrap_map + 부속 노드)가 두 개 쌓일 수 있다(간헐적 지도 2개 버그).
    // 렌더 후 몇 차례 훑어서 마지막 세트만 남기고 앞의 노드를 제거한다.
    const scheduleDedupe = (container: HTMLElement) => {
      [400, 1200, 2500].forEach((delay) => {
        dedupeTimers.push(
          window.setTimeout(() => {
            if (cancelled) return;
            while (
              container.querySelectorAll('.wrap_map').length > 1 &&
              container.firstChild
            ) {
              container.removeChild(container.firstChild);
            }
          }, delay),
        );
      });
    };

    const draw = () => {
      const wrap = wrapRef.current;
      const Lander = window.daum?.roughmap?.Lander;
      if (cancelled || !wrap || !Lander) return;
      const container = wrap.querySelector<HTMLElement>('.root_daum_roughmap');
      if (!container) return;
      // 래퍼 실측 크기 (숨김 상태 등으로 0이면 퍼가기 기본값 사용)
      const width = Math.round(wrap.clientWidth) || 640;
      const height = Math.round(wrap.clientHeight) || 360;

      // StrictMode 이중 마운트·리사이즈 재렌더 대비 컨테이너 초기화 후 렌더
      const render = (mapHeight: number) => {
        container.innerHTML = '';
        new Lander({
          timestamp: ROUGHMAP_TIMESTAMP,
          key: ROUGHMAP_KEY,
          mapWidth: String(width),
          mapHeight: String(mapHeight),
        }).render();
        scheduleDedupe(container);
      };
      render(height);

      // mapHeight는 하단 컨트롤/주소 블록을 포함한 전체 높이라, 그 블록들을
      // CSS로 숨긴 만큼(래퍼 높이 - 실제 지도 영역 높이) 보정해 1회 재렌더
      // → 지도가 래퍼를 꽉 채운다.
      requestAnimationFrame(() => {
        if (cancelled) return;
        const mapArea = container.querySelector<HTMLElement>('.wrap_map');
        const deficit = mapArea ? height - mapArea.clientHeight : 0;
        if (deficit > 0) render(height + deficit);
      });
    };

    const handleError = () => {
      if (!cancelled) setFailed(true);
    };

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(draw, 300);
    };
    window.addEventListener('resize', onResize);

    // 래퍼 실측 크기가 바뀔 때(탭 표시, 그리드 트랙 확정 등) 다시 그린다.
    // 초기 마운트 draw()가 레이아웃 확정 전 폭으로 그려 컨테이너보다 넓게(clip)
    // 렌더되는 경우를 바로잡는다. 지도 폭은 그리드가 정하므로 재렌더가 래퍼
    // 크기를 바꾸지 않아 관찰 루프는 생기지 않는다.
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && wrapRef.current) {
      ro = new ResizeObserver(onResize);
      ro.observe(wrapRef.current);
    }

    // 정리 대상 리스너를 한곳에 모아 unmount 시 해제
    const cleanups: (() => void)[] = [];
    const listen = (el: HTMLScriptElement, onLoad: () => void) => {
      el.addEventListener('load', onLoad);
      el.addEventListener('error', handleError);
      cleanups.push(() => {
        el.removeEventListener('load', onLoad);
        el.removeEventListener('error', handleError);
      });
    };

    // src가 같은 스크립트를 1회만 주입하고 로드 완료를 기다린다 (이미 있으면 재사용)
    const ensureScript = (src: string, onLoad: () => void) => {
      let el = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (!el) {
        el = document.createElement('script');
        el.src = src;
        el.async = true;
        document.head.appendChild(el);
      }
      listen(el, onLoad);
    };

    // 2단계: Lander 클래스 확보 후 지도 렌더
    const ensureLander = () => {
      if (cancelled) return;
      if (window.daum?.roughmap?.Lander) {
        draw();
        return;
      }
      const src = landerScriptSrc();
      if (!src) {
        handleError();
        return;
      }
      ensureScript(src, draw);
    };

    // 1단계: 로더(네임스페이스) 확보
    if (window.daum?.roughmap) {
      ensureLander();
    } else {
      ensureScript(LOADER_SRC, ensureLander);
    }

    return () => {
      cancelled = true;
      clearTimeout(resizeTimer);
      dedupeTimers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      cleanups.forEach((fn) => fn());
    };
  }, []);

  if (failed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center',
          className,
        )}
      >
        <p className="text-sm leading-relaxed text-content-soft">
          지도를 불러오지 못했습니다. 아래 링크에서 위치를 확인해 주세요.
        </p>
        <a
          href={FALLBACK_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-yonsei-blue hover:underline"
        >
          카카오맵에서 보기 ↗
        </a>
      </div>
    );
  }

  return (
    // 임베드 하단의 카카오맵 바(.wrap_controllers)와 주소 패널(.cont)은 globals.css
    // 규칙으로 숨기고 지도만 남긴다 (숨긴 높이는 draw()에서 보정).
    <div ref={wrapRef} className={cn('overflow-hidden', className)}>
      {/* 퍼가기 스크립트가 id로 찾는 지도 노드 — id/클래스는 퍼가기 규격 고정 */}
      <div
        id={`daumRoughmapContainer${ROUGHMAP_TIMESTAMP}`}
        className="root_daum_roughmap root_daum_roughmap_landing"
      />
    </div>
  );
}
