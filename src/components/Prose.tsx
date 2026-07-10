import { Marked } from 'marked';
import { cn } from '@/lib/utils';

const marked = new Marked({ gfm: true, breaks: false });

/**
 * 임포트한 마크다운 본문을 브랜드 톤의 타이포로 렌더한다.
 * 콘텐츠 출처는 우리(학부) 자체 자료이므로 신뢰 소스로 다룬다.
 */
export function Prose({ markdown, className }: { markdown: string; className?: string }) {
  const html = marked.parse(markdown) as string;
  return (
    <div
      className={cn('prose-content', className)}
      // 신뢰된 자체 콘텐츠(정적 빌드 시 인라인)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
