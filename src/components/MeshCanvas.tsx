'use client';

import { useEffect, useRef } from 'react';

/**
 * 캔버스 기반 흐르는 웨이브 배경 (오리지널 구현).
 * 네이비 위에 반투명한 사인파 라인이 천천히 흐른다.
 * prefers-reduced-motion 시 정지된 한 프레임만 그린다.
 */
export function MeshCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const context = el.getContext('2d');
    if (!context) return;
    // 이후 클로저에서 non-null로 다루기 위한 별칭
    const canvas: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 웨이브 라인 색 (연세 블루/골드 계열, 저채도 반투명)
    const palette = [
      'rgba(143,192,240,0.30)',
      'rgba(143,192,240,0.20)',
      'rgba(200,169,106,0.22)',
      'rgba(120,160,220,0.18)',
    ];

    function resize() {
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(t: number) {
      ctx.clearRect(0, 0, width, height);
      const baseY = height * 0.62;
      const lines = 9;
      for (let i = 0; i < lines; i++) {
        ctx.beginPath();
        const amp = 26 + i * 6;
        const yOff = baseY - i * 22;
        const phase = t * 0.00016 * (1 + i * 0.05) + i * 0.5;
        for (let x = -20; x <= width + 20; x += 12) {
          const y =
            yOff +
            Math.sin(x * 0.0045 + phase) * amp +
            Math.sin(x * 0.011 + phase * 1.7) * (amp * 0.35);
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = palette[i % palette.length];
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function loop(t: number) {
      draw(t);
      raf = requestAnimationFrame(loop);
    }

    resize();
    if (reduce) {
      draw(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
