#!/usr/bin/env python3
from __future__ import annotations

import gzip
import io
import json
import re
import shutil
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BASE_URL = "https://download.geonames.org/export/dump/"
DATASET = "cities500"
TARGET_ROWS_PER_CHUNK = 7000
MAX_NON_CJK_ALIASES = 24
MAX_CJK_ALIASES = 12
BASELINE_COUNT = 69695
CHINA_REGION_CODES = {"CN", "TW", "HK", "MO"}

CJK_RE = re.compile(r"[\u3400-\u9fff]")
CJK_ONLY_RE = re.compile(r"^[\u3400-\u9fff·•・\-\s]+$")
URL_RE = re.compile(r"^(?:https?://|www\.)", re.I)
NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Travel-in-Time city database builder"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def load_admin1_names() -> dict[str, str]:
    text = download_bytes(BASE_URL + "admin1CodesASCII.txt").decode("utf-8")
    result: dict[str, str] = {}
    for line in text.splitlines():
        fields = line.split("\t")
        if len(fields) >= 2:
            result[fields[0]] = fields[1]
    return result


def split_raw_aliases(raw: str) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in raw.split(","):
        alias = item.strip()
        if not alias or len(alias) > 80 or URL_RE.match(alias):
            continue
        key = alias.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(alias)
    return result


def normalize_latin(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return NON_ALNUM_RE.sub("", ascii_value.casefold())


def candidate_pinyin(value: str) -> str:
    return normalize_latin("".join(lazy_pinyin(value, style=Style.NORMAL, errors="ignore")))


def chinese_display_name(country: str, original_name: str, ascii_name: str, raw_aliases: list[str]) -> str:
    """Prefer a Han-script label whenever GeoNames provides one.

    For China, GeoNames often uses Pinyin/Latin as the primary name and its
    alternate names can contain historical or district names. We therefore
    transliterate each Han candidate back to Pinyin and choose the one that best
    matches the current GeoNames name. Elsewhere, the first Han-script alias is
    the localized display label. The original local/Latin forms remain searchable.
    """
    candidates: list[str] = []
    if CJK_RE.search(original_name) and CJK_ONLY_RE.match(original_name):
        candidates.append(original_name)
    for alias in raw_aliases:
        if CJK_RE.search(alias) and CJK_ONLY_RE.match(alias):
            candidates.append(alias)

    if not candidates:
        return original_name

    if country not in CHINA_REGION_CODES:
        return candidates[0]

    unique = list(dict.fromkeys(candidates))
    normal = [value for value in unique if len(value.replace(" ", "")) >= 2]
    pool = normal or unique

    target = normalize_latin(ascii_name or original_name)
    if not target:
        return pool[0]

    def score(value: str) -> tuple[float, float, int, int]:
        pinyin = candidate_pinyin(value)
        similarity = SequenceMatcher(None, pinyin, target).ratio() if pinyin else 0.0
        exact = 1.0 if pinyin == target else 0.0
        # Prefer exact/near transliterations first, then concise UI labels, then
        # original GeoNames alias order for deterministic tie-breaking.
        return (exact, similarity, -len(value.replace(" ", "")), -unique.index(value))

    return max(pool, key=score)


def clean_aliases(primary_name: str, ascii_name: str, candidates: list[str]) -> list[str]:
    seen = {primary_name.casefold(), ascii_name.casefold()}
    cjk: list[str] = []
    other: list[str] = []
    for alias in candidates:
        alias = alias.strip()
        if not alias or len(alias) > 80 or URL_RE.match(alias):
            continue
        key = alias.casefold()
        if key in seen:
            continue
        seen.add(key)
        if CJK_RE.search(alias):
            if len(cjk) < MAX_CJK_ALIASES:
                cjk.append(alias)
        elif len(other) < MAX_NON_CJK_ALIASES:
            other.append(alias)
        if len(cjk) >= MAX_CJK_ALIASES and len(other) >= MAX_NON_CJK_ALIASES:
            break
    return cjk + other


def compact_number(value: str):
    number = float(value)
    return int(number) if number.is_integer() else round(number, 6)


def load_rows() -> list[list]:
    admin1 = load_admin1_names()
    archive = download_bytes(BASE_URL + f"{DATASET}.zip")
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        member = f"{DATASET}.txt"
        with zf.open(member) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8")
            rows: list[list] = []
            for line in text:
                fields = line.rstrip("\n").split("\t")
                if len(fields) < 19:
                    continue
                original_name = fields[1].strip()
                ascii_name = fields[2].strip() or original_name
                feature_class = fields[6]
                feature_code = fields[7]
                country = fields[8].upper()
                admin1_code = fields[10]
                if feature_class != "P" or not original_name or not country:
                    continue
                region = admin1.get(f"{country}.{admin1_code}", "")
                try:
                    lat = compact_number(fields[4])
                    lng = compact_number(fields[5])
                    population = int(fields[14] or 0)
                except ValueError:
                    continue

                raw_aliases = split_raw_aliases(fields[3])
                name = chinese_display_name(country, original_name, ascii_name, raw_aliases)
                aliases = clean_aliases(name, ascii_name, [original_name, *raw_aliases])
                rows.append([
                    name,
                    ascii_name,
                    country,
                    region,
                    lat,
                    lng,
                    population,
                    feature_code,
                    aliases,
                ])
    rows.sort(key=lambda row: (row[2], -row[6], row[1].casefold(), row[0].casefold()))
    return rows


def contains_name(row: list, value: str) -> bool:
    needle = value.casefold()
    return any(str(item).casefold() == needle for item in [row[0], row[1], *row[8]])


def require_exact_chinese_name(rows: list[list], ascii_name: str, expected: str) -> dict:
    matches = [row for row in rows if row[2] == "CN" and row[1].casefold() == ascii_name.casefold()]
    if not matches:
        raise RuntimeError(f"Verification failed: {ascii_name} was not found in the China city database")
    row = matches[0]
    if row[0] != expected:
        raise RuntimeError(
            f"Verification failed: {ascii_name} display name is {row[0]!r}, expected {expected!r}"
        )
    return {"displayName": row[0], "lat": row[4], "lng": row[5]}


def write_chunks(rows: list[list]) -> list[str]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for old in DATA_DIR.glob("cities-*.json.gz"):
        old.unlink()
    for old in DATA_DIR.glob("cities500-*.json.gz"):
        old.unlink()

    filenames: list[str] = []
    for i in range(0, len(rows), TARGET_ROWS_PER_CHUNK):
        chunk = rows[i:i + TARGET_ROWS_PER_CHUNK]
        filename = f"cities500-{i // TARGET_ROWS_PER_CHUNK:02d}.json.gz"
        raw = json.dumps(chunk, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        (DATA_DIR / filename).write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
        filenames.append(filename)
    return filenames


def update_source_note() -> None:
    path = DATA_DIR / "SOURCES.txt"
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    text = text.replace("GeoNames cities5000 dataset", "GeoNames cities500 dataset")
    path.write_text(text, encoding="utf-8")


def bump_client_cache() -> None:
    app_path = ROOT / "app.js"
    app = app_path.read_text(encoding="utf-8")
    app = re.sub(
        r'fetch\("\.\/data\/cities-manifest\.json(?:\?v=\d+)?"(?:, \{ cache: "no-store" \})?\)',
        'fetch("./data/cities-manifest.json?v=6", { cache: "no-store" })',
        app,
        count=1,
    )
    if 'cities-manifest.json?v=6' not in app:
        raise RuntimeError("Could not locate city manifest fetch in app.js")
    app_path.write_text(app, encoding="utf-8")

    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = re.sub(r'\.\/app\.js\?v=\d+', './app.js?v=32', index, count=1)
    index_path.write_text(index, encoding="utf-8")


def main() -> None:
    manifest_path = DATA_DIR / "cities-manifest.json"
    rows = load_rows()
    erpel = [row for row in rows if row[2] == "DE" and contains_name(row, "Erpel")]
    if not erpel:
        raise RuntimeError("Verification failed: Erpel was not found in the rebuilt city database")

    expected_china_names = {
        "Beijing": "北京",
        "Shanghai": "上海",
        "Guangzhou": "广州",
        "Shenzhen": "深圳",
        "Tianjin": "天津",
        "Xi'an": "西安",
        "Wuhan": "武汉",
        "Chengdu": "成都",
        "Chongqing": "重庆",
        "Nanjing": "南京",
        "Hangzhou": "杭州",
    }
    china_checks = {
        city: require_exact_chinese_name(rows, city, expected)
        for city, expected in expected_china_names.items()
    }

    filenames = write_chunks(rows)
    now = datetime.now(timezone.utc).date().isoformat()
    manifest = {
        "version": 5,
        "source": "GeoNames cities500",
        "license": "CC BY 4.0",
        "updated": now,
        "count": len(rows),
        "previousCount": BASELINE_COUNT,
        "addedCount": len(rows) - BASELINE_COUNT,
        "displayPolicy": "All regions prefer Han-script names when available; China-region names use Pinyin similarity to avoid historical or district-name mismatches; local, Latin, and Pinyin names remain searchable aliases",
        "files": filenames,
        "verification": {
            "Erpel": {
                "country": "DE",
                "lat": erpel[0][4],
                "lng": erpel[0][5],
            },
            "ChineseDisplayNames": china_checks,
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    update_source_note()
    bump_client_cache()
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
