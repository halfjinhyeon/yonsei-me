import { Marked } from 'marked';
import { cn } from '@/lib/utils';

const marked = new Marked({ gfm: true, breaks: false });

/**
 * 헤딩(h1~h4)의 첫 단어를 <em class="lead">로 감싸 이탤릭 세리프 대비를 준다
 * (Cornell식 "our agreements" 타이포). 단어가 하나뿐이거나 ※/괄호/숫자로
 * 시작하는 헤딩(주석·표 제목류)은 그대로 둔다.
 */
function accentHeadings(html: string): string {
  return html.replace(/<h([1-4])>([^<]+)<\/h\1>/g, (match, level, text) => {
    const trimmed = text.trim();
    const words = trimmed.split(/\s+/);
    if (words.length < 2 || /^[※\[\d(]/.test(trimmed)) return match;
    const [first, ...rest] = words;
    return `<h${level}><em class="lead">${first}</em> ${rest.join(' ')}</h${level}>`;
  });
}

/**
 * 임포트한 마크다운 본문을 브랜드 톤의 타이포로 렌더한다.
 * 콘텐츠 출처는 우리(학부) 자체 자료이므로 신뢰 소스로 다룬다.
 */
export function Prose({ markdown, className }: { markdown: string; className?: string }) {
  const html = accentHeadings(marked.parse(markdown) as string);
  return (
    <div
      className={cn('prose-content', className)}
      // 신뢰된 자체 콘텐츠(정적 빌드 시 인라인)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
