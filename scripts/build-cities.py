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

CJK_RE = re.compile(r"[\u3400-\u9fff]")
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


def clean_aliases(name: str, ascii_name: str, raw: str) -> list[str]:
    seen = {name.casefold(), ascii_name.casefold()}
    cjk: list[str] = []
    other: list[str] = []
    for item in raw.split(","):
        alias = item.strip()
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
                name = fields[1].strip()
                ascii_name = fields[2].strip() or name
                feature_class = fields[6]
                feature_code = fields[7]
                country = fields[8].upper()
                admin1_code = fields[10]
                if feature_class != "P" or not name or not country:
                    continue
                region = admin1.get(f"{country}.{admin1_code}", "")
                try:
                    lat = compact_number(fields[4])
                    lng = compact_number(fields[5])
                    population = int(fields[14] or 0)
                except ValueError:
                    continue
                aliases = clean_aliases(name, ascii_name, fields[3])
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
    old = 'fetch("./data/cities-manifest.json")'
    new = 'fetch("./data/cities-manifest.json?v=3", { cache: "no-store" })'
    if old in app:
        app = app.replace(old, new, 1)
    elif 'cities-manifest.json?v=3' not in app:
        raise RuntimeError("Could not locate city manifest fetch in app.js")
    app_path.write_text(app, encoding="utf-8")

    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = re.sub(r'\.\/app\.js\?v=\d+', './app.js?v=29', index, count=1)
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

    filenames = write_chunks(rows)
    now = datetime.now(timezone.utc).date().isoformat()
    manifest = {
        "version": 2,
        "source": "GeoNames cities500",
        "license": "CC BY 4.0",
        "updated": now,
        "count": len(rows),
        "previousCount": old_count,
        "addedCount": len(rows) - old_count,
        "files": filenames,
        "verification": {
            "Erpel": {
                "country": "DE",
                "lat": erpel[0][4],
                "lng": erpel[0][5],
            }
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    update_source_note()
    bump_client_cache()
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
