/**
 * 교재 표지 미러링 — 크롤 JSON 의 표지 URL → public/img/textbooks/<ISBN>.jpg
 *
 * 교보문고 CDN 을 그대로 핫링크하지 않고 저장소로 복사한다(referrer 차단·URL 소멸
 * 리스크 제거, 도메인 컷오버 이미지 미러링 정책과 동일한 이유).
 *
 * 사용법:
 *   node tools/textbooks/mirror-covers.mjs <크롤JSON경로>
 *
 * ⚠️ 교보 CDN 은 표지가 없는 ISBN 에도 HTTP 200 + Content-Type: image/jpeg 로
 *    '이미지 없음' 플레이스홀더를 돌려준다. 실제 바이트는 PNG(정확히 34,150B)라
 *    JPEG 매직바이트로만 걸러낼 수 있다 — 크기·상태코드 검사만으로는 못 잡는다.
 *
 * 플레이스홀더로 판정된 ISBN 은 FALLBACK 에 대체 출처를 명시해 둔다(수기 검수 완료분).
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const OUT_DIR = 'public/img/textbooks';
const KYOBO = (isbn) => `https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/${isbn}.jpg`;

/** 크롤 ISBN 자체가 틀려 '성공하지만 다른 책 표지'가 오는 건 — 무조건 이쪽을 쓴다.
 *  (강의계획서에 적힌 ISBN 이 잘못된 경우. 실패하지 않으므로 FALLBACK 으로는 못 잡는다.) */
const OVERRIDE = {
  // 기계공학창의설계 주교재 '생각의 탄생'(Root-Bernstein, 에코의서재).
  // 계획서 ISBN 9788992717076 은 같은 출판사의 다른 책 '감각의 매혹' 표지를 불러온다.
  // 실제 서지 ISBN 은 9788995688991 — 표지에 부제까지 크롤 서지와 일치함을 확인했다.
  '9788992717076': {
    url: KYOBO('9788995688991'),
    why: '계획서 ISBN 오기 — 생각의 탄생 실제 ISBN 9788995688991',
  },
};

/** 교보에 표지가 없어 다른 출처에서 가져온 건 — 모두 표지 이미지를 눈으로 확인했다.
 *  why 는 '왜 이 URL 이 이 ISBN 의 표지로 타당한가'를 남긴다(다음 갱신 때의 근거). */
const FALLBACK = {
  // 응용열역학 주교재. 교보 미보유 → Open Library. 표지에 저자 4인·9th Edition·Wiley 가
  // 그대로 찍혀 있어 크롤 서지(Moran/Shapiro/Boettner/Bailey, Wiley 2018)와 일치.
  '9781119391388': {
    url: 'https://covers.openlibrary.org/b/id/13163429-L.jpg',
    why: 'Open Library — Fundamentals of Engineering Thermodynamics 9th ed (Wiley)',
  },
  // 메카니즘설계 주교재. 교보는 이 ISBN 미보유 → 같은 책의 SI 단위판(9780071278522)
  // 표지를 쓴다(동일 저자·동일 서명, McGraw-Hill).
  // ※ Open Library 의 9780073529356 표지는 다른 책(Design of Machinery)의 대여 스티커
  //   스캔본이 잘못 연결돼 있다 — 쓰지 말 것.
  '9780073529356': {
    url: KYOBO('9780071278522'),
    why: 'Kinematics and Dynamics of Machinery, SI units ed — 동일 저자·서명',
  },
};

const PLACEHOLDER_BYTES = 34150;

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      Referer: 'https://product.kyobobook.co.kr/',
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error(
      buf.length === PLACEHOLDER_BYTES ? '교보 플레이스홀더(표지 없음)' : 'JPEG 아님',
    );
  }
  if (buf.length < 2000) throw new Error(`너무 작음(${buf.length}B)`);
  return buf;
}

const src = process.argv[2];
if (!src) {
  console.error('사용법: node tools/textbooks/mirror-covers.mjs <크롤JSON경로>');
  process.exit(1);
}

const raw = JSON.parse(await readFile(src, 'utf8'));
const targets = new Map(); // ISBN → 크롤이 준 표지 URL
for (const sem of raw['학기별']) {
  for (const course of sem['과목']) {
    for (const book of course['교재'] ?? []) {
      const isbn = (book['ISBN'] ?? '').trim();
      const url = book['교재표지이미지'];
      if (isbn && url && !targets.has(isbn)) targets.set(isbn, url);
    }
  }
}

await mkdir(OUT_DIR, { recursive: true });

const saved = [];
const failed = [];
for (const [isbn, url] of targets) {
  let buf = null;
  try {
    buf = await get(OVERRIDE[isbn]?.url ?? url);
  } catch (primary) {
    const alt = FALLBACK[isbn];
    if (!alt) {
      failed.push({ isbn, why: primary.message });
      continue;
    }
    try {
      buf = await get(alt.url);
    } catch (secondary) {
      failed.push({ isbn, why: `${primary.message} / 대체도 실패: ${secondary.message}` });
      continue;
    }
  }
  await writeFile(path.join(OUT_DIR, `${isbn}.jpg`), buf);
  saved.push({ isbn, bytes: buf.length, sha: createHash('sha1').update(buf).digest('hex').slice(0, 12) });
}

// 같은 해시가 둘 이상이면 새로운 형태의 플레이스홀더를 통째로 받았다는 뜻 — 반드시 확인
const byHash = new Map();
for (const s of saved) byHash.set(s.sha, [...(byHash.get(s.sha) ?? []), s.isbn]);

console.log(`대상 ${targets.size}건 · 저장 ${saved.length} · 실패 ${failed.length}`);
for (const f of failed) console.log(`  ✗ ${f.isbn} — ${f.why} (FALLBACK 에 대체 출처를 추가하라)`);
for (const [sha, list] of byHash) {
  if (list.length > 1) console.log(`  ⚠ 동일 이미지 ${list.length}건(${sha}) — 플레이스홀더 의심: ${list.join(', ')}`);
}
const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.jpg'));
let total = 0;
for (const f of files) total += (await stat(path.join(OUT_DIR, f))).size;
console.log(`${OUT_DIR}: ${files.length}개 · ${(total / 1024).toFixed(0)}KB`);
