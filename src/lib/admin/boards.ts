// 관리자 콘솔이 다루는 게시판 정의와 편집용 레코드 형태.
// content.ts의 실제 타입(Notice/Seminar/EventItem/NewsItem/Attachment/Localized)을
// 재사용해 사이트와 형태를 일치시킨다.

import type {
  Attachment,
  EventItem,
  NewsItem,
  Notice,
  Seminar,
} from '@/lib/content';

/** board.json 파일 전체 형태 (content.ts의 board와 동일) */
export interface BoardFile {
  seminars: Seminar[];
  events: EventItem[];
  noticesUndergrad: Notice[];
  noticesGraduate: Notice[];
  thesis: Notice[];
  career: Notice[];
  resources: Notice[];
  alumniEvents: Seminar[];
}

/** 어드민에서 선택 가능한 게시판 키 */
export type BoardKey =
  | 'noticesUndergrad'
  | 'noticesGraduate'
  | 'noticesExternal'
  | 'noticesScholarship'
  | 'news'
  | 'seminars'
  | 'events'
  | 'thesis'
  | 'career'
  | 'resources'
  | 'alumniNews'
  | 'alumniEvents';

/** 편집 폼이 다루는 통합 레코드. 게시판에 따라 일부 필드만 사용된다. */
export interface EditRecord {
  id: string; // board.json 항목의 id, 뉴스는 slug를 여기에 담는다
  date: string;
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
  // 세미나 전용
  hostKo?: string;
  hostEn?: string;
  // 행사 전용
  dateLabelKo?: string;
  dateLabelEn?: string;
  // 동문 소식·네트워크 전용 — 특정 날짜가 정해진 행사인지(체크 시 캘린더 '동문'에 표시)
  isEvent?: boolean;
  // 뉴스 전용
  category?: NewsItem['category'];
  excerptKo?: string;
  excerptEn?: string;
  image?: string;
  attachments: EditAttachment[];
}

export interface EditAttachment {
  labelKo: string;
  labelEn: string;
  href: string;
}

export interface BoardMeta {
  key: BoardKey;
  /** 한국어 UI 라벨 (내부 도구라 직접 표기) */
  label: string;
  /** 이 게시판이 사는 파일 */
  file: 'board.json' | 'news.json';
  /** 새 글 id 접두어 (실제 컨벤션 기반) */
  idPrefix: string;
  hasHost: boolean;
  hasDateLabel: boolean;
  isNews: boolean;
  /** true면 '날짜' 필드를 "행사 일정"으로 안내한다(그 날짜로 금주 캘린더에 표시됨) */
  dateIsEvent?: boolean;
  /** true면 "특정 날짜 행사" 체크박스를 노출한다(체크 시 캘린더 '동문'에 표시) */
  hasEventFlag?: boolean;
  /** isNews 게시판이 읽고 쓰는 뉴스 파일 경로 (기본 'content/news.json'). 동문 뉴스처럼 별도 파일을 쓰는 뉴스형 게시판에서 지정 */
  newsFile?: string;
}

/** content/*.json 실제 id·slug 컨벤션에 맞춘 게시판 목록 */
export const BOARDS: BoardMeta[] = [
  { key: 'noticesUndergrad', label: '학부 공지', file: 'board.json', idPrefix: 'nu-', hasHost: false, hasDateLabel: false, isNews: false },
  { key: 'noticesGraduate', label: '대학원 공지', file: 'board.json', idPrefix: 'ng-', hasHost: false, hasDateLabel: false, isNews: false },
  { key: 'noticesExternal', label: '외부기관 공지', file: 'board.json', idPrefix: 'nx-', hasHost: false, hasDateLabel: false, isNews: false },
  { key: 'noticesScholarship', label: '장학생 선발공고', file: 'board.json', idPrefix: 'nsch-', hasHost: false, hasDateLabel: false, isNews: false },
  { key: 'news', label: '뉴스', file: 'news.json', idPrefix: '', hasHost: false, hasDateLabel: false, isNews: true },
  { key: 'seminars', label: '세미나', file: 'board.json', idPrefix: 'sem-', hasHost: true, hasDateLabel: false, isNews: false },
  { key: 'events', label: '행사', file: 'board.json', idPrefix: 'evt-', hasHost: false, hasDateLabel: true, isNews: false, dateIsEvent: true },
  { key: 'thesis', label: '학위논문심사', file: 'board.json', idPrefix: 'th-', hasHost: false, hasDateLabel: false, isNews: false },
  { key: 'resources', label: '자료실', file: 'board.json', idPrefix: 'res-', hasHost: false, hasDateLabel: false, isNews: false },
  { key: 'career', label: '취업 정보', file: 'board.json', idPrefix: 'cr-', hasHost: false, hasDateLabel: false, isNews: false },
  { key: 'alumniNews', label: '동문 뉴스', file: 'news.json', idPrefix: '', hasHost: false, hasDateLabel: false, isNews: true, newsFile: 'content/alumni-news.json' },
  { key: 'alumniEvents', label: '동문 소식·네트워크', file: 'board.json', idPrefix: 'ae-', hasHost: true, hasDateLabel: false, isNews: false, hasEventFlag: true },
];

export function getBoard(key: BoardKey): BoardMeta {
  const found = BOARDS.find((b) => b.key === key);
  if (!found) throw new Error(`알 수 없는 게시판: ${key}`);
  return found;
}

/** 빈 attachment 한 줄 */
export function emptyAttachment(): EditAttachment {
  return { labelKo: '', labelEn: '', href: '' };
}

/** 오늘 날짜 YYYY-MM-DD (로컬 기준) */
export function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 게시판 접두어 컨벤션(nu-1, ng-2, sem-3 ...)에 맞춰 다음 id를 제안한다.
 * 뉴스는 slug 컨벤션이 자유형이라 날짜 기반 임시 slug를 제안한다.
 */
export function suggestId(meta: BoardMeta, existingIds: string[]): string {
  if (meta.isNews) {
    // 뉴스 slug: 날짜 기반. 같은 날 중복이면 -2, -3… 카운터를 붙여 고유화.
    const base = `${today()}-post`;
    if (!existingIds.includes(base)) return base;
    let i = 2;
    while (existingIds.includes(`${base}-${i}`)) i += 1;
    return `${base}-${i}`;
  }
  const prefix = meta.idPrefix;
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const n = Number.parseInt(id.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
}

// ---- 도메인 레코드 ↔ 편집 레코드 변환 ----

function attsToEdit(atts?: Attachment[]): EditAttachment[] {
  return (atts ?? []).map((a) => ({ labelKo: a.label.ko, labelEn: a.label.en, href: a.href }));
}

/** board.json 내 임의 레코드를 편집 폼 형태로 */
export function toEditRecord(meta: BoardMeta, raw: unknown): EditRecord {
  const r = raw as Record<string, unknown>;
  const loc = (v: unknown): { ko: string; en: string } => {
    const o = (v as { ko?: string; en?: string } | undefined) ?? {};
    return { ko: o.ko ?? '', en: o.en ?? '' };
  };
  const title = loc(r.title);
  const body = loc(r.body);
  const base: EditRecord = {
    id: String(r.id ?? r.slug ?? ''),
    date: String(r.date ?? ''),
    titleKo: title.ko ?? '',
    titleEn: title.en ?? '',
    bodyKo: body.ko ?? '',
    bodyEn: body.en ?? '',
    attachments: attsToEdit(r.attachments as Attachment[] | undefined),
  };
  if (meta.hasHost) {
    const host = loc(r.host);
    base.hostKo = host.ko ?? '';
    base.hostEn = host.en ?? '';
  }
  if (meta.hasDateLabel) {
    const dl = loc(r.dateLabel);
    base.dateLabelKo = dl.ko ?? '';
    base.dateLabelEn = dl.en ?? '';
  }
  if (meta.hasEventFlag) {
    base.isEvent = r.isEvent === true;
  }
  if (meta.isNews) {
    const excerpt = loc(r.excerpt);
    base.category = (r.category as NewsItem['category']) ?? 'notice';
    base.excerptKo = excerpt.ko ?? '';
    base.excerptEn = excerpt.en ?? '';
  }
  // 대표 이미지(썸네일)는 모든 게시판 공통 — 에디토리얼 목록의 우측 썸네일
  base.image = String(r.image ?? '');
  return base;
}

/** en이 비면 ko로 채운다 (pick의 en 폴백이 `?? `라 빈 문자열은 폴백 안 됨) */
function localized(ko: string, en: string): { ko: string; en: string } {
  const k = ko.trim();
  const e = en.trim();
  return { ko: k, en: e === '' ? k : e };
}

function editToAtts(atts: EditAttachment[]): Attachment[] | undefined {
  const filled = atts.filter((a) => a.href.trim() !== '' || a.labelKo.trim() !== '');
  if (filled.length === 0) return undefined;
  return filled.map((a) => ({ label: localized(a.labelKo, a.labelEn), href: a.href.trim() }));
}

/** 편집 레코드를 board.json에 넣을 Notice/Seminar/EventItem으로 */
export function toBoardEntry(meta: BoardMeta, rec: EditRecord): Notice | Seminar | EventItem {
  const attachments = editToAtts(rec.attachments);
  const common = {
    id: rec.id.trim(),
    date: rec.date,
    title: localized(rec.titleKo, rec.titleEn),
    body: localized(rec.bodyKo, rec.bodyEn),
    ...(attachments ? { attachments } : {}),
  };
  if (meta.hasHost) {
    return {
      ...common,
      host: localized(rec.hostKo ?? '', rec.hostEn ?? ''),
      // 동문 소식·네트워크: 체크 시에만 isEvent:true 저장(캘린더 '동문' 표시). 미체크는 키 생략.
      ...(meta.hasEventFlag && rec.isEvent ? { isEvent: true } : {}),
    } as Seminar;
  }
  if (meta.hasDateLabel) {
    return { ...common, dateLabel: localized(rec.dateLabelKo ?? '', rec.dateLabelEn ?? '') } as EventItem;
  }
  return common as Notice;
}

/** 편집 레코드를 news.json에 넣을 NewsItem으로 */
export function toNewsEntry(rec: EditRecord): NewsItem {
  const attachments = editToAtts(rec.attachments);
  return {
    slug: rec.id.trim(),
    category: rec.category ?? 'notice',
    date: rec.date,
    title: localized(rec.titleKo, rec.titleEn),
    excerpt: localized(rec.excerptKo ?? '', rec.excerptEn ?? ''),
    body: localized(rec.bodyKo, rec.bodyEn),
    image: (rec.image ?? '').trim(),
    ...(attachments ? { attachments } : {}),
  };
}

/**
 * 게시판 이동용: 원본 레코드를 대상 게시판이 요구하는 형태로 변환한다.
 * 공통 필드(날짜·제목·본문·첨부)는 유지하고, 대상 게시판에만 있는 필드는
 * 원본에 해당 값이 있으면 승계하고 없으면 기본값으로 채운다. 대상에 없는
 * 필드는 아예 넣지 않아 이동 시 자연스럽게 탈락한다(주최·분류·요약 등).
 * id는 대상 게시판 규칙으로 새로 부여해야 하므로 여기선 원본 값을 그대로 둔다.
 */
export function convertRecordForBoard(
  source: BoardMeta,
  target: BoardMeta,
  raw: unknown,
): EditRecord {
  // 원본을 먼저 편집 레코드로 읽어 공통 필드를 확보한다.
  const src = toEditRecord(source, raw);
  const rec: EditRecord = {
    id: src.id,
    date: src.date,
    titleKo: src.titleKo,
    titleEn: src.titleEn,
    bodyKo: src.bodyKo,
    bodyEn: src.bodyEn,
    attachments: src.attachments,
  };
  if (target.hasHost) {
    // 원본에 주최가 있으면 승계, 없으면 빈 값.
    rec.hostKo = src.hostKo ?? '';
    rec.hostEn = src.hostEn ?? '';
  }
  if (target.hasDateLabel) {
    rec.dateLabelKo = src.dateLabelKo ?? '';
    rec.dateLabelEn = src.dateLabelEn ?? '';
  }
  if (target.hasEventFlag) {
    rec.isEvent = src.isEvent === true;
  }
  if (target.isNews) {
    // 원본도 뉴스면 분류를 승계, 아니면 기본 'notice'. (toEditRecord는 뉴스가
    // 아닌 원본에는 category를 채우지 않으므로 ?? 폴백으로 안전하다.)
    rec.category = src.category ?? 'notice';
    rec.excerptKo = src.excerptKo ?? '';
    rec.excerptEn = src.excerptEn ?? '';
  }
  // 대표 이미지는 모든 게시판 공통 — 이동해도 항상 승계
  rec.image = src.image ?? '';
  return rec;
}
