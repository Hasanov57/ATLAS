from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Route, Stop, Bus, RouteStatus, SimulationState
from .services.geometry import road_path

ROUTES = [
    ("D1", "D1 — Mərkəz xətti", "Nümunə marşrut · İçərişəhər — Gənclik", "#2563EB", [
        ("İçərişəhər", 40.3659, 49.8350), ("Sahil", 40.3710, 49.8460),
        ("28 May", 40.3794, 49.8489), ("Gənclik", 40.3990, 49.8510)]),
    ("D2", "D2 — Dəniz xətti", "Nümunə marşrut · Bayıl — Ağ Şəhər", "#16A34A", [
        ("Bayıl", 40.3518, 49.8306), ("Dənizkənarı bulvar", 40.3614, 49.8450),
        ("Port Baku", 40.3797, 49.8637), ("Ağ Şəhər", 40.3833, 49.8860)]),
    ("D3", "D3 — Şimal xətti", "Nümunə marşrut · Nərimanov — Koroğlu", "#F59E0B", [
        ("Nərimanov", 40.4027, 49.8707), ("Ulduz", 40.4146, 49.8916),
        ("Bakı Olimpiya Stadionu", 40.4294, 49.9180), ("Koroğlu", 40.4215, 49.9193)]),
]

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

def seed(db: Session):
    if db.scalar(select(Route.id).limit(1)) is not None:
        return
    now = utcnow()
    for rid, name, description, color, stops in ROUTES:
        path = road_path(rid)
        db.add(Route(id=rid, name=name, description=description, color=color, is_active=True))
        for i, (stop_name, lat, lon) in enumerate(stops):
            if path:
                lon, lat = path.stop_coordinates[i]
            db.add(Stop(id=f"{rid}-S{i+1}", route_id=rid, name=stop_name, latitude=lat, longitude=lon, sequence=i))
        for i, stop_index in enumerate((0, 2)):
            if path:
                distance = path.stop_distances_m[stop_index]
                lat, lon, heading, segment, fraction = path.position(distance)
            else:
                distance, heading, segment, fraction = None, None, stop_index, 0.0
                lat, lon = stops[stop_index][1:]
            db.add(Bus(id=f"{rid}-0{i+1}", route_id=rid, latitude=lat, longitude=lon,
                       speed_kmh=24.0 + i * 4, segment_index=segment, segment_progress=fraction,
                       distance_along_route_m=distance, heading_degrees=heading,
                       direction_id="LOOP", updated_at=now))
        db.add(RouteStatus(route_id=rid, occupancy_level="UNKNOWN", detection_state="NORMAL"))
    db.add(SimulationState(id=1, running=True, updated_at=now))
    db.commit()

def align_demo_records(db: Session):
    """Migrate existing demo positions to the cached road line, preserving reports."""
    for rid, _, _, _, _ in ROUTES:
        path = road_path(rid)
        if path is None:
            continue
        for index, coordinate in enumerate(path.stop_coordinates):
            stop = db.get(Stop, f"{rid}-S{index+1}")
            if stop is not None:
                stop.longitude, stop.latitude = coordinate
        for bus in db.scalars(select(Bus).where(Bus.route_id == rid)).all():
            if bus.distance_along_route_m is None:
                old_index = bus.segment_index % len(path.stop_distances_m)
                next_offset = (path.stop_distances_m[old_index+1] if old_index+1 < len(path.stop_distances_m)
                               else path.length_m)
                bus.distance_along_route_m = path.stop_distances_m[old_index] + (
                    next_offset-path.stop_distances_m[old_index]
                ) * max(0, min(1, bus.segment_progress))
            bus.direction_id = "LOOP"
            lat, lon, heading, segment, fraction = path.position(bus.distance_along_route_m)
            bus.latitude, bus.longitude = lat, lon
            bus.heading_degrees = heading
            bus.segment_index, bus.segment_progress = segment, fraction
    db.commit()
