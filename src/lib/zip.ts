/**
 * 무압축(stored) ZIP 라이터 — 의존성 0.
 *
 * 왜 압축을 하지 않나: 이 저장소가 묶는 대상은 게시판 첨부(pdf·hwp·hwpx·docx·xlsx·zip)라
 * 이미 내부적으로 압축돼 있다. deflate 를 걸어도 크기 이득은 보통 1~3%인데,
 * 그 대가로 zlib 스트리밍·CRC 동기화 같은 복잡도를 떠안게 된다. 반면 stored(방식 0)는
 * "헤더 + 원본 바이트" 뿐이라 표준 라이브러리조차 필요 없이 정확하게 짤 수 있다.
 *
 * 구조(PKWARE APPNOTE 4.3):
 *   [로컬 파일 헤더 + 파일 데이터] × N  →  [중앙 디렉터리 헤더] × N  →  EOCD
 * 모든 정수는 리틀엔디언. 파일마다 바이트를 미리 다 알고 있으므로 데이터 디스크립터
 * (크기를 데이터 뒤에 붙이는 스트리밍용 장치)는 쓰지 않는다 — 헤더에 바로 채우는 쪽이
 * 옛 압축 해제기까지 포함해 호환성이 좋다.
 *
 * 한글 파일명: general purpose flag 의 bit 11(0x0800)을 세워 "파일명은 UTF-8" 이라고
 * 명시한다. 이 비트가 없으면 압축 해제기가 이름을 CP437/CP949 로 읽어 한글이 깨진다.
 */

/** ZIP 에 넣을 파일 하나 */
export interface ZipEntry {
  /** 아카이브 안에서 보일 파일명(디렉터리 없는 평면 구조) */
  name: string;
  /** 파일 내용 전체 */
  data: Uint8Array;
}

// ── CRC-32 ────────────────────────────────────────────────────────────
// ZIP 은 각 파일의 CRC-32(다항식 0xEDB88320, 반사형)를 헤더에 요구한다.
// 256엔트리 테이블을 한 번만 만들어 재사용한다(모듈 수명 동안 캐시).
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    // 비트 8번 접기 — 최하위 비트가 1이면 다항식을 XOR
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** 바이트 배열의 CRC-32 (부호 없는 32비트) */
export function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff; // 초기값 전부 1
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0; // 최종 보수
}

// ── 파일명 정리 ────────────────────────────────────────────────────────
// 압축 해제기는 이름에 든 경로 구분자를 디렉터리로 해석한다(zip slip 류의 원인).
// 첨부 라벨을 그대로 쓰는 구조이므로 여기서 평면 파일명으로 못박는다.
const NAME_MAX = 120; // Windows 경로 길이 여유 — 너무 긴 라벨은 잘라 넣는다

function sanitizeName(raw: string): string {
  let name = (raw ?? '')
    .replace(/[/\\:]/g, '_') // 경로 구분자·드라이브 콜론
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, '_') // 제어문자(줄바꿈 포함)
    .replace(/^[\s.]+|[\s.]+$/g, ''); // 앞뒤 공백·점 (".." 및 Windows 의 끝점 금지 대응)
  if (name === '') name = 'file';
  if (name.length > NAME_MAX) {
    // 자를 때도 확장자는 살린다 — 확장자가 사라지면 열리지 않는다
    const { base, ext } = splitExt(name);
    name = base.slice(0, Math.max(1, NAME_MAX - ext.length)) + ext;
  }
  return name;
}

/** "보고서.hwp" → { base:"보고서", ext:".hwp" }. 확장자가 없으면 ext 는 빈 문자열 */
function splitExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  // 0번째 점은 확장자가 아니라 숨김 파일(".gitignore") — 통째로 base 로 본다
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * 같은 이름이 여러 번 나오면 확장자 앞에 번호를 붙여 유일하게 만든다.
 * ZIP 자체는 중복 이름을 허용하지만, 풀면 서로 덮어써 파일이 사라진다.
 * 대조는 소문자로 한다 — Windows·macOS 파일 시스템이 대소문자를 구분하지 않아
 * "자료.PDF" 와 "자료.pdf" 가 충돌하기 때문.
 */
function uniquify(name: string, used: Set<string>): string {
  const key = name.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return name;
  }
  const { base, ext } = splitExt(name);
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    const candidateKey = candidate.toLowerCase();
    if (!used.has(candidateKey)) {
      used.add(candidateKey);
      return candidate;
    }
  }
}

// ── 바이트 쓰기 헬퍼 ───────────────────────────────────────────────────
// DataView 로 리틀엔디언을 명시한다(플랫폼 엔디언에 기대지 않기 위해).
function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}
function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

// 고정 상수들
const SIG_LOCAL = 0x04034b50; // 로컬 파일 헤더
const SIG_CENTRAL = 0x02014b50; // 중앙 디렉터리 헤더
const SIG_EOCD = 0x06054b50; // End Of Central Directory
const VERSION = 20; // 2.0 — stored/deflate 를 아는 최소 버전
const FLAG_UTF8 = 0x0800; // bit 11: 파일명이 UTF-8
const METHOD_STORED = 0; // 압축 없음
// 수정 시각은 고정값(1980-01-01 00:00)으로 둔다. Date.now() 를 쓰면 같은 입력이
// 매번 다른 바이트를 내어 재현·비교·캐시가 불가능해진다. DOS 날짜는 1980년이 0년도라
// 연=0,월=1,일=1 → (0<<9)|(1<<5)|1 = 0x0021 이 최소 유효값이다.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const EOCD_SIZE = 22;

/**
 * 엔트리 목록을 그대로 담은 무압축 ZIP 바이트를 만든다.
 * 입력 순서가 아카이브 순서다. 파일명은 정규화·중복 해소 후 UTF-8 로 저장된다.
 */
// 반환 타입에 <ArrayBuffer> 를 명시하는 이유: Response 의 BodyInit 은
// ArrayBufferView<ArrayBuffer> 만 받는다(SharedArrayBuffer 뷰는 거부). 기본형인
// Uint8Array<ArrayBufferLike> 로 두면 그대로 응답 본문에 넘길 수 없다.
export function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const used = new Set<string>();

  // 1단계: 이름 확정 + CRC 계산 + 전체 길이 산정 (한 번만 순회해 버퍼를 한 번에 잡는다)
  const prepared = entries.map((entry) => {
    const name = uniquify(sanitizeName(entry.name), used);
    const nameBytes = encoder.encode(name);
    return {
      nameBytes,
      data: entry.data,
      crc: crc32(entry.data),
      offset: 0, // 2단계에서 채움 — 중앙 디렉터리가 로컬 헤더 위치를 가리켜야 한다
    };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const p of prepared) {
    localSize += LOCAL_HEADER_SIZE + p.nameBytes.length + p.data.length;
    centralSize += CENTRAL_HEADER_SIZE + p.nameBytes.length;
  }

  const out = new Uint8Array(localSize + centralSize + EOCD_SIZE);
  const view = new DataView(out.buffer);
  let pos = 0;

  // 2단계: 로컬 파일 헤더 + 데이터
  for (const p of prepared) {
    p.offset = pos;
    u32(view, pos, SIG_LOCAL);
    u16(view, pos + 4, VERSION); // version needed to extract
    u16(view, pos + 6, FLAG_UTF8);
    u16(view, pos + 8, METHOD_STORED);
    u16(view, pos + 10, DOS_TIME);
    u16(view, pos + 12, DOS_DATE);
    u32(view, pos + 14, p.crc);
    u32(view, pos + 18, p.data.length); // compressed size = 원본 크기(stored)
    u32(view, pos + 22, p.data.length); // uncompressed size
    u16(view, pos + 26, p.nameBytes.length);
    u16(view, pos + 28, 0); // extra field 없음
    pos += LOCAL_HEADER_SIZE;
    out.set(p.nameBytes, pos);
    pos += p.nameBytes.length;
    out.set(p.data, pos);
    pos += p.data.length;
  }

  // 3단계: 중앙 디렉터리 — 로컬 헤더의 사본 + 위치 정보
  const centralStart = pos;
  for (const p of prepared) {
    u32(view, pos, SIG_CENTRAL);
    u16(view, pos + 4, VERSION); // version made by
    u16(view, pos + 6, VERSION); // version needed
    u16(view, pos + 8, FLAG_UTF8);
    u16(view, pos + 10, METHOD_STORED);
    u16(view, pos + 12, DOS_TIME);
    u16(view, pos + 14, DOS_DATE);
    u32(view, pos + 16, p.crc);
    u32(view, pos + 20, p.data.length);
    u32(view, pos + 24, p.data.length);
    u16(view, pos + 28, p.nameBytes.length);
    u16(view, pos + 30, 0); // extra field 길이
    u16(view, pos + 32, 0); // 코멘트 길이
    u16(view, pos + 34, 0); // 시작 디스크 번호 (단일 파일이므로 0)
    u16(view, pos + 36, 0); // internal attributes — 전부 바이너리 취급
    u32(view, pos + 38, 0); // external attributes — 파일 권한 비워둠
    u32(view, pos + 42, p.offset); // 해당 로컬 헤더의 오프셋
    pos += CENTRAL_HEADER_SIZE;
    out.set(p.nameBytes, pos);
    pos += p.nameBytes.length;
  }

  // 4단계: EOCD — 압축 해제기가 파일 끝에서 거꾸로 찾는 색인
  u32(view, pos, SIG_EOCD);
  u16(view, pos + 4, 0); // 이 디스크 번호
  u16(view, pos + 6, 0); // 중앙 디렉터리가 있는 디스크
  u16(view, pos + 8, prepared.length); // 이 디스크의 엔트리 수
  u16(view, pos + 10, prepared.length); // 전체 엔트리 수
  u32(view, pos + 12, centralSize);
  u32(view, pos + 16, centralStart); // 중앙 디렉터리 시작 오프셋
  u16(view, pos + 20, 0); // 아카이브 코멘트 없음

  return out;
}
