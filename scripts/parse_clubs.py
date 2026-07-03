#!/usr/bin/env python
"""_import/동아리소개.html 전용 파서.

각 동아리는 `<h4>[클럽명]</h4>` + 이미지 + 표(td 안에 <div> 줄바꿈)로 구성되어
있어 범용 마크다운 추출기로는 한 줄로 뭉개진다. td 안의 <div>를 줄 단위로
순회하며 문단/불릿/소제목([팀명])을 복원한다.

출력: content/pages/club-<slug>.md (문단 구조 보존), content/clubs.json (인덱스+티저)
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parent.parent
IMPORT_DIR = ROOT / "_import"
PAGES_DIR = ROOT / "content" / "pages"

SLUGS = {
    "연세드론": "yonseidrone",
    "메카 (MECar)": "mecar",
    "로보인": "roboin",
    "SPACE Y": "spacey",
}


def cell_lines(td: Tag) -> list[str]:
    """<td> 안의 최하위 <div>들을 텍스트 줄 배열로 변환 (중첩 div 중복 방지)."""
    lines: list[str] = []
    divs = td.find_all("div")
    # 최하위(leaf) div만: 자식으로 div를 갖지 않는 것들
    leaves = [d for d in divs if not d.find("div")] or divs
    for d in leaves:
        text = d.get_text(" ", strip=True)
        lines.append(text)
    if not lines:
        lines = [td.get_text(" ", strip=True)]
    return lines


def lines_to_markdown(lines: list[str]) -> str:
    out: list[str] = []
    for raw in lines:
        text = raw.replace("\xa0", "").strip()
        if not text:
            out.append("")
            continue
        if text.startswith("[") and text.endswith("]"):
            out.append(f"\n**{text}**\n")
        elif text.startswith("-") or text.startswith("●"):
            out.append(f"- {text.lstrip('-●').strip()}")
        else:
            out.append(text)
    # 빈 줄 중복 정리
    cleaned: list[str] = []
    for ln in out:
        if ln == "" and (not cleaned or cleaned[-1] == ""):
            continue
        cleaned.append(ln)
    return "\n".join(cleaned).strip()


def main() -> None:
    html = (IMPORT_DIR / "동아리소개.html").read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one("#jwxe_main_content")

    clubs = []
    headings = content.select("h4.h4-tit01")
    for h in headings:
        title_raw = h.get_text(strip=True)
        m = re.match(r"^\[(.+)\]$", title_raw)
        if not m:
            continue
        name = m.group(1).strip()
        slug = SLUGS.get(name, re.sub(r"[^a-z0-9]+", "-", name.lower()))

        # 이미지: h4 다음 형제 중 첫 img
        img_alt = None
        node = h.find_next(["p", "div", "img"])
        hops = 0
        while node and hops < 5:
            img = node.find("img") if node.name != "img" else node
            if img:
                img_alt = img.get("alt") or img.get("src", "").split("/")[-1]
                break
            node = node.find_next(["p", "div", "img"])
            hops += 1

        table = h.find_next("table")
        td = table.select("tbody td")[-1] if table else None
        lines = cell_lines(td) if td is not None else []
        body_md = lines_to_markdown(lines)

        teaser_line = next((l for l in lines if l.strip() and not l.startswith("[") and not l.startswith("-")), "")
        teaser = teaser_line.strip()
        if len(teaser) > 90:
            teaser = teaser[:87].rstrip() + "..."

        img_line = f"> 🖼️ 이미지 자리: {img_alt}\n\n" if img_alt else ""
        md = f"#### {name}\n\n{img_line}{body_md}\n"
        (PAGES_DIR / f"club-{slug}.md").write_text(md, encoding="utf-8")
        clubs.append({"slug": slug, "name": name, "teaser": teaser})
        print(f"club-{slug}.md  ({len(md)} chars)  teaser: {teaser[:40]}")

    (ROOT / "content" / "clubs.json").write_text(
        json.dumps(clubs, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
