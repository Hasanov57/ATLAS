"""Generate offline demo road lines from OSRM's public OSM routing demo.

Run only during setup: python scripts/build_demo_geometry.py
The result follows drivable roads, but is NOT an official bus route or stop order.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.seed import ROUTES
from app.services.geometry import distance_m, validate_feature

OUTPUT = Path(__file__).resolve().parents[1] / "data" / "geometry"
BASE = "https://router.project-osrm.org/route/v1/driving/"

def build_route(route):
    route_id, _, _, _, stops = route
    pairs = [(lon, lat) for _, lat, lon in stops]
    sequence = pairs + [pairs[0]]
    coordinates = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in sequence)
    url = BASE + coordinates + "?overview=full&geometries=geojson&steps=true"
    request = Request(url, headers={"User-Agent": "ATLAS-BakuTransit-demo/1.0 (offline geometry generation)"})
    with urlopen(request, timeout=30) as response:
        data = json.load(response)
    if data.get("code") != "Ok" or len(data.get("routes", [])) != 1:
        raise ValueError(f"{route_id}: OSRM returned no single route")
    snap = [waypoint["distance"] for waypoint in data["waypoints"]]
    if max(snap) > 500:
        raise ValueError(f"{route_id}: waypoint too far from a drivable road: {snap}")
    legs = data["routes"][0]["legs"]
    if len(legs) != len(stops):
        raise ValueError(f"{route_id}: missing route leg")
    vertices = []
    stop_distances = [0.0]
    traveled = 0.0
    for leg_index, leg in enumerate(legs):
        if any(step.get("mode") != "driving" for step in leg["steps"]):
            raise ValueError(f"{route_id}: non-driving segment")
        for step in leg["steps"]:
            for point in step["geometry"]["coordinates"]:
                if vertices and point == vertices[-1]:
                    continue
                if vertices:
                    start = vertices[-1]
                    meters = distance_m(start, point)
                    subdivisions = max(1, int(meters // 100) + 1)
                    for fraction_index in range(1, subdivisions + 1):
                        fraction = fraction_index / subdivisions
                        sample = [start[0] + (point[0]-start[0])*fraction,
                                  start[1] + (point[1]-start[1])*fraction]
                        traveled += distance_m(vertices[-1], sample)
                        vertices.append(sample)
                else:
                    vertices.append(point)
        if leg_index < len(stops)-1:
            stop_distances.append(traveled)
    feature = {
        "type": "Feature",
        "properties": {
            "route_id": route_id, "direction_id": "LOOP",
            "geometry_source": "OSM_DERIVED", "provider": "OSRM",
            "vehicle_position_source": "SIMULATED", "eta_source": "SIMULATED",
            "official_route": False, "live_gps_available": False,
            "stop_distances_m": stop_distances,
            "stop_coordinates": [w["location"] for w in data["waypoints"][:-1]],
            "snap_distances_m": snap[:-1],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "attribution": "© OpenStreetMap contributors · OSRM",
        },
        "geometry": {"type": "LineString", "coordinates": vertices},
    }
    path = validate_feature(feature)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / f"{route_id}-LOOP.geojson"
    target.write_text(json.dumps(feature, ensure_ascii=False, separators=(",",":"))+"\n",encoding="utf-8")
    print(f"{route_id}: {len(vertices)} road vertices, {path.length_m:.0f} m, max stop snap {max(snap):.0f} m -> {target}")

if __name__ == "__main__":
    for route in ROUTES:
        build_route(route)
