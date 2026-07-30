import { Marked } from 'marked';
import { StepRailNav } from '@/components/StepRailNav';
import { LandingScope } from '@/components/LandingScope';

/**
 * 대학원 졸업요건 — "STEP 스크롤" 문법 (참조 시안 + 사이트 공통 문법).
 *  - 좌측: 01~09 번호 목차가 sticky 로 화면을 따라오고(StepRailNav), 클릭 시 해당
 *    STEP 으로 부드럽게 스크롤·스크롤 위치에 따라 활성 항목이 갱신된다(스크롤스파이).
 *  - 우측: 각 STEP = 네이비 박스 헤더(STEP NN · 제목 — 학부 '나의 졸업요건' StepLabel 과
 *    동일 디자인·폰트) + 리드 문장 + 본문(불릿/표/콜아웃). 헤더 블록은 모든 섹션이 왼쪽
 *    정렬 + 왼쪽 여백 인셋(사용자 지시), 섹션 사이 헤어라인 구분.
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
    // tab(700px)+: 좌측 레일 그리드 — 아이패드 미니·갤럭시 탭 세로에서도 PC 레이아웃(사용자 지시)
    // 탭 진입 랜딩 — 좌측 목차가 먼저 서고 → 장식 유선이 그려지고 → 첫 STEP 헤더가 채워진다.
    // (LandingScope 는 display:contents 라 아래 grid 배치에 영향이 없다)
    <LandingScope name="graduate-requirements">
    <div className="mt-2 border-t border-surface-border tab:grid tab:grid-cols-[12.5rem_minmax(0,1fr)] tab:gap-x-8 lg:gap-x-12">
      <StepRailNav items={sections.map(({ id, num, title }) => ({ id, num, title }))} />
      <div className="divide-y divide-surface-border">
        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-h`}
            className="scroll-mt-40 py-12 tab:scroll-mt-36 tab:py-16"
          >
            {/* 헤더 블록 — 학부 '나의 졸업요건' StepLabel 과 동일한 네이비 박스(STEP NN · 제목).
                모든 섹션 왼쪽 정렬 + 왼쪽 여백 인셋(좌/우 교대는 폐기 — 사용자 지시). */}
            <div className="tab:pl-12">
              <h3
                id={`${s.id}-h`}
                data-land="wipe"
                data-land-order={10 + i}
                className="inline-block bg-yonsei-navy px-3.5 py-1.5 text-sm font-bold text-white"
              >
                STEP {s.num} <span className="mx-1 opacity-60">·</span> {s.title}
              </h3>
              {s.lead && (
                <p
                  data-land="rise"
                  data-land-order={10 + i}
                  className="mt-4 max-w-2xl text-base leading-relaxed text-content-soft sm:text-lg"
                >
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
    </LandingScope>
  );
}
