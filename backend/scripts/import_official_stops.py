"""Import public IDDA/BakuBus stop locations without asserting route membership.

Usage:
  cd backend
  python scripts/import_official_stops.py path/to/dayanacaqlar.csv
  python scripts/import_official_stops.py --download
"""
import argparse
import csv
import io
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import Base, SessionLocal, engine
from app.models import OfficialStop

SOURCE_PAGE = "https://opendata.az/@baki-metropoliteni/bakubus-mmc-ye-mexsus-avtobus-marsrutlari-uzre-dayanacaqlarin-cografi-koordinatlari"
PACKAGE_API = "https://admin.opendata.az/api/3/action/package_show?id=bakubus-mmc-ye-mexsus-avtobus-marsrutlari-uzre-dayanacaqlarin-cografi-koordinatlari"


def current_csv_url() -> str:
    request = Request(PACKAGE_API, headers={"User-Agent": "ATLAS-BakuTransit-demo/1.0 (official stop importer)"})
    with urlopen(request, timeout=30) as response:
        package = json.load(response)
    if not package.get("success"):
        raise ValueError("Official stop metadata is unavailable")
    for resource in package.get("result", {}).get("resources", []):
        if resource.get("format", "").upper() == "CSV" and resource.get("url", "").startswith("https://admin.opendata.az/"):
            return resource["url"]
    raise ValueError("Official stop CSV resource is unavailable")

def decode_csv(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("CSV encoding is not UTF-8 or CP1251")

def coordinate(raw: str, axis: str) -> float:
    value = float(raw.strip().replace(",", "."))
    if abs(value) >= 1000:
        value /= 1_000_000
    bounds = (39, 42) if axis == "latitude" else (48, 51.5)
    if not bounds[0] <= value <= bounds[1]:
        raise ValueError(f"Invalid {axis}: {raw}")
    return value

def parse_rows(raw: bytes):
    reader = csv.reader(io.StringIO(decode_csv(raw)))
    headers = [name.strip().casefold() for name in next(reader)]
    id_columns = [index for index, name in enumerate(headers) if name in ("id", "stop_id", "dayanacaq_id")]
    # The published CSV has duplicate ID headers: first is a row number, last is the official ID.
    if not id_columns:
        raise ValueError("Official stop ID column missing")
    def column(*names):
        for name in names:
            if name in headers:
                return headers.index(name)
        raise ValueError("Required CSV column missing: " + "/".join(names))
    positions = {
        "id": id_columns[-1],
        "name": column("ad", "name", "dayanacaq"),
        "longitude": column("longitude", "lon", "uzunluq"),
        "latitude": column("latitude", "lat", "enlik"),
    }
    stop_type = headers.index("tip") if "tip" in headers else None
    parsed = {}
    rejected = 0
    for row in reader:
        try:
            if len(row) != len(headers):
                raise ValueError("Wrong column count")
            identifier = row[positions["id"]].strip()
            name = " ".join(row[positions["name"]].strip().split())
            if not identifier or not name:
                raise ValueError("Missing official ID or name")
            lat = coordinate(row[positions["latitude"]], "latitude")
            lon = coordinate(row[positions["longitude"]], "longitude")
            if identifier in parsed:
                raise ValueError("Duplicate official ID")
            parsed[identifier] = {
                "id": identifier, "name": name,
                "stop_type": row[stop_type].strip() or None if stop_type is not None else None,
                "latitude": lat, "longitude": lon,
            }
        except (ValueError, IndexError):
            rejected += 1
    return parsed, rejected, headers

def upsert(db, rows: dict):
    created = updated = 0
    for identifier, record in rows.items():
        stop = db.get(OfficialStop, identifier)
        if stop is None:
            stop = OfficialStop(**record, source="OFFICIAL_STATIC", source_url=SOURCE_PAGE)
            db.add(stop)
            created += 1
        else:
            for key, value in record.items():
                setattr(stop, key, value)
            stop.source, stop.source_url = "OFFICIAL_STATIC", SOURCE_PAGE
            updated += 1
    db.commit()
    return created, updated

def main():
    parser = argparse.ArgumentParser(description="Rəsmi dayanacaq CSV idxalı")
    parser.add_argument("file", nargs="?", type=Path)
    parser.add_argument("--download", action="store_true", help="Public IDDA CSV-ni yüklə")
    args = parser.parse_args()
    if bool(args.file) == bool(args.download):
        parser.error("Provide a local CSV file or --download")
    if args.download:
        request = Request(current_csv_url(), headers={"User-Agent": "ATLAS-BakuTransit-demo/1.0 (official stop importer)"})
        with urlopen(request, timeout=30) as response:
            raw = response.read()
    else:
        raw = args.file.read_bytes()
    rows, rejected, headers = parse_rows(raw)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        created, updated = upsert(db, rows)
    print(f"Columns: {headers}")
    print(f"Official stops: {created} added, {updated} updated, {rejected} rejected; route membership not inferred.")

if __name__ == "__main__":
    main()
