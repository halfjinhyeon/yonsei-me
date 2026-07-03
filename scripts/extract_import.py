#!/usr/bin/env python
"""현행 학부 홈페이지에서 저장한 HTML의 '본문만' 추출한다.

사용법:
    python scripts/extract_import.py

동작:
    _import/*.html 각각에 대해
      - script/style/nav/header/footer/aside/form 등 보일러플레이트 제거
      - 흔한 본문 컨테이너 셀렉터를 시도해 텍스트가 가장 많은 영역 선택
      - 제목/문단/목록/표를 마크다운 비슷하게 정리
      - _import/out/<이름>.md 로 저장
    마지막에 파일별 글자 수 요약만 출력 (원본을 컨텍스트로 읽지 않음).
"""
from __future__ import annotations
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup, Tag
except ImportError:
    print("beautifulsoup4가 필요합니다:  python -m pip install beautifulsoup4")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
IMPORT_DIR = ROOT / "_import"
OUT_DIR = IMPORT_DIR / "out"

# 제거할 보일러플레이트 태그/역할
STRIP_TAGS = ["script", "style", "noscript", "nav", "header", "footer",
              "aside", "form", "button", "select", "iframe", "svg"]
# 본문일 가능성이 높은 셀렉터 (앞쪽 우선, 없으면 텍스트 최다 영역)
CONTENT_SELECTORS = [
    "#jwxe_main_content",  # 연세 CMS 본문 컨테이너 (최우선)
    "#contents", "#content", ".contents", ".content",
    ".sub_content", ".subContent", ".sub-content",
    ".board-view", ".boardView", ".view_content", ".bbs-view",
    "#container .con", ".contents_area", "main", "article",
]


# CMS 공통 크롬(사이드 메뉴/경로/타이틀 등) — 본문 아님
STRIP_SELECTORS = [
    "#go_main", ".lnb", ".path-wrap", ".path-box", ".jwxe_navigator",
    ".sub-visual-intro-wrap", ".tab-wrap", ".page-title", ".footer-rule",
]


def clean(soup: BeautifulSoup) -> None:
    for tag in soup(STRIP_TAGS):
        tag.decompose()
    # 접근성 숨김/장식성 요소 + CMS 크롬 제거
    for tag in soup.select("[aria-hidden=true], .blind, .hidden, .skip, "
                           + ", ".join(STRIP_SELECTORS)):
        tag.decompose()


def pick_main(soup: BeautifulSoup) -> Tag:
    best = None
    best_len = 0
    for sel in CONTENT_SELECTORS:
        for node in soup.select(sel):
            length = len(node.get_text(strip=True))
            if length > best_len:
                best, best_len = node, length
    # 그래도 못 찾으면 body 전체 (이미지 위주 페이지 대비 임계값 낮춤)
    if best is None or best_len < 5:
        best = soup.body or soup
    return best


def parse_table(table: Tag) -> list[list[str]]:
    """rowspan/colspan을 반영해 표를 격자로 펼친다 (병합 셀 값은 아래/옆으로 채움)."""
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


def to_markdown(node: Tag) -> str:
    lines: list[str] = []

    def walk(el):
        if not isinstance(el, Tag):
            return
        name = el.name
        if name in ("h1", "h2", "h3", "h4", "h5"):
            level = int(name[1])
            text = el.get_text(" ", strip=True)
            if text:
                lines.append("\n" + "#" * min(level, 4) + " " + text)
            return
        if name == "li":
            text = el.get_text(" ", strip=True)
            if text:
                lines.append("- " + text)
            return
        if name == "table":
            rows = [r for r in parse_table(el) if any(c.strip() for c in r)]
            if rows:
                ncol = max(len(r) for r in rows)
                if lines and lines[-1].strip():
                    lines.append("")  # GFM 표는 앞에 빈 줄 필요
                for i, row in enumerate(rows):
                    padded = [c.replace("|", "\\|") for c in row] + [""] * (ncol - len(row))
                    lines.append("| " + " | ".join(padded) + " |")
                    if i == 0:  # 헤더 다음 구분선 (GFM 표 인식용)
                        lines.append("| " + " | ".join(["---"] * ncol) + " |")
            lines.append("")
            return
        if name == "img":
            alt = (el.get("alt") or "").strip()
            src = (el.get("src") or "").strip()
            # 파일명만 추출 (경로 제거)
            fname = src.replace("\\", "/").split("/")[-1] if src else ""
            label = alt or fname or "이미지"
            # 이미지는 생성하지 않고 자리 표시만 (blockquote)
            lines.append(f"> 🖼️ 이미지 자리: {label}")
            return
        if name in ("p", "div", "span", "td", "strong", "em", "a", "br",
                    "ul", "ol", "section", "dl", "dd", "dt"):
            # 자식이 블록이면 재귀, 아니면 텍스트
            if el.find(["p", "li", "table", "h1", "h2", "h3", "h4",
                        "ul", "ol", "div", "img"]):
                for child in el.children:
                    walk(child)
            else:
                text = el.get_text(" ", strip=True)
                if text:
                    lines.append(text)
            return
        for child in el.children:
            walk(child)

    walk(node)
    # 중복 빈 줄 정리
    out: list[str] = []
    for ln in lines:
        if ln.strip() == "" and (not out or out[-1].strip() == ""):
            continue
        out.append(ln.rstrip())
    return "\n".join(out).strip() + "\n"


def main() -> None:
    if not IMPORT_DIR.exists():
        print(f"폴더 없음: {IMPORT_DIR}")
        return
    html_files = sorted(IMPORT_DIR.glob("*.html")) + sorted(IMPORT_DIR.glob("*.htm"))
    if not html_files:
        print("_import/ 에 .html 파일이 없습니다. 파일을 넣고 다시 실행하세요.")
        return
    OUT_DIR.mkdir(exist_ok=True)

    summary = []
    for f in html_files:
        raw = f.read_text(encoding="utf-8", errors="ignore")
        soup = BeautifulSoup(raw, "html.parser")
        title = (soup.title.get_text(strip=True) if soup.title else "").split("|")[0].strip()
        clean(soup)
        main_node = pick_main(soup)
        md = to_markdown(main_node)
        if title:
            md = f"# {title}\n\n{md}"
        out_path = OUT_DIR / (f.stem + ".md")
        out_path.write_text(md, encoding="utf-8")
        summary.append((f.name, len(md), title))

    print(f"\n추출 완료 → {OUT_DIR}\n")
    print(f"{'파일':30} {'글자수':>8}  제목")
    print("-" * 60)
    for name, length, title in summary:
        print(f"{name:30} {length:>8}  {title[:30]}")
    total = sum(s[1] for s in summary)
    print("-" * 60)
    print(f"{'합계':30} {total:>8}")


if __name__ == "__main__":
    main()
