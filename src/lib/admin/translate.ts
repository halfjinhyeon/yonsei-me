// 관리자 콘솔 번역 클라이언트 — 서버 프록시(/api/translate)를 호출한다.
// 실제 번역(DeepL)과 API 키는 서버 라우트가 처리하므로 여기서는 노출되지 않는다.

/** text 를 target('EN'|'KO') 로 번역해 반환. 실패 시 한국어 메시지로 throw.
 *  html=true 면 DeepL 이 태그를 보존한다(위지윅 본문용). */
export async function translate(text: string, target: 'EN' | 'KO', html = false): Promise<string> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target, html }),
  });
  const data = (await res.json().catch(() => ({}))) as { translation?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || '번역에 실패했습니다.');
  }
  return data.translation ?? '';
}
