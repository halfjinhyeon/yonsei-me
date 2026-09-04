/**
 * 봇 브랜치 커밋 → 푸시 → PR — **작업 트리·HEAD·현재 인덱스를 전혀 건드리지 않는다.**
 *
 *   node tools/automation/bot-pr.mjs --branch bot/semester-2026-20 \
 *        --title "[자동] 2026-20 학기 데이터 갱신" --body-file <md> [--label automation] \
 *        [--base main] [--dry-run] <파일>…
 *
 * 왜 plumbing 인가
 *   이 저장소는 사람이 여러 세션으로 동시에 쓰고, dev 서버가 이 작업 트리를 그대로 서빙한다.
 *   `git add`/`commit`/`checkout` 은 남의 WIP 을 스테이징하거나 화면을 바꿔 버린다. 그래서
 *   **임시 인덱스**(`GIT_INDEX_FILE=tools/automation/.state/pr-index`)에 HEAD 트리를 읽고
 *   지정한 파일만 얹어 커밋 객체를 직접 만든다. 자기 인덱스는 이 스크립트가 끝나면 지운다.
 *
 *   ① rm .state/pr-index            (앞선 실행의 찌꺼기)
 *   ② git read-tree HEAD            (임시 인덱스에 HEAD 트리)
 *   ③ git update-index --add --replace -- <파일>…   (작업 트리의 현재 내용만 얹는다)
 *   ④ git write-tree                → tree
 *   ⑤ git commit-tree <tree> -p <부모> -m <메시지>  → commit
 *   ⑥ git update-ref refs/heads/<브랜치> <commit>   (dry-run 은 여기서 멈춘다)
 *   ⑦ git push origin refs/heads/<브랜치>
 *   ⑧ gh pr list --head → 있으면 gh pr comment · 없으면 gh pr create
 *
 *   부모는 원격 브랜치가 이미 있으면 그 tip(이어 붙이기), 없으면 HEAD 다. 트리는 언제나
 *   **HEAD + 지정 파일**이므로, 원격 tip 에만 있던 다른 변경은 이 커밋에서 되돌아간다 —
 *   봇 브랜치에는 매 실행 같은 산출물만 올리므로 실제로는 같은 파일을 덮는 것뿐이다.
 *
 * 종료 코드: 0 성공(커밋할 것이 없어 아무것도 안 한 경우 포함) · 1 인자 오류 / git·gh 실패
 *
 * ⚠️ 함정
 *   · 브랜치 이름은 `bot/` 으로 시작해야 한다 — 실수로 main 을 갱신하는 사고를 막는다.
 *   · `--dry-run` 도 커밋 **객체**는 만든다(ref 가 가리키지 않는 dangling 객체라 gc 대상).
 *     ref 갱신·푸시·PR 은 하지 않는다.
 *   · 원격에 브랜치가 있는데 로컬에 `refs/remotes/origin/<브랜치>` 가 없으면
 *     `git fetch --refmap= origin refs/heads/<브랜치>` 로 **FETCH_HEAD 만** 받는다
 *     (`--refmap=` 이 없으면 remote-tracking ref 까지 덩달아 갱신된다).
 *   · `gh` 는 셸 없이 부른다 — 제목에 `[]`·`()` 가 들어간다(issue.mjs 와 같은 이유).
 *
 * 정본 문서: tools/automation-phase3.md 2절 P3-2
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const STATE_DIR = join(HERE, '.state');
const INDEX_FILE = join(STATE_DIR, 'pr-index');
const COAUTHOR = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>';
const RULE = '─'.repeat(72);

const USAGE = `사용법: node tools/automation/bot-pr.mjs --branch <bot/…> --title "<제목>" --body-file <경로> [옵션] <파일>…

인자
  --branch <이름>     봇 브랜치 (필수 · 반드시 'bot/' 으로 시작)
  --title "<제목>"    PR 제목 겸 커밋 제목 (필수)
  --body-file <경로>  PR 본문 마크다운 (필수)
  --base <브랜치>     PR 대상 (기본 main)
  --label <라벨>      PR 라벨 (기본 automation)
  --dry-run           커밋 객체까지만 만들고 git show --stat 을 찍는다 (ref·푸시·PR 없음)
  --help, -h          이 도움말
  <파일>…             커밋에 올릴 파일 (저장소 기준 상대 경로 · 최소 1개)`;

// ── 인자 파싱 ──────────────────────────────────────────────────
const opt = { branch: null, title: null, bodyFile: null, base: 'main', label: 'automation', dryRun: false };
const inputs = [];
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (a === '--dry-run') opt.dryRun = true;
    else if (a === '--branch') opt.branch = argv[++i];
    else if (a === '--title') opt.title = argv[++i];
    else if (a === '--body-file') opt.bodyFile = argv[++i];
    else if (a === '--base') opt.base = argv[++i];
    else if (a === '--label') opt.label = argv[++i];
    else if (a.startsWith('--')) fail(`알 수 없는 인자: ${a}`);
    else inputs.push(a);
  }
}

function fail(msg) {
  console.error(`\n[중단] ${msg}\n`);
  console.error(USAGE);
  process.exit(1);
}

if (!opt.branch) fail('--branch 가 필요하다.');
if (!/^bot\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(opt.branch)) {
  fail(`--branch 는 'bot/' 으로 시작하는 이름이어야 한다 (실수로 보호 브랜치를 갱신하는 사고 방지): ${opt.branch}`);
}
if (!opt.title || opt.title.trim() === '') fail('--title 이 필요하다.');
if (!opt.bodyFile) fail('--body-file 이 필요하다.');
if (!existsSync(opt.bodyFile)) fail(`--body-file 을 찾지 못했다: ${opt.bodyFile}`);
if (inputs.length === 0) fail('커밋에 올릴 파일을 하나 이상 줘야 한다.');

/** 저장소 안이면 저장소 기준 상대 경로로, 밖이면(임시 파일 등) 절대 경로 그대로 */
const rel = (p) => {
  const r = relative(REPO, resolve(p)).replaceAll('\\', '/');
  return r === '' || r.startsWith('..') ? resolve(p).replaceAll('\\', '/') : r;
};

/** 저장소 기준 상대 경로(슬래시)로 정규화한다. 저장소 밖 경로는 거부. */
const FILES = inputs.map((p) => {
  const rel = relative(REPO, resolve(REPO, p)).replaceAll('\\', '/');
  if (rel === '' || rel.startsWith('..')) fail(`저장소 밖 경로는 커밋할 수 없다: ${p}`);
  if (!existsSync(join(REPO, rel))) fail(`파일이 없다: ${rel}`);
  return rel;
});

// ── git · gh ───────────────────────────────────────────────────
/** 셸 없이 실행하고 { ok, out, err } 를 돌려준다. index:true 면 임시 인덱스를 쓴다. */
function exec(cmd, args, { index = false } = {}) {
  const env = index ? { ...process.env, GIT_INDEX_FILE: INDEX_FILE } : process.env;
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8', env });
  if (r.error) return { ok: false, out: '', err: String(r.error.message || r.error) };
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}
/** 실패하면 중단한다. */
function must(cmd, args, opts) {
  console.log(`  $ ${[cmd, ...args].map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(' ')}`);
  const r = exec(cmd, args, opts);
  if (!r.ok) {
    cleanup();
    console.error(`\n[중단] ${cmd} 실패: ${r.err || r.out || '(출력 없음)'}`);
    process.exit(1);
  }
  return r.out;
}
const git = (args, opts) => must('git', args, opts);
const gh = (args) => exec('gh', args);

function cleanup() {
  rmSync(INDEX_FILE, { force: true });
}

// ── ①~④ 임시 인덱스로 트리 만들기 ─────────────────────────────
console.log(`${RULE}
봇 PR — ${opt.branch}${opt.dryRun ? '  [dry-run: ref·푸시·PR 없음]' : ''}
${RULE}
  제목   : ${opt.title}
  본문   : ${rel(opt.bodyFile)}
  파일   : ${FILES.length}개
${FILES.map((f) => `           · ${f}`).join('\n')}
  임시 인덱스: ${rel(INDEX_FILE)}  (작업 트리·HEAD·현재 인덱스 무변경)`);

mkdirSync(STATE_DIR, { recursive: true });
cleanup(); // 앞선 실행이 남긴 인덱스를 쓰지 않는다

const HEAD = git(['rev-parse', 'HEAD']);
git(['read-tree', 'HEAD'], { index: true });
git(['update-index', '--add', '--replace', '--', ...FILES], { index: true });
const TREE = git(['write-tree'], { index: true });

// ── ⑤ 부모 고르기 · 커밋 객체 ─────────────────────────────────
/** 원격 봇 브랜치의 tip(로컬에 객체가 있는 상태). 없으면 null. */
function remoteTip() {
  const tracking = exec('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${opt.branch}`]);
  if (tracking.ok && tracking.out) return tracking.out;
  if (opt.dryRun) return null; // dry-run 은 네트워크를 쓰지 않는다
  const ls = exec('git', ['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${opt.branch}`]);
  if (!ls.ok) return null; // 원격에 없다 — 새 브랜치다
  // 객체를 받아야 -p 로 이을 수 있다. --refmap= 로 remote-tracking ref 는 건드리지 않는다.
  const fetched = exec('git', ['fetch', '--no-tags', '--refmap=', 'origin', `refs/heads/${opt.branch}`]);
  if (!fetched.ok) {
    console.warn(`  ! 원격 ${opt.branch} 을 받지 못했다: ${fetched.err} — HEAD 를 부모로 쓴다(푸시가 거부될 수 있다).`);
    return null;
  }
  const head = exec('git', ['rev-parse', 'FETCH_HEAD']);
  return head.ok && head.out ? head.out : null;
}

const PARENT = remoteTip() ?? HEAD;
console.log(`\n  부모 커밋: ${PARENT.slice(0, 12)}${PARENT === HEAD ? ' (HEAD)' : ` (원격 ${opt.branch} tip)`}`);

if (git(['rev-parse', `${PARENT}^{tree}`]) === TREE) {
  console.log(`\n  부모와 트리가 같다 — 커밋할 변경이 없다. 아무것도 하지 않는다.`);
  cleanup();
  process.exit(0);
}

const MESSAGE = [
  opt.title,
  '',
  '자동 생성 — tools/automation/update-semester.mjs → bot-pr.mjs',
  `HEAD ${HEAD.slice(0, 12)} 기준, 아래 ${FILES.length}개 파일만 얹었다:`,
  ...FILES.map((f) => `  · ${f}`),
  '',
  COAUTHOR,
].join('\n');

const COMMIT = git(['commit-tree', TREE, '-p', PARENT, '-m', MESSAGE]);
console.log(`  커밋 객체: ${COMMIT.slice(0, 12)}`);

if (opt.dryRun) {
  console.log(`\n${RULE}\n[dry-run] git show --stat ${COMMIT.slice(0, 12)}\n${RULE}`);
  console.log(exec('git', ['show', '--stat', COMMIT]).out);
  console.log(`\n${RULE}`);
  console.log('dry-run 끝 — ref 갱신·푸시·PR 없음. 위 커밋 객체는 ref 가 없어 gc 대상이다.');
  console.log(RULE);
  cleanup();
  process.exit(0);
}

// ── ⑥⑦ ref 갱신 · 푸시 ────────────────────────────────────────
{
  const old = exec('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${opt.branch}`]);
  // 세 번째 인자(기대하는 옛 값)를 주면 그 사이 누가 브랜치를 옮겼을 때 덮지 않고 실패한다.
  git(['update-ref', `refs/heads/${opt.branch}`, COMMIT, ...(old.ok && old.out ? [old.out] : [''])]);
}
{
  const pushed = exec('git', ['push', 'origin', `refs/heads/${opt.branch}:refs/heads/${opt.branch}`]);
  console.log(`  $ git push origin refs/heads/${opt.branch}`);
  if (!pushed.ok) {
    cleanup();
    console.error(`\n[중단] 푸시 실패: ${pushed.err || pushed.out}`);
    console.error(`  원격이 앞서 있으면 'git fetch origin ${opt.branch}' 뒤 같은 명령을 다시 돌려라.`);
    process.exit(1);
  }
  console.log(`  ✔ 푸시 완료 ${pushed.err || pushed.out}`);
}
cleanup();

// ── ⑧ PR — 이미 열려 있으면 댓글 ──────────────────────────────
{
  let open = null;
  const list = gh(['pr', 'list', '--head', opt.branch, '--state', 'open', '--json', 'number', '--limit', '5']);
  if (!list.ok) {
    console.warn(`  ! 열린 PR 조회 실패(중복 확인 생략): ${list.err || list.out}`);
  } else {
    try {
      open = JSON.parse(list.out || '[]')[0]?.number ?? null;
    } catch {
      console.warn(`  ! gh pr list 출력을 JSON 으로 읽지 못했다: ${list.out.slice(0, 200)}`);
    }
  }

  if (open) {
    const r = gh(['pr', 'comment', String(open), '--body-file', opt.bodyFile]);
    if (!r.ok) {
      console.error(`\n[중단] gh pr comment 실패: ${r.err || r.out}`);
      process.exit(1);
    }
    console.log(`\n  ✔ 이미 열린 PR #${open} 에 이번 실행 결과를 댓글로 남겼다. ${r.out}`);
  } else {
    const label = gh(['label', 'create', opt.label, '--color', '0057A8', '--description', '자동화 워크플로가 만든 이슈', '--force']);
    if (!label.ok) console.warn(`  ! 라벨 '${opt.label}' 보장 실패: ${label.err || label.out}`);
    const args = ['pr', 'create', '--base', opt.base, '--head', opt.branch, '--title', opt.title, '--body-file', opt.bodyFile];
    let r = gh([...args, '--label', opt.label]);
    if (!r.ok && /label/i.test(r.err)) {
      console.warn(`  ! 라벨을 붙이지 못해 라벨 없이 다시 만든다: ${r.err}`);
      r = gh(args);
    }
    if (!r.ok) {
      console.error(`\n[중단] gh pr create 실패: ${r.err || r.out}`);
      console.error('  브랜치는 이미 푸시됐다 — 원인을 고치고 같은 명령을 다시 돌리면 PR 만 만든다.');
      process.exit(1);
    }
    console.log(`\n  ✔ PR 을 만들었다. ${r.out}`);
  }
}

console.log(`\n${RULE}\n${opt.branch} 준비 완료 — 사람이 할 일은 머지 1클릭이다.\n${RULE}`);
