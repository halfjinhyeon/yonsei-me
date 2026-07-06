#!/usr/bin/env python
"""tools/import-raw/교수진.html (교수 게시판) + tools/import-raw/연구실.html (연구실 표)을 구조화된
JSON으로 파싱한다. 일반 마크다운 추출기(extract_import.py)로는 표현하기 어려운
카드형 데이터(교수 1인당 여러 필드)를 위한 전용 파서.

출력:
    content/faculty-directory.json  — 교수 1인당 {name, title, role, email, phone,
                                        room, specialty, moreInfoUrl, lab}
    content/labs-directory.json     — 연구실 1개당 {nameKo, nameEn, professorKo,
                                        professorEn, location, phone}
    (지도교수 한글 이름으로 교수 ↔ 연구실을 매칭해 faculty.lab 채움)
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
IMPORT_DIR = ROOT / "tools" / "import-raw"
DEST = ROOT / "content"


def parse_labs() -> list[dict]:
    html = (IMPORT_DIR / "연구실.html").read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#jwxe_main_content table")
    labs = []
    for tr in table.select("tbody tr"):
        cells = tr.find_all("td")
        if len(cells) < 3:
            continue
        name_cell, prof_cell, loc_cell = cells[0], cells[1], cells[2]
        name_link = name_cell.find("a")
        name_text = (name_link.get_text(" ", strip=True) if name_link else name_cell.get_text(" ", strip=True))
        url = name_link.get("href", "").strip() if name_link else ""
        # "전산재료역학 연구실 (Computational Mechanics of Materials Lab.)" 형태 분리
        m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", name_text)
        name_ko, name_en = (m.group(1).strip(), m.group(2).strip()) if m else (name_text, "")
        prof_ps = [p.get_text(strip=True) for p in prof_cell.find_all("p")]
        prof_ko = prof_ps[0] if len(prof_ps) > 0 else prof_cell.get_text(" ", strip=True)
        prof_en = prof_ps[1] if len(prof_ps) > 1 else ""
        loc_ps = [p.get_text(strip=True) for p in loc_cell.find_all("p")]
        labs.append({
            "nameKo": name_ko,
            "nameEn": name_en,
            "professorKo": prof_ko,
            "professorEn": prof_en,
            "location": loc_ps[0] if len(loc_ps) > 0 else "",
            "phone": loc_ps[1] if len(loc_ps) > 1 else "",
            "url": url,
        })
    return labs


def parse_faculty() -> list[dict]:
    html = (IMPORT_DIR / "교수진.html").read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    boxes = soup.select(".board-faculty-box")
    records = []
    for box in boxes:
        img = box.select_one(".board-faculty-img-wrap img")
        photo_alt = img.get("alt", "").replace(" 프로필 사진", "").strip() if img else ""

        dl = box.find("dl")
        dt = dl.find("dt")
        name = dt.get_text(" ", strip=True) if dt else photo_alt

        dds = dl.find_all("dd")
        title = ""
        role = None
        email = None
        phone = None
        room = None
        specialty = None
        more_info_url = None
        year_range = None

        for dd in dds:
            text = dd.get_text(" ", strip=True)
            link = dd.find("a")
            if dd.find("span") and ("Professor" in text or "professor" in text.lower()):
                # "Professor / 학부장" 형태 분리
                parts = [p.strip() for p in text.split("/")]
                title = parts[0]
                if len(parts) > 1:
                    role = parts[1]
                continue
            if link and "more information" in text.lower():
                more_info_url = link.get("href", "").strip()
                continue
            # mailto: 링크라도 실제 이메일 형식(@ 포함)이 아니면 전공명이 잘못
            # 들어간 구시대 데이터임 (은퇴교수 다수) → specialty로 취급
            if link and link.get("href", "").startswith("mailto:") and "@" in text:
                email = link.get_text(strip=True)
                continue
            if re.match(r"^\d{4}~\d{4}$", text):
                year_range = text
                continue
            if re.match(r"^0\d{1,2}[)\-]\d", text):
                phone = text
                continue
            if "Room" in text or "관" in text or "산학협동관" in text or "공학원" in text:
                room = text
                continue
            if "@" in text and not email:
                email = text
                continue
            if text:
                specialty = (specialty + " " if specialty else "") + text

        records.append({
            "name": name,
            "title": title,
            "role": role,
            "email": email,
            "phone": phone,
            "room": room,
            "specialty": specialty,
            "yearRange": year_range,
            "moreInfoUrl": more_info_url,
            "photoAlt": photo_alt,
            "lab": None,
        })
    return records


def attach_labs(faculty: list[dict], labs: list[dict]) -> None:
    by_prof: dict[str, dict] = {}
    for lab in labs:
        by_prof[lab["professorKo"]] = lab
    for f in faculty:
        lab = by_prof.get(f["name"])
        if lab:
            f["lab"] = {"nameKo": lab["nameKo"], "nameEn": lab["nameEn"], "url": lab["url"]}


def main() -> None:
    labs = parse_labs()
    faculty = parse_faculty()
    attach_labs(faculty, labs)

    DEST.mkdir(exist_ok=True)
    (DEST / "faculty-directory.json").write_text(
        json.dumps(faculty, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (DEST / "labs-directory.json").write_text(
        json.dumps(labs, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"faculty: {len(faculty)}  labs: {len(labs)}  matched: {sum(1 for f in faculty if f['lab'])}")


if __name__ == "__main__":
    main()
