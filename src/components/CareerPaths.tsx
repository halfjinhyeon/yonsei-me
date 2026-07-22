'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { ArrowIcon } from '@/components/NewsEventsSection';
import careerData from '@content/career-paths.json';
import { useLandingAnimation } from '@/components/LandingScope';
import type { Locale } from '@/i18n/routing';

/** 한/영 문자열 쌍 */
type L = { ko: string; en: string };
type LArr = { ko: string[]; en: string[] };

interface TimelineMark {
  at: number;
  solid: boolean;
  label: L;
}
interface TimelineTrack {
  key: string;
  label: L;
  sub: L;
  marks: TimelineMark[];
}
interface JobLogo {
  src: string;
  name: L;
}
interface Job {
  name: L;
  degree: L;
  masters: boolean;
  intro: L;
  tasks: L;
  skills: LArr;
  industries: L;
  logos: JobLogo[];
}
interface Branch {
  name: L;
  body: L;
  metaLabel: L;
  chips: LArr;
  linksGrad: boolean;
  sourceLabel?: L;
  sourceUrl?: string;
  updatedAt?: string;
}
interface CareerData {
  timeline: {
    years: L[];
    decision: { title: L; detail: L };
    tracks: TimelineTrack[];
  };
  fields: { key: string; label: L; sub: L }[];
  jobs: Job[];
  graduate: {
    steps: { title: L; body: L }[];
    columns: { key: string; label: L }[];
    rows: { label: L; highlight?: boolean; cells: L[] }[];
    linkedTrack: { tag: L; note: L; title: L; body: L; linkLabel: L; href: string };
    military: { tag: L; note: L; title: L; body: L; sourceLabel: L; sourceUrl: string; updatedAt: string };
  };
  branches: Branch[];
  degrees: {
    levels: { label: L; abbr: string }[];
    columnTitles: L[];
    roles: { level: number; name: L }[];
  };
}

const DATA = careerData as unknown as CareerData;
const LOGO_BASE = '/img/career-logos/';

/** 트랙 3종의 색 — 기업(네이비) / 대학원(블루) / 공공(스카이) */
const TRACK_TONE = [
  { text: 'text-yonsei-navy', bg: 'bg-yonsei-navy', border: 'border-yonsei-navy', hex: '#003377' },
  { text: 'text-yonsei-blue', bg: 'bg-yonsei-blue', border: 'border-yonsei-blue', hex: '#0057A8' },
  { text: 'text-yonsei-sky', bg: 'bg-yonsei-sky', border: 'border-yonsei-sky', hex: '#2E86D6' },
] as const;

/** 섹션 제목 — 사이트 공통 네이비 사각 라벨 박스 + 헤어라인(+ 우측 슬롯).
 *  랜딩에선 라벨 박스가 좌→우로 채워지는 동시에 헤어라인이 그어진다(같은 order). */
function SectionHead({
  title,
  order,
  children,
}: {
  title: string;
  order: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-5">
      <h3
        data-land="wipe"
        data-land-order={order}
        style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
        className="inline-block shrink-0 bg-yonsei-navy px-3.5 py-1.5 text-sm font-semibold text-white"
      >
        {title}
      </h3>
      <span data-land="rule" data-land-order={order} aria-hidden="true" className="h-px flex-1 bg-surface-border" />
      {children}
    </div>
  );
}

/** 작은 대문자 라벨(아이브로우 톤) */
function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-xs font-bold tracking-[0.05em] text-content-faint">{children}</p>
  );
}

/**
 * 졸업 후 진로 — 학부 탭 인포그래픽 (Claude Design 시안 이식).
 *
 * 구성: ① 학년 타임라인(3트랙 공통 축, 3학년 의사결정 분기점 강조)
 *      ② 진로 분야 슬라이더 — 기업 취업(직무 7) / 대학원 진학(경로 3) / 공공·전문직(직렬 4)
 *      ③ 학위 요건 — 단계형 막대 + 학위별 신규 진로 + 진로×학위 매트릭스
 *
 * ⚠️ 용어 규칙(시안 지침): 사기업은 "직무", 공공은 "직렬·직류" — 라벨을 섞지 않는다.
 * 데이터는 content/career-paths.json 단일 출처(비개발자 편집). 로고는 public/img/career-logos/.
 */
export function CareerPaths({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  const t = (v: L) => (ko ? v.ko : v.en);
  const ta = (v: LArr) => (ko ? v.ko : v.en);

  const [field, setField] = useState(0);
  const [jobIdx, setJobIdx] = useState(0);
  const [branchIdx, setBranchIdx] = useState(0);

  const setFieldWrapped = (n: number) => setField(((n % 3) + 3) % 3);
  const job = DATA.jobs[jobIdx];
  const branch = DATA.branches[branchIdx];

  // 탭 진입 랜딩 — 축이 그어지고 → 분기점이 서고 → 트랙선이 좌→우로 뻗으며 마커가 순차 점등.
  // 가로 스크롤(min-w-[820px]) 컨테이너라 x 이동은 쓰지 않는다(스크롤바 유발).
  const rootRef = useLandingAnimation<HTMLDivElement>('career-paths');

  return (
    <div ref={rootRef}>
      {/* ─────────── ① 타임라인 ─────────── */}
      <section aria-labelledby="career-timeline">
        <SectionHead title={ko ? '타임라인' : 'Timeline'} order={0} />
        <h4 id="career-timeline" className="sr-only">
          {ko ? '학년별 진로 준비 타임라인' : 'Career preparation timeline by year'}
        </h4>

        {/* 좁은 화면은 가로 스크롤(시안 min-width 820px 유지) */}
        <div className="mt-5 overflow-x-auto">
          <div className="relative min-w-[820px]">
            {/* 3학년 의사결정 구간 밴드 */}
            <div
              aria-hidden="true"
              data-land="fade"
              data-land-order="2"
              className="absolute border border-dashed border-yonsei-navy/35 bg-yonsei-navy/[0.05]"
              style={{
                top: 5,
                bottom: 2,
                left: 'calc(220px + (100% - 220px) * 0.5)',
                width: 'calc((100% - 230px) * 0.25)',
              }}
            />

            {/* 학년 축 — 좌→우로 리빌되며 학년 라벨이 차례로 드러난다 */}
            <div
              data-land="wipe"
              data-land-order="1"
              className="grid grid-cols-[220px_repeat(4,1fr)] border-b-2 border-yonsei-navy"
            >
              <div />
              {DATA.timeline.years.map((y, i) => (
                <div
                  key={i}
                  className={cn(
                    'px-3 py-2 text-center text-[13px] font-bold',
                    i === 2 ? 'text-yonsei-navy' : 'text-content',
                  )}
                >
                  {t(y)}
                </div>
              ))}
            </div>

            {/* 3학년 분기점 노드 */}
            <div className="grid grid-cols-[220px_repeat(4,1fr)]">
              <div />
              <div />
              <div />
              <div data-land="fade" data-land-order="2" className="flex flex-col items-center gap-[7px] px-2 pb-1 pt-3">
                {/* rotate-45 가 걸려 있어 이동 계열(rise)이 아니라 페이드로 등장시킨다 */}
                <span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 bg-yonsei-navy" />
                <span className="text-center text-[11.5px] font-semibold leading-[1.45] text-yonsei-navy">
                  {t(DATA.timeline.decision.title)}
                  <br />
                  {t(DATA.timeline.decision.detail)}
                </span>
              </div>
              <div />
            </div>

            {/* 트랙 3종 — 클릭하면 해당 분야 패널로 전환 */}
            {DATA.timeline.tracks.map((track, ti) => {
              const tone = TRACK_TONE[ti];
              return (
                <button
                  key={track.key}
                  type="button"
                  onClick={() => setFieldWrapped(ti)}
                  className={cn(
                    'grid w-full grid-cols-[220px_repeat(4,1fr)] items-center text-left',
                    ti === 0 ? 'mt-4' : 'mt-3',
                  )}
                >
                  <div data-land="fade" data-land-order={3 + ti} className="pr-4">
                    <span className={cn('flex items-center gap-2 text-[15px] font-bold', tone.text)}>
                      <span aria-hidden="true" className={cn('h-4 w-1', tone.bg)} />
                      {t(track.label)}
                    </span>
                    <span className="mt-[3px] block pl-3 text-xs text-content-faint">{t(track.sub)}</span>
                  </div>
                  <div className="relative col-start-2 col-end-6 h-14">
                    {/* 트랙선이 좌→우로 뻗고(rule) 그 위 마커가 순차 점등(fade). 마커에는
                        -translate-x-1/2 가 이미 걸려 있어 이동 계열을 쓰면 위치가 어긋난다. */}
                    <span
                      aria-hidden="true"
                      data-land="rule"
                      data-land-order={3 + ti}
                      className={cn('absolute inset-x-0 top-[35px] h-px opacity-30', tone.bg)}
                    />
                    {track.marks.map((m, mi) => (
                      <span
                        key={mi}
                        data-land="fade"
                        data-land-order={3 + ti}
                        className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[5px]"
                        style={{ left: `${m.at}%` }}
                      >
                        <span aria-hidden="true" className={cn('h-[11px] w-[11px] rounded-full', tone.bg)} />
                        <span
                          className={cn(
                            'whitespace-nowrap px-2 py-[3px] text-[11px] font-semibold',
                            m.solid
                              ? cn(tone.bg, 'text-white')
                              : cn('border bg-surface', tone.border, tone.text),
                          )}
                        >
                          {t(m.label)}
                        </span>
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────── ② 진로 분야 ─────────── */}
      <section aria-labelledby="career-fields" className="mt-16 lg:mt-24">
        <SectionHead title={ko ? '진로 분야' : 'Career Fields'} order={30}>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setFieldWrapped(field - 1)}
              aria-label={ko ? '이전 분야' : 'Previous field'}
              className="grid h-11 w-13 place-items-center text-content transition-colors hover:text-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
            >
              <ArrowIcon dir="left" />
            </button>
            <button
              type="button"
              onClick={() => setFieldWrapped(field + 1)}
              aria-label={ko ? '다음 분야' : 'Next field'}
              className="grid h-11 w-13 place-items-center text-content transition-colors hover:text-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
            >
              <ArrowIcon dir="right" />
            </button>
          </div>
        </SectionHead>
        <h4 id="career-fields" className="sr-only">
          {ko ? '진로 분야별 안내' : 'Guidance by career field'}
        </h4>

        {/* 분야 선택 탭 */}
        <div
          role="group"
          aria-label={ko ? '분야 선택' : 'Select field'}
          className="mb-8 mt-6 overflow-x-auto border-b border-surface-border"
        >
          <div className="flex gap-7">
            {DATA.fields.map((f, i) => {
              const active = i === field;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFieldWrapped(i)}
                  aria-pressed={active}
                  className={cn(
                    'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap pb-3 text-[15px] font-bold transition-colors',
                    active ? 'text-yonsei-navy' : 'text-content-faint hover:text-content',
                  )}
                >
                  {t(f.label)}
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      active ? 'text-yonsei-blue' : 'text-content-faint/70',
                    )}
                  >
                    {t(f.sub)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-yonsei-navy to-yonsei-blue transition-opacity',
                      active ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 분야 0: 기업 취업 (직무) ── */}
        {field === 0 && (
          <div key="f0" className="anim-panel flex flex-wrap gap-8">
            {/* 직무 목록 */}
            <div className="min-w-[220px] flex-1 basis-60">
              <MetaLabel>
                {ko ? '직무 선택' : 'Select role'} <span className="text-yonsei-navy">7</span>
              </MetaLabel>
              <div className="flex flex-col gap-2">
                {DATA.jobs.map((j, i) => {
                  const active = i === jobIdx;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setJobIdx(i)}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[2px] border px-4 py-3 text-left transition-colors',
                        active
                          ? 'border-yonsei-navy bg-yonsei-navy text-white'
                          : 'border-surface-border bg-surface text-content hover:border-yonsei-navy',
                      )}
                    >
                      <span className="text-xs font-bold opacity-55">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[14.5px] font-semibold">{t(j.name)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 직무 상세 */}
            <div className="min-w-[320px] flex-[2] basis-[420px] border-t-2 border-yonsei-navy pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <h5
                  style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
                  className="text-2xl font-bold tracking-tight text-content"
                >
                  {t(job.name)}
                </h5>
                <span
                  className={cn(
                    'rounded-[2px] px-2.5 py-1 text-xs font-bold',
                    job.masters
                      ? 'bg-yonsei-navy text-white'
                      : 'border border-yonsei-navy bg-surface text-yonsei-navy',
                  )}
                >
                  {t(job.degree)}
                </span>
              </div>
              <p className="mt-3.5 max-w-[54ch] text-base leading-[1.65] text-content">{t(job.intro)}</p>

              <div className="mt-6">
                <MetaLabel>{ko ? '핵심 업무' : 'Key work'}</MetaLabel>
                <p className="max-w-[56ch] text-[14.5px] leading-relaxed text-content">{t(job.tasks)}</p>
              </div>

              <div className="mt-5">
                <MetaLabel>{ko ? '주요 역량' : 'Core skills'}</MetaLabel>
                <div className="flex flex-wrap gap-2">
                  {ta(job.skills).map((s) => (
                    <span
                      key={s}
                      className="border border-surface-border bg-surface-soft px-3 py-1.5 text-[13px] font-semibold text-content"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <MetaLabel>
                  {ko ? '대표 진출 산업 · 기업' : 'Representative industries · companies'}
                </MetaLabel>
                <p className="mb-3 text-[13.5px] text-content-faint">{t(job.industries)}</p>
                {job.logos.length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {job.logos.map((l) => (
                      <span
                        key={l.src}
                        title={t(l.name)}
                        className="grid min-h-[50px] min-w-[96px] place-items-center border border-surface-border bg-white px-[18px] py-[11px]"
                      >
                        {/* 기업 CI 는 SVG/소형 래스터 — next/image 최적화 이득이 없고 lazy 로딩만
                            얽히므로 일반 img (사이트의 logo.svg·eagle_empty 와 동일 관례) */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${LOGO_BASE}${l.src}`}
                          alt={t(l.name)}
                          className="h-[26px] w-auto max-w-[116px] object-contain"
                        />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 분야 1: 대학원 진학 ── */}
        {field === 1 && (
          <div key="f1" className="anim-panel">
            <MetaLabel>{ko ? '공통 절차' : 'Common process'}</MetaLabel>
            <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DATA.graduate.steps.map((s, i) => (
                <div key={i} className="border-2 border-content px-[18px] pb-[22px] pt-[18px]">
                  <span className="text-[34px] font-extrabold leading-none text-content">{i + 1}</span>
                  <div className="mt-2.5 text-[15px] font-bold text-content">{t(s.title)}</div>
                  <div className="mt-1.5 text-[12.5px] text-content-faint">{t(s.body)}</div>
                </div>
              ))}
            </div>

            <MetaLabel>{ko ? '경로별 차이' : 'Differences by path'}</MetaLabel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-t-2 border-b-surface-border border-t-yonsei-navy">
                    <th className="w-[140px] px-3.5 py-3 text-left text-xs font-bold text-content-faint">
                      {ko ? '구분' : 'Category'}
                    </th>
                    {DATA.graduate.columns.map((c, i) => (
                      <th
                        key={c.key}
                        className={cn('px-3.5 py-3 text-left text-sm font-bold', TRACK_TONE[i].text)}
                      >
                        {t(c.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DATA.graduate.rows.map((r, ri) => (
                    <tr
                      key={ri}
                      className={cn(
                        'border-b border-surface-border',
                        // 재정 구조 = 의사결정 최대 변수 → 옅은 면으로 강조(시안 지침)
                        r.highlight && 'bg-surface-soft',
                      )}
                    >
                      <td className="px-3.5 py-4 align-top font-bold text-content">{t(r.label)}</td>
                      {r.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-3.5 py-4 align-top text-content"
                          // 신뢰된 자체 콘텐츠(career-paths.json)의 <b> 강조만 포함 — XSS 벡터 없음
                          dangerouslySetInnerHTML={{ __html: t(cell) }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {/* 자대 고유 — 학·석사 연계 */}
              <div className="border-2 border-yonsei-navy px-[22px] py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-yonsei-navy px-2 py-[3px] text-[11px] font-bold text-white">
                    {t(DATA.graduate.linkedTrack.tag)}
                  </span>
                  <span className="text-[11px] font-semibold text-yonsei-navy">
                    {t(DATA.graduate.linkedTrack.note)}
                  </span>
                </div>
                <h5 className="mb-1.5 mt-3 text-[17px] font-bold text-content">
                  {t(DATA.graduate.linkedTrack.title)}
                </h5>
                <p className="text-[13px] leading-relaxed text-content-faint">
                  {t(DATA.graduate.linkedTrack.body)}
                </p>
                <p className="mt-3 text-[12.5px]">
                  <Link
                    href={DATA.graduate.linkedTrack.href}
                    className="font-semibold text-yonsei-blue transition-colors hover:text-yonsei-navy"
                  >
                    {t(DATA.graduate.linkedTrack.linkLabel)}
                  </Link>
                </p>
              </div>

              {/* 전문연구요원 — 출처·기준일 표기 */}
              <div className="border-2 border-content px-[22px] py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="border border-content px-2 py-[3px] text-[11px] font-bold text-content">
                    {t(DATA.graduate.military.tag)}
                  </span>
                  <span className="text-[11px] font-semibold text-content-faint">
                    {t(DATA.graduate.military.note)}
                  </span>
                </div>
                <h5 className="mb-1.5 mt-3 text-[17px] font-bold text-content">
                  {t(DATA.graduate.military.title)}
                </h5>
                <p className="text-[13px] leading-relaxed text-content-faint">
                  {t(DATA.graduate.military.body)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
                  <a
                    href={DATA.graduate.military.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-surface-border px-2.5 py-[5px] text-yonsei-blue transition-colors hover:border-yonsei-blue"
                  >
                    {t(DATA.graduate.military.sourceLabel)} ↗
                  </a>
                  <span className="border border-surface-border px-2.5 py-[5px] text-content-faint">
                    {ko ? '기준일' : 'As of'} · {DATA.graduate.military.updatedAt}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 분야 2: 공공·전문직 (직렬) ── */}
        {field === 2 && (
          <div key="f2" className="anim-panel">
            <p className="mb-3.5 text-[12.5px] text-content-faint">
              {ko ? '라벨 용어: ' : 'Term: '}
              <strong className="text-yonsei-sky">{ko ? '직렬 · 직류' : 'Series · Class'}</strong>
            </p>
            <div className="flex flex-wrap gap-8">
              {/* 갈래 목록 */}
              <div className="min-w-[220px] flex-1 basis-60">
                <MetaLabel>
                  {ko ? '갈래 선택' : 'Select path'} <span className="text-yonsei-sky">4</span>
                </MetaLabel>
                <div className="flex flex-col gap-2">
                  {DATA.branches.map((b, i) => {
                    const active = i === branchIdx;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setBranchIdx(i)}
                        aria-pressed={active}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-[2px] border px-4 py-3 text-left transition-colors',
                          active
                            ? 'border-yonsei-sky bg-yonsei-sky text-white'
                            : 'border-surface-border bg-surface text-content hover:border-yonsei-sky',
                        )}
                      >
                        <span className="text-xs font-bold opacity-55">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[14.5px] font-semibold">{t(b.name)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 갈래 상세 */}
              <div className="min-w-[320px] flex-[2] basis-[420px] border-t-2 border-yonsei-sky pt-5">
                <h5
                  style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
                  className="text-2xl font-bold tracking-tight text-content"
                >
                  {t(branch.name)}
                </h5>
                <p className="mt-3.5 max-w-[54ch] text-base leading-[1.65] text-content">{t(branch.body)}</p>

                <div className="mt-5">
                  <MetaLabel>{t(branch.metaLabel)}</MetaLabel>
                  <div className="flex flex-wrap gap-2">
                    {ta(branch.chips).map((c) => (
                      <span
                        key={c}
                        className="border border-yonsei-sky bg-surface px-3 py-1.5 text-[13px] font-semibold text-yonsei-sky"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 출연연 → 대학원 상호 링크 */}
                {branch.linksGrad && (
                  <div className="mt-6 flex flex-wrap items-center gap-3.5 border border-surface-border bg-surface-soft px-[18px] py-4">
                    <span aria-hidden="true" className="inline-flex">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0057A8" strokeWidth="1.7">
                        <path d="M4 17V9a2 2 0 0 1 2-2h9" />
                        <path d="M12 4l4 3-4 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="flex-1 basis-[200px] text-[13.5px] text-content">
                      <strong>
                        {ko ? '석사 이상 요구가 일반적' : "Master's or higher is typically required"}
                      </strong>
                      {ko ? ' — 대학원 진학 경로와 연결됩니다.' : ' — linked to the graduate-school path.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFieldWrapped(1)}
                      className="whitespace-nowrap border border-yonsei-blue bg-surface px-3.5 py-2 text-[13px] font-bold text-yonsei-blue transition-colors hover:bg-yonsei-blue hover:text-white"
                    >
                      {ko ? '대학원 경로 보기 →' : 'See graduate path →'}
                    </button>
                  </div>
                )}

                {branch.sourceUrl && branch.sourceLabel && (
                  <p className="mt-4 flex flex-wrap gap-2 text-[11.5px]">
                    <a
                      href={branch.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-surface-border px-2.5 py-1 text-yonsei-blue transition-colors hover:border-yonsei-blue"
                    >
                      {t(branch.sourceLabel)} ↗
                    </a>
                    <span className="border border-surface-border px-2.5 py-1 text-content-faint">
                      {ko ? '기준일' : 'As of'} · {branch.updatedAt}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ─────────── ③ 학위 요건 ─────────── */}
      <section aria-labelledby="career-degree" className="mt-16 lg:mt-24">
        <SectionHead title={ko ? '학위 요건' : 'Degree Requirements'} order={60} />
        <h4 id="career-degree" className="sr-only">
          {ko ? '학위별 도달 범위' : 'Reach by degree level'}
        </h4>
        <p data-land="rise" data-land-order="61" className="mb-7 mt-4 max-w-[72ch] text-sm text-content-faint">
          {ko
            ? '상위 학위는 하위 학위의 진로를 모두 포함합니다.'
            : 'Each higher degree includes all the paths of the degrees below it.'}
        </p>

        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* 단계형 막대 — 학위 상승에 따라 도달 범위 증가 */}
            <div className="grid grid-cols-3 items-end">
              {DATA.degrees.levels.map((lv, i) => (
                <div
                  key={i}
                  // 학위 막대는 아래에서 위로 차오른다 — 높이(레이아웃) 대신 clip-path 라
                  // 리플로우가 없고 옆 칸 높이도 흔들리지 않는다
                  data-land="wipe"
                  data-land-from="bottom"
                  data-land-order="62"
                  className={cn(
                    'flex flex-col px-[15px] py-2.5 text-white',
                    [66, 100, 134][i] === 66 ? 'h-[66px]' : [66, 100, 134][i] === 100 ? 'h-[100px]' : 'h-[134px]',
                    ['bg-yonsei-sky', 'bg-yonsei-blue', 'bg-yonsei-navy'][i],
                    i > 0 && 'border-l-2 border-white',
                  )}
                >
                  <span
                    style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
                    className="text-lg font-extrabold leading-[1.05]"
                  >
                    {t(lv.label)}
                  </span>
                  <span className="text-[10.5px] font-semibold opacity-85">{lv.abbr}</span>
                </div>
              ))}
            </div>
            <div className="mb-6 flex items-center justify-between border-t-2 border-yonsei-navy pt-2">
              <span className="text-[11.5px] font-semibold text-content-faint">
                {ko ? '도달 범위 누적' : 'Cumulative reach'}
              </span>
              <span className="text-[11.5px] font-semibold text-content-faint">
                {ko ? '학위 상승 →' : 'Degree level →'}
              </span>
            </div>

            {/* 각 학위에서 새로 열리는 진로 */}
            <div className="grid grid-cols-3 gap-5">
              {DATA.degrees.columnTitles.map((title, li) => (
                <div
                  key={li}
                  className={cn(
                    'border-t-2 pt-3.5',
                    ['border-yonsei-sky', 'border-yonsei-blue', 'border-yonsei-navy'][li],
                  )}
                >
                  <p className="mb-3 text-xs font-bold text-content">{t(title)}</p>
                  <div className="flex flex-wrap gap-[7px]">
                    {DATA.degrees.roles
                      .filter((r) => r.level === li)
                      .map((r) => (
                        <span
                          key={t(r.name)}
                          className="bg-yonsei-navy px-2.5 py-[5px] text-xs font-semibold text-white"
                        >
                          {t(r.name)}
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 진로 × 학위 매트릭스 */}
        <div className="mt-14">
          <p className="mb-4 max-w-[72ch] text-sm text-content-faint">
            {ko ? '학위 매트릭스' : 'Degree matrix'}
          </p>
          <div className="mb-3.5 flex gap-4 text-xs text-content-faint">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-3 w-3 bg-yonsei-navy" />
              {ko ? '가능' : 'Available'}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-3 w-3 border border-surface-border" />
              {ko ? '해당 없음' : 'Not applicable'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-t-2 border-b-surface-border border-t-yonsei-navy">
                  <th className="px-2.5 py-2.5 text-left text-xs font-bold text-content-faint">
                    {ko ? '진로' : 'Path'}
                  </th>
                  {DATA.degrees.levels.map((lv, i) => (
                    <th
                      key={i}
                      style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
                      className="w-24 px-1.5 py-2.5 text-sm font-bold text-content"
                    >
                      {ko ? lv.label.ko : lv.abbr.replace(/\./g, '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DATA.degrees.roles.map((r) => (
                  <tr key={t(r.name)} className="border-b border-surface-border">
                    <td className="px-2.5 py-2.5 text-[13.5px] font-semibold text-content">{t(r.name)}</td>
                    {[0, 1, 2].map((c) => (
                      <td key={c} className="px-1.5 py-2.5 text-center">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'inline-block h-3.5 w-3.5',
                            c >= r.level ? 'bg-yonsei-navy' : 'border border-surface-border',
                          )}
                        />
                        <span className="sr-only">
                          {c >= r.level ? (ko ? '가능' : 'available') : ko ? '해당 없음' : 'not applicable'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
