#!/usr/bin/env python3
from __future__ import annotations

import gzip
import io
import json
import re
import shutil
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BASE_URL = "https://download.geonames.org/export/dump/"
DATASET = "cities500"
TARGET_ROWS_PER_CHUNK = 7000
MAX_NON_CJK_ALIASES = 24
MAX_CJK_ALIASES = 12
CHINA_REGION_CODES = {"CN", "TW", "HK", "MO"}

CJK_RE = re.compile(r"[\u3400-\u9fff]")
CJK_ONLY_RE = re.compile(r"^[\u3400-\u9fff·•・\-\s]+$")
URL_RE = re.compile(r"^(?:https?://|www\.)", re.I)


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


def chinese_display_name(country: str, original_name: str, raw_aliases: list[str]) -> str:
    """Prefer a human-readable Han-script place name for China-region records.

    GeoNames frequently stores a Pinyin/Latin form in `name`, while the native
    Chinese spelling is present only in `alternatenames`.  For the Chinese
    interface we promote the best Han-script alternate name to the primary
    display name, while keeping the Latin forms searchable as aliases.
    """
    if country not in CHINA_REGION_CODES:
        return original_name

    candidates: list[str] = []
    if CJK_RE.search(original_name) and CJK_ONLY_RE.match(original_name):
        candidates.append(original_name)
    for alias in raw_aliases:
        if CJK_RE.search(alias) and CJK_ONLY_RE.match(alias):
            candidates.append(alias)

    if not candidates:
        return original_name

    # Deduplicate, then prefer ordinary city-name length.  GeoNames commonly
    # contains both forms such as “北京” and “北京市”; the shorter native form
    # is the better UI label. Avoid one-character abbreviations when a normal
    # name is available.
    unique = list(dict.fromkeys(candidates))
    normal = [value for value in unique if len(value.replace(" ", "")) >= 2]
    pool = normal or unique
    return min(pool, key=lambda value: (len(value.replace(" ", "")), unique.index(value)))


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
                name = chinese_display_name(country, original_name, raw_aliases)
                # Preserve the original GeoNames name as a searchable alias if
                # promoting a Chinese display name changed it.
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


def require_chinese_name(rows: list[list], ascii_name: str) -> dict:
    matches = [row for row in rows if row[2] == "CN" and row[1].casefold() == ascii_name.casefold()]
    if not matches:
        raise RuntimeError(f"Verification failed: {ascii_name} was not found in the China city database")
    row = matches[0]
    if not CJK_RE.search(str(row[0])):
        raise RuntimeError(f"Verification failed: {ascii_name} still has a non-Chinese display name: {row[0]}")
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
        'fetch("./data/cities-manifest.json?v=4", { cache: "no-store" })',
        app,
        count=1,
    )
    if 'cities-manifest.json?v=4' not in app:
        raise RuntimeError("Could not locate city manifest fetch in app.js")
    app_path.write_text(app, encoding="utf-8")

    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = re.sub(r'\.\/app\.js\?v=\d+', './app.js?v=30', index, count=1)
    index_path.write_text(index, encoding="utf-8")


def main() -> None:
    manifest_path = DATA_DIR / "cities-manifest.json"
    old_count = 0
    if manifest_path.exists():
        try:
            old_count = int(json.loads(manifest_path.read_text(encoding="utf-8")).get("count", 0))
        except Exception:
            old_count = 0

    rows = load_rows()
    erpel = [row for row in rows if row[2] == "DE" and contains_name(row, "Erpel")]
    if not erpel:
        raise RuntimeError("Verification failed: Erpel was not found in the rebuilt city database")

    china_checks = {
        city: require_chinese_name(rows, city)
        for city in ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Tianjin", "Xi'an"]
    }

    filenames = write_chunks(rows)
    now = datetime.now(timezone.utc).date().isoformat()
    manifest = {
        "version": 3,
        "source": "GeoNames cities500",
        "license": "CC BY 4.0",
        "updated": now,
        "count": len(rows),
        "previousCount": old_count,
        "addedCount": len(rows) - old_count,
        "displayPolicy": "China-region records prefer Han-script alternate names; Latin/Pinyin names remain searchable aliases",
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
