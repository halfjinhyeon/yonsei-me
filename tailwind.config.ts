import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx,mdx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.25rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1360px',
      },
    },
    extend: {
      screens: {
        // 태블릿(아이패드 미니 세로 744px, 갤럭시 탭 세로 ~750-800px 포함) —
        // 교과목 체계도·대학원 졸업요건을 lg(1024) 미만에서도 PC 레이아웃으로
        // 내리기 위한 전용 브레이크포인트(사용자 지시, 횡스크롤 허용).
        tab: '700px',
      },
      colors: {
        // 연세대 브랜드 톤 (네이비/블루 계열)
        yonsei: {
          navy: '#003377', // 메인 네이비 (Yonsei Blue)
          blue: '#0057A8', // 서브 블루
          sky: '#2E86D6', // 강조 라이트 블루
          gold: '#C8A96A', // 포인트 골드 (독수리/전통색)
        },
        // 시맨틱 토큰 (CSS 변수 기반 → 다크모드 대응)
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
          muted: 'rgb(var(--brand-muted) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          soft: 'rgb(var(--surface-soft) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--content) / <alpha-value>)',
          soft: 'rgb(var(--content-soft) / <alpha-value>)',
          faint: 'rgb(var(--content-faint) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Pretendard', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      fontSize: {
        // 타이포 스케일
        'display-lg': ['clamp(2.5rem, 5vw, 4rem)', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display': ['clamp(2rem, 4vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        // display 의 약 80% — 탭 섹션 제목(TabbedContent)이 본문 대비 과하지 않도록
        'display-sm': ['clamp(1.6rem, 3.2vw, 2.4rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline': ['clamp(1.5rem, 2.5vw, 2rem)', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
      },
      spacing: {
        // 섹션 스페이싱 토큰
        'section': 'clamp(3.5rem, 8vw, 7rem)',
        'section-sm': 'clamp(2.5rem, 5vw, 4rem)',
        // 홈 섹션 수직 리듬(자유 스크롤 전환 후) — 모든 홈 섹션 상하 패딩 통일(≈72–128px)
        'section-lg': 'clamp(4.5rem, 10vh, 8rem)',
      },
      borderRadius: {
        // 사이트 공통 카드 곡률 — 각진 인상을 위해 0.5rem(8px)로 통일
        card: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 40 94 / 0.04), 0 8px 24px -12px rgb(0 40 94 / 0.15)',
        'card-hover': '0 2px 4px rgb(0 40 94 / 0.06), 0 20px 40px -16px rgb(0 40 94 / 0.25)',
      },
      maxWidth: {
        // 본문 한 줄 길이(measure) — 값은 globals.css 의 --measure-prose 가 로케일별로
        // 정한다(en 65ch / ko 38em). 예전 68ch 고정값은 한글에서 ch 가 숫자 '0' 폭
        // 기준이라 실제 줄이 권장선(35~40자)을 크게 넘겼다.
        prose: 'var(--measure-prose)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
