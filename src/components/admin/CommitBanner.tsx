// 저장 성공 배너 — AdminConsole 의 success 배너 마크업을 재사용 컴포넌트로 뽑아낸 것.
// BoardEditor / CollectionEditor / MarkdownEditor 등 여러 편집기가 공유한다.
// url 이 있으면 GitHub 커밋(운영), 없으면 dev 로컬 저장으로 문구를 달리한다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

export function CommitBanner({ message, url }: { message: string; url: string }) {
  return (
    <div
      role="status"
      className="mb-6 rounded-card border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200"
    >
      {url ? (
        <>
          커밋되었습니다. {message}{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            커밋 보기 ↗
          </a>
        </>
      ) : (
        message
      )}
    </div>
  );
}
