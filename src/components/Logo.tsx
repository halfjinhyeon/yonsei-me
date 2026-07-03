import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * 학부 엠블럼 로고.
 * public/logo.svg 를 실제 로고(예: logo.png)로 덮어쓰면 그대로 반영됩니다.
 * 흰색(단색) 마크이므로 어두운 배경 위에서 사용하는 것을 권장합니다.
 */
export function Logo({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      priority
      className={cn('select-none', className)}
    />
  );
}
