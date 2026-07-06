#!/usr/bin/env python
"""tools/import-raw/졸업요건.html (학부 졸업요건, 학번별 아코디언) 전용 파서.

원본은 `.view-box` 14개(전체 요약 + 학번 구간 13개)로 구성된 접이식 섹션이다.
범용 추출기는 헤딩 태그가 아닌 <span> 라벨을 인식하지 못해 하나로 뭉개고
22~24학번 구간을 통째로 놓쳤다 — 이 스크립트는 `.view-box` 단위로 정확히
쪼개 라벨 + 표(rowspan/colspan 처리) + 불릿을 뽑아 JSON으로 저장한다.

출력: content/undergraduate-requirements.json
      [{ "label": "03~05 학번", "markdown": "..." }, ...]
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parent.parent
IMPORT_DIR = ROOT / "tools" / "import-raw"


def parse_table(table: Tag) -> list[list[str]]:
    grid: dict[tuple[int, int], str] = {}
    trs = table.find_all("tr")
    for r, tr in enumerate(trs):
        c = 0
        for cell in tr.find_all(["th", "td"]):
            while (r, c) in grid:
                c += 1
            text = cell.get_text(" ", strip=True)
            try:
                rs = int(cell.get("rowspan", 1) or 1)
                cs = int(cell.get("colspan", 1) or 1)
            except ValueError:
                rs, cs = 1, 1
            for dr in range(rs):
                for dc in range(cs):
                    grid[(r + dr, c + dc)] = text
            c += cs
    ncols = max((c for (_, c) in grid), default=-1) + 1
    return [[grid.get((r, c), "") for c in range(ncols)] for r in range(len(trs))]


def table_to_markdown(table: Tag) -> str:
    rows = [r for r in parse_table(table) if any(c.strip() for c in r)]
    if not rows:
        return ""
    ncol = max(len(r) for r in rows)
    lines = []
    # 원본 <caption>은 아코디언 라벨과 중복되거나(예: "19학번 표"가
    # 20/21/22학번 표에도 잘못 복사돼있음) 사이트 자체 버그라 렌더하지 않는다.
    for i, row in enumerate(rows):
        padded = [c.replace("|", "\\|").replace("\n", " ") for c in row] + [""] * (ncol - len(row))
        lines.append("| " + " | ".join(padded) + " |")
        if i == 0:
            lines.append("| " + " | ".join(["---"] * ncol) + " |")
    return "\n".join(lines) + "\n"


def block_to_markdown(node: Tag) -> str:
    """view-detail-box 안의 표/리스트/문단을 순서대로 마크다운으로."""
    parts: list[str] = []
    for child in node.find_all(["table", "ul", "h5", "p"], recursive=True):
        # 중첩된 table/ul 내부의 h5,p는 건너뛰어 중복 방지
        if child.find_parent(["table"]) is not None:
            continue
        if child.name == "table":
            md = table_to_markdown(child)
            if md.strip():
                parts.append(md)
        elif child.name == "ul":
            if child.find_parent("ul") is not None:
                continue
            items = [li.get_text(" ", strip=True) for li in child.find_all("li", recursive=False)]
            items = [i for i in items if i]
            if items:
                parts.append("\n".join(f"- {i}" for i in items) + "\n")
        elif child.name == "h5":
            text = child.get_text(" ", strip=True)
            if text and text != "※ 졸업이수요건표는 학번별로 확인해주시기 바랍니다":
                parts.append(f"#### {text}\n")
            elif text:
                parts.append(f"> {text}\n")
        elif child.name == "p":
            if child.find_parent(["table", "ul"]) is not None:
                continue
            text = child.get_text(" ", strip=True)
            if text and text != "\xa0":
                parts.append(text + "\n")
    # 중복 빈 줄 정리
    out = "\n".join(parts)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def main() -> None:
    html = (IMPORT_DIR / "졸업요건.html").read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    boxes = soup.select(".view-box")

    sections = []
    for box in boxes:
        span = box.select_one("p.bt a span")
        label = span.get_text(strip=True) if span else "섹션"
        detail = box.select_one(".view-detail-box")
        md = block_to_markdown(detail) if detail else ""
        sections.append({"label": label, "markdown": md})
        print(f"{label:20} {len(md)} chars")

    out_path = ROOT / "content" / "undergraduate-requirements.json"
    out_path.write_text(json.dumps(sections, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(sections)}개 섹션 저장 → {out_path}")


if __name__ == "__main__":
    main()
