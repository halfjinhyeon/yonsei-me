import { Marked } from 'marked';
import { StepRailNav } from '@/components/StepRailNav';

/**
 * 대학원 졸업요건 — "STEP 스크롤" 문법 (참조 시안 + 사이트 공통 문법).
 *  - 좌측: 01~09 번호 목차가 sticky 로 화면을 따라오고(StepRailNav), 클릭 시 해당
 *    STEP 으로 부드럽게 스크롤·스크롤 위치에 따라 활성 항목이 갱신된다(스크롤스파이).
 *  - 우측: 각 STEP = 파란 eyebrow(STEP NN) + 큰 제목 + 리드 문장 + 본문(불릿/표/콜아웃).
 *    헤더 블록은 섹션마다 좌/우 교대 정렬(사용자 지시), 섹션 사이 헤어라인 구분.
 *  - 마크다운 규칙: '####' 헤딩 = STEP 경계, 헤딩 직후 첫 평문 단락 = 리드(헤더로 분리),
 *    인용구(>) = '유의사항' 콜아웃(step-prose 스코프, globals.css).
 * 콘텐츠 출처는 자체 자료(신뢰 소스) — Prose 와 동일하게 정적 인라인 렌더.
 */

const marked = new Marked({ gfm: true, breaks: false }); // Prose 와 동일 설정

interface StepSection {
  id: string;
  num: string;
  title: string;
  lead: string | null;
  html: string;
}

/** '####' 헤딩 단위 분할 + 헤딩 직후 첫 평문 단락(리스트·표·인용·헤딩이 아닌 줄)을
 *  리드로 분리한다. 리드가 없는 섹션은 헤더에 제목만 남는다. */
function parseSteps(md: string): StepSection[] {
  const lines = md.split(/\r?\n/);
  const cuts: { i: number; text: string }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^####\s+(.+)$/);
    if (m) cuts.push({ i, text: m[1].trim() });
  });

  return cuts.map((c, k) => {
    const end = k + 1 < cuts.length ? cuts[k + 1].i : lines.length;
    const body = lines.slice(c.i + 1, end);

    // 리드 추출 — 첫 비공백 줄부터 이어지는 평문 줄 묶음(빈 줄·블록 요소 전까지)
    let lead: string | null = null;
    let s = 0;
    while (s < body.length && body[s].trim() === '') s++;
    if (s < body.length && !/^[-|>#*]/.test(body[s].trim())) {
      const leadLines: string[] = [];
      let e = s;
      while (e < body.length && body[e].trim() !== '' && !/^[-|>#*]/.test(body[e].trim())) {
        leadLines.push(body[e].trim());
        e++;
      }
      lead = leadLines.join(' ');
      body.splice(0, e);
    }

    return {
      id: `grad-step-${k + 1}`,
      num: String(k + 1).padStart(2, '0'),
      title: c.text,
      lead,
      // 신뢰된 자체 콘텐츠(정적 빌드 시 인라인) — Prose 와 동일
      html: marked.parse(body.join('\n').trim()) as string,
    };
  });
}

export function GraduateRequirementSteps({ markdown }: { markdown: string }) {
  const sections = parseSteps(markdown);

  return (
    <div className="mt-2 border-t border-surface-border lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-x-12">
      <StepRailNav items={sections.map(({ id, num, title }) => ({ id, num, title }))} />
      <div className="divide-y divide-surface-border">
        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-h`}
            className="scroll-mt-40 py-12 lg:scroll-mt-36 lg:py-16"
          >
            {/* 헤더 블록 — 짝수(0-base) 왼쪽 / 홀수 오른쪽 교대(사용자 지시) */}
            <div className={i % 2 === 1 ? 'flex flex-col items-end text-right' : ''}>
              <p className="eyebrow">STEP {s.num}</p>
              <h3
                id={`${s.id}-h`}
                className="mt-3 text-2xl font-bold tracking-tight text-content sm:text-3xl"
              >
                {s.title}
              </h3>
              {s.lead && (
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-content-soft sm:text-lg">
                  {s.lead}
                </p>
              )}
            </div>
            <div
              className="prose-content prose-wide step-prose mt-8"
              dangerouslySetInnerHTML={{ __html: s.html }}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
