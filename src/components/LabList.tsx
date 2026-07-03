import type { LabDirectoryEntry } from '@/lib/faculty';

/**
 * 연구실 목록 표. 연구실명은 실제 연구실 사이트로 하이퍼링크 연결
 * (링크가 없는 경우 일반 텍스트로 표시). 에디토리얼 톤(굵은 상단 룰 +
 * 헤어라인만)으로 색 블록·지브라 스트라이프 없이 구성.
 */
export function LabList({ items }: { items: LabDirectoryEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b-2 border-yonsei-navy">
          <tr>
            <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-content-faint">
              연구실
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-content-faint">
              지도교수
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-content-faint">
              위치/연락처
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((lab) => (
            <tr key={lab.nameKo} className="border-b border-surface-border last:border-b-0">
              <td className="px-3 py-4 align-top">
                {lab.url ? (
                  <a
                    href={lab.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-yonsei-blue underline-offset-2 hover:underline"
                  >
                    {lab.nameKo}
                    <br />
                    <span className="text-xs text-content-faint">{lab.nameEn}</span>
                  </a>
                ) : (
                  <>
                    <span className="font-medium text-content">{lab.nameKo}</span>
                    <br />
                    <span className="text-xs text-content-faint">{lab.nameEn}</span>
                  </>
                )}
              </td>
              <td className="px-3 py-4 align-top text-content-soft">
                {lab.professorKo}
                <br />
                <span className="text-xs text-content-faint">{lab.professorEn}</span>
              </td>
              <td className="px-3 py-4 align-top text-content-soft">
                {lab.location}
                {lab.phone && (
                  <>
                    <br />
                    <span className="text-xs text-content-faint">{lab.phone}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
