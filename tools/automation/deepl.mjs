/**
 * DeepL 번역 클라이언트 — 자동화 워커가 우리 콘텐츠의 빈 `en` 을 채울 때 쓴다.
 *
 *   import { findApiKey, buildGlossary, buildTranslationCache, translateKoToEn } from './deepl.mjs';
 *   const en = await translateKoToEn(['인터넷 원서접수'], { apiKey, glossary });
 *
 * 관리자 콘솔의 `/api/translate`(`src/app/api/translate/route.ts`)와 **같은 요청**을 보낸다:
 * `POST {api|api-free}.deepl.com/v2/translate`, `Authorization: DeepL-Auth-Key <키>`,
 * `application/x-www-form-urlencoded`, 응답은 `{ translations: [{ text }] }`. 다른 점은 하나뿐 —
 * 한 요청에 `text` 를 여러 개 넣는다(DeepL v2 가 지원한다. 응답 순서 = 요청 순서).
 *
 * 용어집(glossary)
 *   전형명·트랙명은 우리 파일에 이미 확정된 영문이 있다(`수시모집` = `Early Admission (Susi)`).
 *   DeepL 에 맡기면 회차마다 표기가 흔들리므로, **번역 전에** ko 용어를 `{{G0}}` 같은
 *   플레이스홀더로 치환하고 번역 후 확정 en 으로 되돌린다. DeepL 은 라틴 문자 토큰을 고유명사로
 *   보아 그대로 흘려보낸다. 되돌리기는 관대한 정규식으로 하고(공백·중괄호 수 변형 허용),
 *   그래도 못 찾으면 `missing` 에 남겨 호출자가 리포트에 적을 수 있게 한다.
 *
 * 키가 없으면 throw 하지 않는다 — `null` 배열을 돌려주고 호출자가 `en: ''` 로 남긴다.
 * (자동화는 번역이 안 된다고 멈추면 안 된다. 사람이 PR 에서 채우면 된다.)
 *
 * 의존성: 없음(Node 24 내장 fetch).
 */
import { existsSync, readFileSync } from 'node:fs';

/** DeepL v2 는 한 요청에 50개까지 받는다. 여유를 두고 40. */
export const MAX_TEXTS_PER_REQUEST = 40;
/** 한 문장 상한 — 콘솔 라우트의 MAX_LEN 과 같은 값(남용·과금 방지). */
export const MAX_LEN = 6000;
const TIMEOUT_MS = 20_000;

/** 무료 키(`:fx` 접미)는 api-free, 유료 키는 api. 콘솔 라우트와 같은 판정. */
export function endpointFor(apiKey) {
  return String(apiKey).trim().endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

/**
 * `DEEPL_API_KEY` 를 찾는다: 환경변수 우선, 없으면 `.env.local`(로컬 실행용).
 * Actions 러너에서는 Secrets → env 로 들어오므로 파일은 없다.
 * @returns {string|null}
 */
export function findApiKey({ env = process.env, envFile = null } = {}) {
  const fromEnv = env.DEEPL_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (!envFile || !existsSync(envFile)) return null;
  try {
    for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      const m = /^(?:export\s+)?DEEPL_API_KEY\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const v = m[1].trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
      if (v) return v;
    }
  } catch {
    // 읽기 실패는 "키 없음"과 같다 — 자동화를 멈출 이유가 못 된다.
  }
  return null;
}

// ── 용어집 ──────────────────────────────────────────────────────
/**
 * `content/admission-guide.json` 의 `calendar` 에서 용어집을 뽑는다.
 * 트랙명(`tracks[*]`)과 전형명(`types[*].label`) — 사이트 캘린더 문구에 그대로 나오는 낱말들이다.
 * @returns {Map<string,string>} ko → 확정 en
 */
export function buildGlossary(calendar) {
  const out = new Map();
  const put = (ko, en) => {
    const k = String(ko ?? '').trim();
    const v = String(en ?? '').trim();
    // 한 글자짜리는 문장 아무 데나 걸려 오히려 해가 된다.
    if (k.length >= 2 && v !== '') out.set(k, v);
  };
  for (const t of Object.values(calendar?.tracks ?? {})) put(t?.ko, t?.en);
  for (const t of calendar?.types ?? []) put(t?.label?.ko, t?.label?.en);
  return out;
}

/**
 * 이미 번역된 ko→en 쌍(정확 일치)을 캐시로 모은다. 같은 문구는 다시 번역하지 않는다 —
 * 과금을 아끼고, 무엇보다 같은 문장이 회차마다 다르게 번역되는 것을 막는다.
 * @param {Array} events `calendar.events`
 */
export function buildTranslationCache(events) {
  const cache = new Map();
  const put = (ko, en) => {
    const k = String(ko ?? '').trim();
    const v = String(en ?? '').trim();
    if (k !== '' && v !== '' && !cache.has(k)) cache.set(k, v);
  };
  for (const e of events ?? []) {
    put(e?.title?.ko, e?.title?.en);
    for (const l of e?.lines ?? []) put(l?.ko, l?.en);
  }
  return cache;
}

// ── 플레이스홀더 ────────────────────────────────────────────────
const token = (i) => `{{G${i}}}`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ko 문장 안의 용어를 플레이스홀더로 치환한다. 긴 낱말부터 치환해야
 * `재외국민` 이 `재외` 로 먼저 잘리는 사고가 없다.
 * @returns {{text: string, used: Array<{token: string, ko: string, en: string}>}}
 */
export function applyGlossary(text, glossary) {
  const terms = [...(glossary ?? new Map())].sort((a, b) => b[0].length - a[0].length);
  let out = String(text ?? '');
  const used = [];
  for (const [ko, en] of terms) {
    if (!out.includes(ko)) continue;
    const t = token(used.length);
    out = out.replace(new RegExp(escapeRe(ko), 'g'), t);
    used.push({ token: t, ko, en });
  }
  return { text: out, used };
}

/**
 * 번역문의 플레이스홀더를 확정 en 으로 되돌린다.
 * DeepL 이 `{{ G0 }}`·`{G0}` 처럼 흔들어도 잡도록 관대하게 본다.
 * @returns {{text: string, missing: string[]}} missing 은 끝내 못 찾은 원어(ko)
 */
export function restoreGlossary(text, used) {
  let out = String(text ?? '');
  const missing = [];
  for (const [i, u] of (used ?? []).entries()) {
    const loose = new RegExp(`\\{{1,3}\\s*G\\s*${i}\\s*\\}{1,3}`, 'gi');
    if (loose.test(out)) out = out.replace(loose, u.en);
    else missing.push(u.ko);
  }
  return { text: out, missing };
}

// ── 요청 ────────────────────────────────────────────────────────
/**
 * 번역할 문장들을 용어집 치환 + 배치로 나눈다. `--translate-dry` 는 이 결과만 보고
 * 실제 호출 없이 "무엇을 어떻게 보낼 것인가"를 리포트에 싣는다.
 * @returns {{items: Array<{source,text,used,skipped}>, requests: Array<{offset, items}>}}
 */
export function prepareRequests(texts, { glossary = new Map(), chunkSize = MAX_TEXTS_PER_REQUEST } = {}) {
  const items = (texts ?? []).map((t) => {
    const source = String(t ?? '');
    const { text, used } = applyGlossary(source, glossary);
    return { source, text, used, skipped: source.length > MAX_LEN ? '길이 초과' : null };
  });
  const sendable = items.filter((it) => it.skipped === null);
  const requests = [];
  for (let i = 0; i < sendable.length; i += chunkSize) {
    requests.push({ offset: i, items: sendable.slice(i, i + chunkSize) });
  }
  return { items, requests };
}

/** 콘솔 라우트와 같은 폼 본문. `text` 만 여러 개다. */
export function requestParams(items) {
  const p = new URLSearchParams();
  for (const it of items) p.append('text', it.text);
  p.append('source_lang', 'KO');
  p.append('target_lang', 'EN-US');
  return p;
}

/**
 * ko 문장 배열을 EN 으로 번역한다. 키가 없으면 **throw 하지 않고** null 배열.
 * 실패(HTTP 오류)는 throw — 호출자가 잡아 "미번역"으로 낮춰 처리한다.
 * @param {string[]} texts
 * @param {{apiKey?: string|null, glossary?: Map<string,string>, onWarn?: (msg: string) => void, fetchImpl?: typeof fetch}} opts
 * @returns {Promise<Array<string|null>>} 입력과 같은 길이·순서. 못 채운 자리는 null.
 */
export async function translateKoToEn(texts, { apiKey = null, glossary = new Map(), onWarn = null, fetchImpl = fetch } = {}) {
  const list = (texts ?? []).map((t) => String(t ?? ''));
  const out = new Array(list.length).fill(null);
  if (!apiKey || list.length === 0) return out;

  const { items, requests } = prepareRequests(list, { glossary });
  // items 는 입력 순서 그대로다. 보낸 것만 골라 돌려받은 자리에 꽂아야 하므로 색인을 만든다.
  const sendableIndex = [];
  items.forEach((it, i) => {
    if (it.skipped === null) sendableIndex.push(i);
    else onWarn?.(`번역 건너뜀(${it.skipped}): ${it.source.slice(0, 40)}…`);
  });

  const endpoint = endpointFor(apiKey);
  for (const req of requests) {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestParams(req.items),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail =
        res.status === 403
          ? 'DeepL 인증 실패(403) — 키를 확인할 것.'
          : res.status === 456
            ? 'DeepL 할당량 소진(456).'
            : `DeepL 오류(HTTP ${res.status}).`;
      throw new Error(detail);
    }
    const data = await res.json();
    const translations = Array.isArray(data?.translations) ? data.translations : [];
    req.items.forEach((it, k) => {
      const raw = translations[k]?.text;
      if (typeof raw !== 'string' || raw.trim() === '') return;
      const { text, missing } = restoreGlossary(raw, it.used);
      if (missing.length > 0) onWarn?.(`용어집 복원 실패(${missing.join(', ')}): ${it.source.slice(0, 40)}…`);
      out[sendableIndex[req.offset + k]] = text;
    });
  }
  return out;
}
