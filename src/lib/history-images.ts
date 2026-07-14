import fs from 'node:fs';
import path from 'node:path';

/**
 * 연혁 타임라인 연대별 사진 매칭 (서버 전용 — about 페이지에서 빌드 시 호출).
 * public/img/history/<연도 4자리>.{jpg,png,webp,avif} 파일을 연대(10년 단위)로
 * 매핑한다. 파일명은 연대 시작연도(1960.jpg)든 그 연대의 아무 연도(1964.jpg)든
 * 무방 — 폴더에 파일만 넣으면 해당 연대 옆에 뜨고, 없는 연대는 텍스트만 나온다.
 * (교수 사진과 동일한 "파일명 규약 매칭" 방식 — JSON 수정 불필요)
 */
export function getHistoryImages(): Record<number, string> {
  const dir = path.join(process.cwd(), 'public', 'img', 'history');
  const out: Record<number, string> = {};
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return out; // 폴더가 아직 없으면 빈 맵 — 타임라인은 기존 모습 그대로
  }
  for (const f of files.sort()) {
    const m = f.match(/^(\d{4})\.(jpe?g|png|webp|avif)$/i);
    if (!m) continue;
    const decade = Math.floor(Number(m[1]) / 10) * 10;
    if (!(decade in out)) out[decade] = `/img/history/${f}`;
  }
  return out;
}
