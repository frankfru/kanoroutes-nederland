import csv
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
COLLECTIONS = (
    ("tkbn-rob-nuij", "GPX_ROUTES_TKBN_ROB_NUIJ"),
    ("tkbn-divers", "GPX_ROUTES_TKBN_DIVERS"),
)
PROVINCES = {
    "GR": "Groningen", "FR": "Friesland", "DR": "Drenthe", "OV": "Overijssel",
    "FL": "Flevoland", "GD": "Gelderland", "UT": "Utrecht", "NH": "Noord-Holland",
    "ZH": "Zuid-Holland", "ZL": "Zeeland", "NB": "Noord-Brabant", "LB": "Limburg",
}


def parse_gpx(path):
    root = ET.parse(path).getroot()
    namespace = root.tag.partition("}")[0] + "}" if root.tag.startswith("{") else ""
    if root.tag != f"{namespace}gpx":
        raise ValueError(f"Geen GPX-bestand: {path}")

    def points(parent, point_name):
        result = []
        for point in parent.findall(f"{namespace}{point_name}"):
            latitude = float(point.attrib["lat"])
            longitude = float(point.attrib["lon"])
            if not (math.isfinite(latitude) and math.isfinite(longitude)
                    and -90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise ValueError(f"Ongeldige GPS-coordinaten: {path}")
            result.append([latitude, longitude])
        return result

    segments = [
        points(segment, "trkpt")
        for track in root.findall(f"{namespace}trk")
        for segment in track.findall(f"{namespace}trkseg")
    ]
    segments = [segment for segment in segments if len(segment) > 1]
    if not segments:
        segments = [points(route, "rtept") for route in root.findall(f"{namespace}rte")]
        segments = [segment for segment in segments if len(segment) > 1]
    if not segments:
        raise ValueError(f"Geen bruikbare routepunten: {path}")

    description = root.findtext(f"{namespace}metadata/{namespace}desc", default="")
    is_dummy = root.get("creator") == "TKBN dummyroute" or description.strip().lower().startswith("dummy:")
    return segments, is_dummy


def build_collection(folder, collection_name):
    with (folder / "bronlinks.csv").open(encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError(f"Geen routes in {folder / 'bronlinks.csv'}")

    routes = []
    seen = set()
    for row in rows:
        filename = row["gpx_bestand"]
        if (not re.fullmatch(r"[a-z0-9-]+\.gpx", filename)
                or filename in seen):
            raise ValueError(f"Ongeldige of dubbele GPX-bestandsnaam: {filename}")
        seen.add(filename)
        name = row["instappunt"].strip()
        province = re.match(r"^([A-Z]{2})\s*\d", name)
        if not province or province.group(1) not in PROVINCES:
            raise ValueError(f"Onbekende provincie voor instappunt: {name}")
        field = row["routeveld"]
        if field not in ("Kanoroute1", "Kanoroute2"):
            raise ValueError(f"Onbekend routeveld voor {name}: {field}")
        url = row["controle_url"] or row["bron_url"]
        parsed_url = urlsplit(url)
        if parsed_url.scheme != "https" or not parsed_url.netloc:
            raise ValueError(f"Ongeldige bronlink voor {name}: {url}")
        segments, is_dummy = parse_gpx(folder / filename)
        route = {
            "name": f"{name} - route {field[-1]}",
            "folder": PROVINCES[province.group(1)],
            "sourcePath": f"../collecties/{collection_name}/{quote(filename)}",
            "pdf": url,
            "segments": segments,
            "isDummy": is_dummy,
        }
        if is_dummy:
            latitude, longitude = float(row["breedtegraad"]), float(row["lengtegraad"])
            if not (math.isfinite(latitude) and math.isfinite(longitude)
                    and -90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise ValueError(f"Ongeldig instappunt voor {name}")
            route["startPoint"] = [latitude, longitude]
        routes.append(route)
    return routes


def main():
    built = []
    for collection, global_name in COLLECTIONS:
        routes = build_collection(ROOT / "collecties" / collection, collection)
        output = ROOT / "shared" / f"routes-{collection}-data.js"
        data = json.dumps(routes, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        built.append((output, f"window.{global_name} = {data};\n", len(routes)))

    for output, content, count in built:
        output.write_text(content, encoding="utf-8", newline="\n")
        print(f"{output.name}: {count} routes")


if __name__ == "__main__":
    main()
