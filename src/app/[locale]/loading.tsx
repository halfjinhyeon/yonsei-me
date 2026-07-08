import { EagleLoader } from '@/components/EagleLoader';

/** 라우트 전환/컴파일 중 표시되는 세그먼트 로딩 화면 — 독수리 스피너 중앙 배치 */
export default function Loading() {
  return (
    <div className="grid min-h-[60vh] w-full place-items-center">
      <EagleLoader />
    </div>
  );
}
