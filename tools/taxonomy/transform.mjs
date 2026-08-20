/**
 * 6분야 이관 변환기 — 파일(레포)과 DB(content_files) 양쪽이 같은 함수를 쓴다.
 *
 * ⚠️ 연구실·과목은 JSON.parse → stringify 로 다시 쓰지 않는다. 이 파일들에는 다른
 * 세션의 커밋 전 수정이 상시 섞여 있어, 통째로 재직렬화하면 포맷이 바뀌며 diff 가
 * 파일 전체로 번진다. `"field": "…"` 가 적힌 **줄만** 치환한다.
 * 히어로 슬라이드는 6줄짜리 고정 목록이고 순서까지 바꿔야 해서 파싱해 다시 쓴다.
 */
import { FIELDS, FIELD_RENAME, LAB_FIELD, COURSE_FIELD } from './field-map.mjs';

const FIELD_LINE = /^(\s*)"field":\s*(?:"([^"]*)"|null)(,?)\s*$/;
const FIELD_INLINE = /"field":\s*(?:"([^"]*)"|null)/;
const CODE_INLINE = /"code":\s*"([^"]+)"/;

const nextValue = (v) => (v === null ? 'null' : JSON.stringify(v));

/** 연구실: 객체 안의 professorKo 를 기억해 두었다가 같은 객체의 field 줄에서 쓴다. */
export function migrateLabs(text) {
  const changes = [];
  let professor = null;
  const out = text.split('\n').map((line) => {
    const p = line.match(/^\s*"professorKo":\s*"([^"]+)"/);
    if (p) professor = p[1];
    const m = line.match(FIELD_LINE);
    if (!m) return line;
    const [, indent, oldValue, comma] = m;
    const to = LAB_FIELD[professor];
    if (to === undefined) {
      changes.push({ id: professor ?? '(교수 미상)', from: oldValue, to: null, unmapped: true });
      return line;
    }
    if (to === oldValue) return line;
    changes.push({ id: professor, from: oldValue, to });
    return `${indent}"field": ${nextValue(to)}${comma}`;
  });
  return { text: out.join('\n'), changes };
}

/** 과목: 한 줄 레코드라 같은 줄에서 code 와 field 를 함께 읽는다. */
export function migrateCourses(text) {
  const changes = [];
  const out = text.split('\n').map((line) => {
    const f = line.match(FIELD_INLINE);
    const c = line.match(CODE_INLINE);
    if (!f || !c) return line;
    const oldValue = f[1] ?? null;
    const code = c[1];
    const to = code in COURSE_FIELD ? COURSE_FIELD[code] : (FIELD_RENAME[oldValue] ?? oldValue);
    if (to === oldValue) return line;
    if (to === undefined) {
      changes.push({ id: code, from: oldValue, to: null, unmapped: true });
      return line;
    }
    changes.push({ id: code, from: oldValue, to });
    return line.replace(FIELD_INLINE, `"field": ${nextValue(to)}`);
  });
  return { text: out.join('\n'), changes };
}

/**
 * 히어로 슬라이드 6장 — 키·이름을 갈아끼우고 공식 순서(01→06)로 정렬한다.
 * **사진(image·imageMobile)은 건드리지 않는다** — CMS 에서 올린 파일이 들어 있을 수 있다.
 *
 * 사진 승계 규칙: 구 계산·해석 슬라이드의 사진을 마이크로·나노가, 구 바이오·나노의
 * 사진을 바이오·포토닉스가 물려받는다. 계산·해석이 없어지고 마이크로·나노가 새로
 * 생기면서 남는 자리를 메우는 임시 배정이라, 최종 사진은 CMS 에서 교체해야 한다.
 */
const HERO_INHERIT = {
  mechanicsMaterials: 'mechanicsMaterials',
  thermoFluid: 'energyThermofluid',
  dynamicsControl: 'roboticsControl',
  manufacturingDesign: 'designManufacturing',
  computation: 'microNano',
  bioNano: 'bioPhotonics',
};

export function migrateHeroSlides(text) {
  const slides = JSON.parse(text);
  const changes = [];
  const byNewKey = new Map();
  for (const slide of slides) {
    const to = HERO_INHERIT[slide.field] ?? (FIELDS.some((f) => f.key === slide.field) ? slide.field : undefined);
    if (to === undefined) {
      changes.push({ id: slide.field, from: slide.field, to: null, unmapped: true });
      continue;
    }
    byNewKey.set(to, slide);
    if (to !== slide.field) changes.push({ id: slide.field, from: slide.field, to });
  }
  const next = FIELDS.map(({ key, ko, en }) => {
    const prev = byNewKey.get(key);
    if (!prev) {
      changes.push({ id: key, from: null, to: key, missingImage: true });
      return { field: key, title: { ko, en }, image: '', imageMobile: '' };
    }
    return { field: key, title: { ko, en }, image: prev.image, imageMobile: prev.imageMobile };
  });
  return { text: `${JSON.stringify(next, null, 2)}\n`, changes };
}
