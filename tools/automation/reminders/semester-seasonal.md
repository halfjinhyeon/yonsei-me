**{{termLabel}}({{term}})** 수강편람이 열릴 때입니다. 아래를 갱신하고 끝나면 이 이슈를 닫아 주세요.

ℹ️ **계절학기는 마일리지 제도 밖**입니다(수강신청에 마일리지를 쓰지 않습니다). 그래서 마일리지 재계산·백테스트 항목이
없고, 졸업요건 체커의 **과목 카탈로그 갱신**만 필요합니다.

- [ ] **① 쿠키 갱신** — 수강편람에 학사 계정으로 로그인해 세션 쿠키를 크롤러 저장소의 `.env`(로컬 `Desktop\크롤링\.env`)
      `YONSEI_COOKIE` 에 넣습니다. **수 시간이면 만료**되므로 작업 직전에 받고, 저장소·Actions Secrets 에는 넣지 않습니다.
- [ ] **② 오케스트레이터 실행** — `node tools/automation/update-semester.mjs --target {{term}}`
      쿠키 만료로 멈추면 ①을 다시 하고 **같은 명령을 재실행**합니다(이어서 진행됩니다).
- [ ] **③ 체커 게이트** — `build-catalog` 가 exit 1 로 멈추면 `tools/checker/reports/rename-report.json` 의 개명 후보를 보고
      요건(`content/undergraduate-requirements.json`·`checker-requirements.json`)과 교양(`liberal-arts.json`)을 갱신합니다.
      매칭이 **이름 기반**이라 같은 정규화 이름이 두 항목에 있으면 이중 집계됩니다 — 고친 뒤
      `node tools/checker/verify-matching.mjs` 가 **6/6** 인지 반드시 확인.
      → [tools/checker/README.md](https://github.com/yonsei-mech/yonsei-me/blob/main/tools/checker/README.md)
- [ ] **⑥ 검증** — `npm run typecheck` 통과 + 화면 확인(졸업요건 체커 STEP 03 과목 검색).
- [ ] **⑦ 커밋** — 바뀐 파일만 **명시적으로 스테이징**합니다. 작업 트리에 다른 작업의 WIP 가 섞여 있어 `git add -A` 는 금지입니다.

(번호는 정규학기 체크리스트와 맞춰 두었습니다 — ④ 마일리지·⑤ 교재는 계절학기에 해당 없음.)
