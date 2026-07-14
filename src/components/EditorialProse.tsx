import { Marked } from 'marked';

/**
 * 임포트 마크다운을 "에디토리얼 섹션" 문법으로 렌더하는 Prose 변형.
 * 밋밋하게 글만 이어지는 탭(대학원 졸업 요건 등)을 위해:
 *  - 최상위 헤딩마다 섹션을 분리하고, 헤딩을 네이비 라벨 박스로 렌더
 *    (홍익 레퍼런스의 검정 라벨 박스 → 사이트 공통 네이비 박스 문법)
 *  - 문단·목록의 한 줄 길이 제한(max-w-2xl)을 해제해 페이지 폭에 꽉 차게(prose-wide)
 *  - 배경에 얇은 네이비 실선 도형(겹친 사각·큰 원)을 깔아 답답함을 덜어낸다
 * 콘텐츠 출처는 자체 자료(신뢰 소스) — Prose 와 동일하게 정적 인라인 렌더.
 */

const marked = new Marked({ gfm: true, breaks: false }); // Prose 와 동일 설정

interface Section {
  title: string | null;
  body: string;
}

/** 마크다운을 최상위 헤딩(문서에서 가장 얕은 레벨) 단위로 분할한다 */
function splitByTopHeading(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const heads: { i: number; depth: number; text: string }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(#{1,6})\s+(.+)$/);
    if (m) heads.push({ i, depth: m[1].length, text: m[2].trim() });
  });
  if (heads.length === 0) return [{ title: null, body: md }];

  const top = Math.min(...heads.map((h) => h.depth));
  const cuts = heads.filter((h) => h.depth === top);
  const sections: Section[] = [];

  // 첫 헤딩 이전 서문
  if (cuts[0].i > 0) {
    const pre = lines.slice(0, cuts[0].i).join('\n').trim();
    if (pre) sections.push({ title: null, body: pre });
  }
  cuts.forEach((c, k) => {
    const end = k + 1 < cuts.length ? cuts[k + 1].i : lines.length;
    sections.push({ title: c.text, body: lines.slice(c.i + 1, end).join('\n').trim() });
  });
  return sections;
}

/** 배경 텍스쳐 — 얇은 네이비 실선 도형 (우상단 겹친 사각 + 좌하단 큰 원) */
function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden text-yonsei-navy/10 dark:text-white/10"
    >
      <svg
        viewBox="0 0 400 400"
        fill="none"
        className="absolute -right-12 -top-6 hidden h-[24rem] w-[24rem] md:block"
      >
        <rect x="150" y="10" width="230" height="230" strokeWidth="2" className="stroke-current" />
        <rect x="88" y="82" width="230" height="230" strokeWidth="2" className="stroke-current opacity-70" />
        <rect x="26" y="154" width="230" height="230" strokeWidth="2" className="stroke-current opacity-40" />
      </svg>
      <svg
        viewBox="0 0 480 480"
        fill="none"
        className="absolute -left-28 top-[52%] hidden h-[30rem] w-[30rem] md:block"
      >
        <circle cx="240" cy="240" r="238" strokeWidth="1.5" className="stroke-current" />
        <circle cx="240" cy="240" r="168" strokeWidth="1.5" className="stroke-current opacity-60" />
      </svg>
    </div>
  );
}

export function EditorialProse({ markdown }: { markdown: string }) {
  const sections = splitByTopHeading(markdown);

  return (
    <div className="relative">
      <Backdrop />
      <div className="relative space-y-20">
        {sections.map((s, i) => (
          <section key={i}>
            {s.title && (
              <h3 className="inline-block bg-yonsei-navy px-5 py-2.5 text-base font-bold tracking-tight text-white">
                {s.title}
              </h3>
            )}
            <div
              className={s.title ? 'prose-content prose-wide mt-8' : 'prose-content prose-wide'}
              // 신뢰된 자체 콘텐츠(정적 빌드 시 인라인) — Prose 와 동일
              dangerouslySetInnerHTML={{ __html: marked.parse(s.body) as string }}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
