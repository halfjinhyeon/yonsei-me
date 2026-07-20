// 관리자 콘솔 리소스 스키마 — 게시판 외 "수정 가능한 모든 콘텐츠"의 선언적 정의.
// CollectionEditor/RecordForm 이 이 스키마를 읽어 목록·폼·직렬화를 자동 구성한다.
// 새 콘텐츠를 콘솔에 추가하려면 이 파일에 ResourceDef 하나를 더하면 된다.
// (한국어 UI 문자열은 내부 운영 도구라 모듈에 직접 둔다.)

import type { BoardKey } from '@/lib/admin/boards';

// ---- 폼 값 모델 ----
// RecordForm 이 다루는 평면 값: 필드 kind 에 따라 문자열 / 한·영 쌍 / 문자열 배열.

export type LocalizedPair = { ko: string; en: string };
export type FormValue = string | boolean | LocalizedPair | string[];
export type FormRecord = Record<string, FormValue>;

export interface SelectOption {
  value: string;
  label: string;
}

// ---- 필드 정의 ----

interface FieldBase {
  key: string;
  label: string;
  /** 입력 아래 보조 설명 */
  hint?: string;
  placeholder?: string;
  /** 저장 시 필수 검증 (localized 는 한국어 값 기준) */
  required?: boolean;
  /** 폼 그리드 폭 (기본 full) */
  width?: 'full' | 'half' | 'third';
  /**
   * 빈 값 저장 방식 (문자열 계열 전용).
   * 'null' → null 로 저장 (원본 JSON 이 null 을 쓰는 필드),
   * 'omit' → 키 자체를 생략 (옵셔널 필드), 기본 → 빈 문자열 유지.
   */
  emptyAs?: 'null' | 'omit';
}

export type FieldDef =
  | (FieldBase & { kind: 'text'; readOnlyOnEdit?: boolean })
  | (FieldBase & { kind: 'textarea'; rows?: number })
  | (FieldBase & { kind: 'localized'; multiline?: boolean; rows?: number })
  | (FieldBase & { kind: 'select'; options: SelectOption[]; emptyOptionLabel?: string })
  | (FieldBase & { kind: 'month' })
  | (FieldBase & { kind: 'checkbox' }) // 불리언 체크박스 (true/false 저장)
  | (FieldBase & { kind: 'image' }) // 경로 문자열 + 미리보기
  | (FieldBase & { kind: 'imageList' }) // 경로 문자열 배열
  // 파일 업로드 → 저장소 커밋 후 공개 URL 을 값으로 저장.
  // folder: 커밋 대상 폴더(저장소 루트 기준), fileNameFrom: 파일명으로 쓸 폼 필드 key
  | (FieldBase & { kind: 'imageUpload'; folder: string; fileNameFrom: string });

// ---- 리소스 정의 ----

export interface ListColumn {
  key: string;
  label: string;
}

export interface LinkedMarkdown {
  label: string;
  hint?: string;
  /** 항목별 연결 마크다운 파일 경로 (저장소 루트 기준) */
  pathOf: (form: FormRecord) => string;
  /** 지정 시 원문 textarea 대신 전용 구조 편집기를 함께 제공한다 */
  structured?: 'clubCards';
}

export interface ResourceDef {
  key: ResourceKey;
  /** 사이드바·제목 라벨 */
  label: string;
  /** 어느 페이지에 반영되는지 관리자에게 보여줄 안내 */
  description: string;
  /** 저장소 루트 기준 파일 경로 */
  file: string;
  /** array: JSON 배열 / record: idField 값을 키로 하는 객체 (course-descriptions) */
  format: 'array' | 'record';
  /** format==='record' 일 때 직렬화 키가 되는 필드 */
  idField?: string;
  listColumns: ListColumn[];
  /** 목록 검색 대상 필드 키 */
  searchKeys: string[];
  fields: FieldDef[];
  /** 배열 순서가 사이트 노출 순서일 때 ▲▼ 이동·순서 저장 노출 */
  orderable: boolean;
  /** 항목별 연결 마크다운 (동아리 소개 본문) */
  linkedMarkdown?: LinkedMarkdown;
  /** 도메인 레코드 → 폼 값 (기본: defaultToForm) */
  toForm?: (raw: unknown) => FormRecord;
  /** 폼 값 → 도메인 레코드 (기본: defaultFromForm) */
  fromForm?: (form: FormRecord) => unknown;
  /** 커밋 메시지에 넣을 항목 한 줄 요약 */
  summarize: (form: FormRecord) => string;
}

export type ResourceKey =
  | 'history'
  | 'facultyDirectory'
  | 'staff'
  | 'coursesUndergraduate'
  | 'courseDescriptions'
  | 'coursesGraduate'
  | 'clubs'
  | 'labs';

// ---- 변환 헬퍼 ----

/** en 이 비면 ko 를 복사한다 (pick 의 en 폴백이 `??` 라 빈 문자열은 폴백 안 됨) */
export function localizedValue(ko: string, en: string): LocalizedPair {
  const k = ko.trim();
  const e = en.trim();
  return { ko: k, en: e === '' ? k : e };
}

/** 도메인 레코드를 필드 정의 기준의 평면 폼 값으로 */
export function defaultToForm(fields: FieldDef[], raw: unknown): FormRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  const form: FormRecord = {};
  for (const f of fields) {
    if (f.kind === 'localized') {
      const v = (r[f.key] ?? {}) as Partial<LocalizedPair>;
      form[f.key] = { ko: v.ko ?? '', en: v.en ?? '' };
    } else if (f.kind === 'imageList') {
      const v = r[f.key];
      form[f.key] = Array.isArray(v) ? v.map(String) : [];
    } else if (f.kind === 'checkbox') {
      form[f.key] = r[f.key] === true;
    } else {
      const v = r[f.key];
      form[f.key] = v == null ? '' : String(v);
    }
  }
  return form;
}

/** 폼 값을 도메인 레코드로 (키 순서 = 필드 정의 순서 → JSON diff 최소화) */
export function defaultFromForm(fields: FieldDef[], form: FormRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'localized') {
      const v = (form[f.key] ?? { ko: '', en: '' }) as LocalizedPair;
      out[f.key] = localizedValue(v.ko, v.en);
    } else if (f.kind === 'imageList') {
      const arr = ((form[f.key] ?? []) as string[]).map((s) => s.trim()).filter(Boolean);
      if (arr.length > 0 || f.emptyAs !== 'omit') out[f.key] = arr;
    } else if (f.kind === 'checkbox') {
      out[f.key] = form[f.key] === true;
    } else {
      const s = String(form[f.key] ?? '').trim();
      if (s === '') {
        if (f.emptyAs === 'null') out[f.key] = null;
        else if (f.emptyAs !== 'omit') out[f.key] = '';
      } else {
        out[f.key] = s;
      }
    }
  }
  return out;
}

/** 필수 필드 검증. 통과하면 null, 실패하면 한국어 오류 메시지 */
export function validateForm(fields: FieldDef[], form: FormRecord): string | null {
  for (const f of fields) {
    if (!f.required) continue;
    const v = form[f.key];
    if (f.kind === 'localized') {
      if (!((v as LocalizedPair | undefined)?.ko ?? '').trim()) {
        return `${f.label}(한국어)를 입력하세요.`;
      }
    } else if (typeof v === 'string' && v.trim() === '') {
      return `${f.label}을(를) 입력하세요.`;
    }
  }
  return null;
}

/** 목록 셀·검색용 표시 문자열 */
export function cellText(form: FormRecord, key: string): string {
  const v = form[key];
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '예' : '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length > 0 ? `${v.length}개` : '';
  return v.ko || v.en || '';
}

// ---- record(키-객체) 직렬화 (course-descriptions.json) ----

/** { code: {...} } 객체를 idField 를 포함한 레코드 배열로 */
export function recordToArray(
  data: Record<string, Record<string, unknown>>,
  idField: string,
): Record<string, unknown>[] {
  return Object.entries(data).map(([k, v]) => ({ [idField]: k, ...v }));
}

/** 레코드 배열을 idField 값을 키로 하는 객체로 (삽입 순서 유지) */
export function arrayToRecord(
  arr: Record<string, unknown>[],
  idField: string,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const item of arr) {
    const { [idField]: key, ...rest } = item;
    out[String(key)] = rest;
  }
  return out;
}

// ---- 공통 옵션 ----

/** 6개 연구 분야 라벨 — messages/ko.json research.fieldFilter 와 동일 표기 */
export const FIELD_OPTIONS: SelectOption[] = [
  { value: 'bioNano', label: '바이오·나노' },
  { value: 'thermoFluid', label: '열·유체' },
  { value: 'dynamicsControl', label: '동역학·제어' },
  { value: 'manufacturingDesign', label: '생산·설계' },
  { value: 'computation', label: '계산·해석' },
  { value: 'mechanicsMaterials', label: '역학·재료' },
];

// ---- 리소스 정의 목록 ----

// 교수진: lab 중첩 객체를 labNameKo/labNameEn/labUrl 로 평면화해 편집한다.
const FACULTY_BASE_FIELDS: FieldDef[] = [
  { kind: 'text', key: 'name', label: '이름', required: true, width: 'third' },
  { kind: 'text', key: 'title', label: '직급', required: true, width: 'third', placeholder: 'Professor', hint: 'Professor / Associate Professor / Assistant Professor' },
  { kind: 'text', key: 'role', label: '보직', width: 'third', emptyAs: 'null', hint: '학부장 등. 없으면 비움' },
  { kind: 'text', key: 'email', label: '이메일', width: 'half', emptyAs: 'null' },
  { kind: 'text', key: 'phone', label: '전화', width: 'half', emptyAs: 'null', placeholder: '02)2123-0000' },
  { kind: 'text', key: 'room', label: '연구실 위치', width: 'half', emptyAs: 'null', placeholder: 'Engineering Building #1, Room 589' },
  { kind: 'text', key: 'specialty', label: '전공 분야', width: 'half', emptyAs: 'null', hint: '주로 전임(퇴임) 교원에 사용' },
  { kind: 'text', key: 'yearRange', label: '재직 기간', width: 'half', emptyAs: 'null', placeholder: '1963~2002', hint: '퇴임 교원만. 재직 중이면 비움' },
  { kind: 'text', key: 'moreInfoUrl', label: '상세 정보 URL', width: 'half', emptyAs: 'null' },
  { kind: 'text', key: 'photoAlt', label: '사진 대체 텍스트', width: 'half', hint: '비우면 이름을 사용' },
  {
    kind: 'imageUpload', key: 'photo', label: '프로필 사진', folder: 'public/img/faculty',
    fileNameFrom: 'name', emptyAs: 'omit',
    hint: '이미지를 올리면 이 교수의 프로필 사진으로 저장됩니다(교수진 목록·상세에 반영). 비워두면 public/img/faculty 의 "이름.확장자" 파일이 있으면 그것을 자동 사용합니다.',
  },
];

const FACULTY_LAB_FIELDS: FieldDef[] = [
  { kind: 'text', key: 'labNameKo', label: '연구실명 (한국어)', width: 'half' },
  { kind: 'text', key: 'labNameEn', label: '연구실명 (English)', width: 'half' },
  { kind: 'text', key: 'labUrl', label: '연구실 홈페이지 URL' },
];

const facultyDirectory: ResourceDef = {
  key: 'facultyDirectory',
  label: '교수진',
  description:
    '교수진 페이지와 학부 소개 > 교수진 탭 카드에 반영됩니다. 프로필 사진은 public/img/faculty/ 폴더에 "<이름>.jpg" 형식으로 넣으면 이름 기준으로 자동 연결됩니다.',
  file: 'content/faculty-directory.json',
  format: 'array',
  listColumns: [
    { key: 'name', label: '이름' },
    { key: 'title', label: '직급' },
    { key: 'email', label: '이메일' },
    { key: 'yearRange', label: '재직 기간' },
  ],
  searchKeys: ['name', 'title', 'email', 'specialty'],
  fields: [...FACULTY_BASE_FIELDS, ...FACULTY_LAB_FIELDS],
  orderable: true,
  toForm: (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const lab = (r.lab ?? null) as { nameKo?: string; nameEn?: string; url?: string } | null;
    const form = defaultToForm(FACULTY_BASE_FIELDS, r);
    form.labNameKo = lab?.nameKo ?? '';
    form.labNameEn = lab?.nameEn ?? '';
    form.labUrl = lab?.url ?? '';
    return form;
  },
  fromForm: (form) => {
    const out = defaultFromForm(FACULTY_BASE_FIELDS, form);
    if (!String(form.photoAlt ?? '').trim()) {
      out.photoAlt = String(form.name ?? '').trim();
    }
    const nameKo = String(form.labNameKo ?? '').trim();
    const nameEn = String(form.labNameEn ?? '').trim();
    const url = String(form.labUrl ?? '').trim();
    out.lab = nameKo || nameEn || url ? { nameKo, nameEn, url } : null;
    return out;
  },
  summarize: (f) => cellText(f, 'name'),
};

const history: ResourceDef = {
  key: 'history',
  label: '연혁',
  description:
    '학부 소개 > 연혁 탭 타임라인에 반영됩니다. 사이트에서 연월 내림차순(최근→과거)으로 자동 정렬되므로 입력 순서는 무관합니다.',
  file: 'content/history.json',
  format: 'array',
  listColumns: [
    { key: 'date', label: '연월' },
    { key: 'title', label: '내용' },
  ],
  searchKeys: ['date', 'title'],
  fields: [
    { kind: 'month', key: 'date', label: '연월', required: true, width: 'third', hint: '예: 1958-12' },
    { kind: 'localized', key: 'title', label: '내용', required: true, multiline: true, rows: 2 },
  ],
  orderable: false,
  summarize: (f) => `${cellText(f, 'date')} ${cellText(f, 'title')}`,
};

const staff: ResourceDef = {
  key: 'staff',
  label: '교직원',
  description: '학부 소개 > 교직원 탭 표에 반영됩니다. 표에는 입력한 순서대로 표시됩니다.',
  file: 'content/staff.json',
  format: 'array',
  listColumns: [
    { key: 'role', label: '담당' },
    { key: 'name', label: '이름' },
    { key: 'phone', label: '전화' },
    { key: 'email', label: '이메일' },
  ],
  searchKeys: ['role', 'name', 'email'],
  fields: [
    { kind: 'localized', key: 'role', label: '담당 업무', required: true, width: 'half' },
    { kind: 'localized', key: 'name', label: '이름', required: true, width: 'half' },
    { kind: 'text', key: 'phone', label: '전화', required: true, width: 'half', placeholder: '(02) 2123-2810' },
    { kind: 'text', key: 'email', label: '이메일', required: true, width: 'half' },
    { kind: 'localized', key: 'location', label: '위치', required: true },
  ],
  orderable: true,
  summarize: (f) => cellText(f, 'name'),
};

const coursesUndergraduate: ResourceDef = {
  key: 'coursesUndergraduate',
  label: '학부 교과목',
  description:
    '학부 > 개설 교과목 표와 교과목 체계도(로드맵)가 모두 이 데이터로 그려집니다. 체계도에서 과목 클릭 시 나오는 설명은 "교과목 설명"에서 편집하세요.',
  file: 'content/courses-undergraduate.json',
  format: 'array',
  listColumns: [
    { key: 'year', label: '학년' },
    { key: 'semester', label: '학기' },
    { key: 'kind', label: '종별' },
    { key: 'code', label: '학정번호' },
    { key: 'name', label: '교과목명' },
  ],
  searchKeys: ['code', 'name'],
  fields: [
    { kind: 'text', key: 'year', label: '학년', required: true, width: 'third', placeholder: '1', hint: '복수 학년은 "3 & 4" 형태' },
    { kind: 'text', key: 'semester', label: '학기', required: true, width: 'third', placeholder: '1' },
    {
      kind: 'select', key: 'kind', label: '종별', required: true, width: 'third',
      options: [
        { value: '대교', label: '대교 (대학교양)' },
        { value: '전필', label: '전필 (전공필수)' },
        { value: '전선', label: '전선 (전공선택)' },
      ],
    },
    { kind: 'text', key: 'code', label: '학정번호', required: true, width: 'third', placeholder: 'MEU3005' },
    { kind: 'text', key: 'name', label: '교과목명', required: true, width: 'third' },
    { kind: 'text', key: 'credits', label: '학점', width: 'third', placeholder: '3' },
    { kind: 'text', key: 'hours', label: '강의(실습) 시간', width: 'third', placeholder: '3(1)' },
    {
      kind: 'select', key: 'field', label: '연구 분야 (체계도 레인)', width: 'third',
      options: FIELD_OPTIONS, emptyAs: 'null', emptyOptionLabel: '기초·공통 (분야 없음)',
    },
  ],
  orderable: true,
  summarize: (f) => `${cellText(f, 'code')} ${cellText(f, 'name')}`,
};

const courseDescriptions: ResourceDef = {
  key: 'courseDescriptions',
  label: '교과목 설명',
  description:
    '교과목 체계도에서 과목을 클릭하면 나오는 상세 설명입니다. 학정번호가 학부 교과목의 학정번호와 일치해야 체계도에 연결됩니다.',
  file: 'content/course-descriptions.json',
  format: 'record',
  idField: 'code',
  listColumns: [
    { key: 'code', label: '학정번호' },
    { key: 'nameEn', label: '영문 과목명' },
  ],
  searchKeys: ['code', 'nameEn', 'desc'],
  fields: [
    { kind: 'text', key: 'code', label: '학정번호', required: true, width: 'third', readOnlyOnEdit: true, placeholder: 'MEU3005' },
    { kind: 'text', key: 'nameEn', label: '영문 과목명', placeholder: 'Mechanical Engineering Laboratory II' },
    { kind: 'textarea', key: 'desc', label: '과목 설명', rows: 6, required: true },
  ],
  orderable: false,
  summarize: (f) => cellText(f, 'code'),
};

const coursesGraduate: ResourceDef = {
  key: 'coursesGraduate',
  label: '대학원 교과목',
  description: '대학원 > 교과목 소개 표에 반영됩니다.',
  file: 'content/courses-graduate.json',
  format: 'array',
  listColumns: [
    { key: 'code', label: '학정번호' },
    { key: 'name', label: '과목명' },
    { key: 'credits', label: '학점' },
  ],
  searchKeys: ['code', 'name'],
  fields: [
    { kind: 'text', key: 'code', label: '학정번호', required: true, width: 'third', placeholder: 'MEU5001' },
    { kind: 'text', key: 'name', label: '과목명', required: true, hint: '"국문명 (English Title)" 병기 형식' },
    { kind: 'text', key: 'credits', label: '학점', width: 'third', placeholder: '3' },
    {
      kind: 'select', key: 'field', label: '연구 분야', width: 'third',
      options: FIELD_OPTIONS, emptyAs: 'null', emptyOptionLabel: '공통 (분야 없음)',
    },
  ],
  orderable: true,
  summarize: (f) => `${cellText(f, 'code')} ${cellText(f, 'name')}`,
};

const clubs: ResourceDef = {
  key: 'clubs',
  label: '동아리 소개',
  description:
    '학부 > 동아리 소개 카드와 동아리 상세 페이지에 반영됩니다. 카드 로고는 코드의 slug 매핑을 사용하므로 새 동아리 로고는 개발자에게 요청하세요.',
  file: 'content/clubs.json',
  format: 'array',
  listColumns: [
    { key: 'slug', label: 'slug' },
    { key: 'name', label: '이름' },
    { key: 'images', label: '사진' },
  ],
  searchKeys: ['slug', 'name', 'teaser'],
  fields: [
    {
      kind: 'text', key: 'slug', label: 'slug', required: true, width: 'third', readOnlyOnEdit: true,
      placeholder: 'yonseidrone', hint: '영문 소문자 식별자. 상세 페이지 주소와 소개 본문 파일명에 사용됩니다',
    },
    { kind: 'text', key: 'name', label: '이름', required: true, hint: '예: 메카 (MECar)' },
    { kind: 'textarea', key: 'teaser', label: '카드 소개 문구', rows: 3, required: true },
    {
      kind: 'imageList', key: 'images', label: '상세 페이지 사진', emptyAs: 'omit',
      hint: '/img/club-photos/ 경로. 상세 페이지 카드뉴스 패널에서 좌우 교대로 사용됩니다',
    },
  ],
  orderable: true,
  linkedMarkdown: {
    label: '소개 카드뉴스',
    hint: '각 카드(팀 소개)를 직접 편집합니다. SNS 링크도 아래에서 관리하세요.',
    pathOf: (form) => `content/pages/club-${String(form.slug ?? '').trim()}.md`,
    structured: 'clubCards',
  },
  summarize: (f) => cellText(f, 'name'),
};

// 연구실: 인턴 모집 체크박스·인원은 fromForm 에서 후처리하므로 필드를 상수로 분리한다.
const LABS_FIELDS: FieldDef[] = [
  { kind: 'text', key: 'nameKo', label: '연구실명 (한국어)', required: true, width: 'half' },
  { kind: 'text', key: 'nameEn', label: '연구실명 (English)', width: 'half' },
  { kind: 'text', key: 'professorKo', label: '지도교수 (한국어)', required: true, width: 'half' },
  { kind: 'text', key: 'professorEn', label: '지도교수 (English)', width: 'half' },
  { kind: 'text', key: 'location', label: '위치', width: 'half', placeholder: '공학관 N204' },
  { kind: 'text', key: 'phone', label: '전화', width: 'half', placeholder: '02-2123-0000' },
  { kind: 'text', key: 'url', label: '연구실 홈페이지 URL', hint: '비우면 링크 없는 카드로 표시됩니다' },
  { kind: 'image', key: 'image', label: '대표 이미지 경로', emptyAs: 'omit', placeholder: '/img/labs/lab-name.jpg', hint: '비우면 기본 이미지를 순환 사용합니다' },
  {
    kind: 'text', key: 'video', label: '소개 영상 URL', emptyAs: 'omit',
    hint: 'YouTube watch 또는 Google Drive file 링크. 대학원 > 연구실 소개 영상 갤러리에 노출됩니다',
  },
  { kind: 'select', key: 'field', label: '연구 분야', required: true, width: 'third', options: FIELD_OPTIONS },
  {
    kind: 'checkbox', key: 'internRecruiting', label: '학부 인턴 모집 중', width: 'half',
    hint: '체크하면 연구실 목록에 "학부 인턴 모집 중" 배지가 붙고, 목록 상단 필터로 모아볼 수 있습니다',
  },
  {
    kind: 'text', key: 'internCount', label: '모집 인원', width: 'half', emptyAs: 'omit', placeholder: '2',
    hint: '모집 인원 수(숫자만). "학부 인턴 모집 중"일 때만 저장되며, 비우면 인원 없이 배지만 표시됩니다',
  },
];

const labs: ResourceDef = {
  key: 'labs',
  label: '연구실 · 소개 영상',
  description:
    '연구 메뉴의 연구실 목록과 대학원 > 연구실 탭의 소개 영상 갤러리에 반영됩니다. 소개 영상 URL을 채우면 영상 갤러리에 노출됩니다. "학부 인턴 모집 중"을 체크하면 연구실 목록에 배지가 표시됩니다.',
  file: 'content/labs-directory.json',
  format: 'array',
  listColumns: [
    { key: 'nameKo', label: '연구실명' },
    { key: 'professorKo', label: '지도교수' },
    { key: 'field', label: '분야' },
    { key: 'internRecruiting', label: '인턴 모집' },
  ],
  searchKeys: ['nameKo', 'nameEn', 'professorKo', 'professorEn'],
  fields: LABS_FIELDS,
  orderable: true,
  fromForm: (form) => {
    const out = defaultFromForm(LABS_FIELDS, form);
    // 모집 인원: 숫자로 저장. "모집 중"이 아니거나 값이 없으면 생략한다.
    const n = parseInt(String(form.internCount ?? '').trim(), 10);
    if (out.internRecruiting === true && Number.isFinite(n) && n > 0) out.internCount = n;
    else delete out.internCount;
    // 모집 중이 아니면 플래그 자체를 생략(JSON 최소화 — 기본값 false)
    if (out.internRecruiting !== true) delete out.internRecruiting;
    return out;
  },
  summarize: (f) => cellText(f, 'nameKo'),
};

export const RESOURCES: Record<ResourceKey, ResourceDef> = {
  history,
  facultyDirectory,
  staff,
  coursesUndergraduate,
  courseDescriptions,
  coursesGraduate,
  clubs,
  labs,
};

export function getResource(key: ResourceKey): ResourceDef {
  return RESOURCES[key];
}

// ---- 단일 마크다운 페이지 ----

export interface MarkdownPageDef {
  key: string;
  label: string;
  file: string;
  description: string;
}

export const MARKDOWN_PAGES: MarkdownPageDef[] = [
  {
    key: 'scholarship',
    label: '장학금',
    file: 'content/pages/undergraduate-scholarship.md',
    description: '학부 > 장학금 탭 본문입니다. 마크다운 형식으로 작성합니다.',
  },
];

export function getMarkdownPage(key: string): MarkdownPageDef {
  const found = MARKDOWN_PAGES.find((p) => p.key === key);
  if (!found) throw new Error(`알 수 없는 마크다운 페이지: ${key}`);
  return found;
}

// ---- 콘솔 사이드바 구성 ----

export type MenuEntry =
  | { type: 'board'; boardKey: BoardKey }
  | { type: 'collection'; resourceKey: ResourceKey }
  | { type: 'markdown'; pageKey: string }
  | { type: 'placeholder'; label: string; note: string };

export interface MenuGroup {
  label: string;
  entries: MenuEntry[];
}

/** 사이드바 그룹 — 사이트 메뉴 구조와 같은 어순으로 배치한다 */
export const MENU_GROUPS: MenuGroup[] = [
  {
    label: '뉴스·공지 게시판',
    entries: [
      { type: 'board', boardKey: 'news' },
      { type: 'board', boardKey: 'noticesUndergrad' },
      { type: 'board', boardKey: 'noticesGraduate' },
      { type: 'board', boardKey: 'noticesExternal' },
      { type: 'board', boardKey: 'noticesScholarship' },
      { type: 'board', boardKey: 'seminars' },
      { type: 'board', boardKey: 'events' },
      { type: 'board', boardKey: 'thesis' },
      { type: 'board', boardKey: 'resources' },
      { type: 'board', boardKey: 'career' },
      { type: 'board', boardKey: 'instagram' },
    ],
  },
  {
    label: '학과 소개',
    entries: [
      { type: 'collection', resourceKey: 'history' },
      { type: 'collection', resourceKey: 'facultyDirectory' },
      { type: 'collection', resourceKey: 'staff' },
    ],
  },
  {
    label: '학사·교과',
    entries: [
      { type: 'collection', resourceKey: 'coursesUndergraduate' },
      { type: 'collection', resourceKey: 'courseDescriptions' },
      { type: 'collection', resourceKey: 'coursesGraduate' },
      { type: 'markdown', pageKey: 'scholarship' },
    ],
  },
  {
    label: '학생 활동·연구',
    entries: [
      { type: 'collection', resourceKey: 'clubs' },
      { type: 'collection', resourceKey: 'labs' },
      { type: 'board', boardKey: 'internships' },
    ],
  },
  {
    label: '동문',
    entries: [
      { type: 'board', boardKey: 'alumniNews' },
      { type: 'board', boardKey: 'alumniEvents' },
    ],
  },
];
