from datetime import datetime
from math import ceil
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Bus, Stop
from .geometry import road_path

def stops_for(db: Session, route_id: str):
    return db.scalars(select(Stop).where(Stop.route_id == route_id).order_by(Stop.sequence)).all()

def move_bus(bus: Bus, stops: list[Stop], seconds: float, now):
    """Advance exclusively along the cached, validated road vertices."""
    path = road_path(bus.route_id, bus.direction_id or "LOOP")
    if path is None or seconds <= 0 or bus.distance_along_route_m is None:
        return
    bus.distance_along_route_m = (
        bus.distance_along_route_m + max(0, bus.speed_kmh) * seconds / 3.6
    ) % path.length_m
    lat, lon, heading, segment, fraction = path.position(bus.distance_along_route_m)
    bus.latitude, bus.longitude = lat, lon
    bus.heading_degrees = heading
    bus.segment_index, bus.segment_progress = segment, fraction
    bus.updated_at = now

def eta_minutes(bus: Bus, stops: list[Stop], target_index: int):
    if not 0 <= target_index < len(stops):
        raise ValueError("Invalid stop")
    path = road_path(bus.route_id, bus.direction_id or "LOOP")
    if path is None or bus.distance_along_route_m is None or bus.speed_kmh <= 0:
        return None
    if len(path.stop_distances_m) != len(stops):
        return None
    remaining = (path.stop_distances_m[target_index] - bus.distance_along_route_m) % path.length_m
    return max(0, ceil(remaining / (bus.speed_kmh / 3.6) / 60))

GPS_FRESHNESS_SECONDS = 30

def gps_is_fresh(updated_at: datetime | None, at: datetime) -> bool:
    return updated_at is not None and 0 <= (at - updated_at).total_seconds() <= GPS_FRESHNESS_SECONDS

def suggest_alternative(arrivals: list[dict], at: datetime) -> dict | None:
    """Suggest only a later bus on the same route with known, lower crowding."""
    if len(arrivals) < 2 or any(item["eta_minutes"] is None for item in arrivals):
        return None
    approaching = arrivals[0]
    if approaching["occupancy_level"] != "HIGH" or not gps_is_fresh(approaching["updated_at"], at):
        return None
    for candidate in arrivals[1:]:
        if (candidate["eta_minutes"] > approaching["eta_minutes"]
                and candidate["occupancy_level"] in ("LOW", "MEDIUM")
                and gps_is_fresh(candidate["updated_at"], at)):
            return {
                "overcrowded_bus_id": approaching["bus_id"],
                "recommended_bus_id": candidate["bus_id"],
                "recommended_eta_minutes": candidate["eta_minutes"],
                "additional_wait_minutes": candidate["eta_minutes"] - approaching["eta_minutes"],
                "recommended_occupancy_level": candidate["occupancy_level"],
            }
    return None
