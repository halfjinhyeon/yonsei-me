**{{termLabel}}({{term}})** 수강편람이 열릴 때입니다. 아래 순서대로 갱신하고, 끝나면 이 이슈를 닫아 주세요.
자동으로 만들어진 체크리스트이며 **실행은 사람이 합니다** — 로그인 쿠키가 필요하고 채택 판단이 섞여 있어
무인화하지 않기로 한 구간입니다([자동화 계획 2절·6절](https://github.com/yonsei-mech/yonsei-me/blob/main/tools/automation-plan.md)).

- [ ] **① 쿠키 갱신** — 수강편람에 학사 계정으로 로그인해 세션 쿠키를 크롤러 저장소의 `.env`(로컬 `Desktop\크롤링\.env`)
      `YONSEI_COOKIE` 에 넣습니다. **수 시간이면 만료**되므로 작업 직전에 받고, 저장소·Actions Secrets 에는 넣지 않습니다.
- [ ] **② 오케스트레이터 실행** — `node tools/automation/update-semester.mjs --target {{term}}`
      쿠키 만료로 멈추면 ①을 다시 하고 **같은 명령을 재실행**합니다(이어서 진행됩니다).
- [ ] **③ 체커 게이트** — `build-catalog` 가 exit 1 로 멈추면 `tools/checker/reports/rename-report.json` 의 개명 후보를 보고
      요건(`content/undergraduate-requirements.json`·`checker-requirements.json`)과 교양(`liberal-arts.json`)을 갱신합니다.
      매칭이 **이름 기반**이라 같은 정규화 이름이 두 항목에 있으면 이중 집계됩니다 — 고친 뒤
      `node tools/checker/verify-matching.mjs` 가 **6/6** 인지 반드시 확인.
      → [tools/checker/README.md](https://github.com/yonsei-mech/yonsei-me/blob/main/tools/checker/README.md)
- [ ] **④ 마일리지 — 판단이 필요한 3가지** (자동화하지 않습니다)
  - `tools/mileage/professor-history.csv` 에 이번 학기 담당 교수 보강 — 이력을 분반이 아니라 **교수를 따라** 재배치하기 때문입니다.
  - `tools/mileage/precompute.mjs` 의 `RECENCY_ALIAS` 재검토.
  - 백테스트의 신·구 **공통 분반 비교**로 채택 여부 판단 — 측정하지 않은 개선은 채택하지 않습니다.
  - → [tools/mileage/README.md](https://github.com/yonsei-mech/yonsei-me/blob/main/tools/mileage/README.md)
- [ ] **⑤ 교재 수동 갱신** (자동화 제외 — [계획서 6절](https://github.com/yonsei-mech/yonsei-me/blob/main/tools/automation-plan.md))
      수업계획서 화면에서 이번 학기 교재를 뽑아 `Desktop\교재 매칭` 의 `generate_all_formats.py` 후처리 →
      `node tools/textbooks/mirror-covers.mjs` → `node tools/textbooks/build-content.mjs`.
- [ ] **⑥ 검증** — `npm run typecheck` 통과 + 화면 확인(졸업요건 체커 STEP 03 과목 검색, 마일리지 전략 탭의 새 학기 표시).
- [ ] **⑦ 커밋** — 바뀐 파일만 **명시적으로 스테이징**합니다. 작업 트리에 다른 작업의 WIP 가 섞여 있어 `git add -A` 는 금지입니다.
