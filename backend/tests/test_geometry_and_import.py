from datetime import datetime
from math import ceil
from types import SimpleNamespace

import pytest

from app.services.geometry import (
    distance_m, geojson_to_latlon, latlon_to_geojson, road_path, validate_feature,
)
from app.services.transit import eta_minutes, move_bus
from scripts.import_official_stops import coordinate, parse_rows


def test_geojson_order_bounds_and_cached_road_shapes():
    assert geojson_to_latlon([49.85, 40.38]) == (40.38, 49.85)
    assert latlon_to_geojson(40.38, 49.85) == [49.85, 40.38]
    with pytest.raises(ValueError):
        geojson_to_latlon([40.38, 49.85])
    with pytest.raises(ValueError):
        geojson_to_latlon([52, 40.38])
    for route_id in ("D1", "D2", "D3"):
        path = road_path(route_id)
        assert path is not None
        assert len(path.coordinates) > 100
        assert path.length_m > 10000
        assert path.feature["properties"]["official_route"] is False
        assert path.feature["properties"]["geometry_source"] == "OSM_DERIVED"
        assert all(distance_m(a,b) <= 500 for a,b in zip(path.coordinates,path.coordinates[1:]))


def test_invalid_or_missing_geometry_is_rejected():
    path = road_path("D1")
    bad = {**path.feature, "geometry": {"type": "LineString", "coordinates": [
        [49.85, 40.38], [49.86, 40.39], [49.87, 40.40],
    ]}}
    with pytest.raises(ValueError):
        validate_feature(bad)
    assert road_path("MISSING") is None
    assert road_path("D1", "OUTBOUND") is None
    shifted = {**path.feature, "properties": {**path.feature["properties"],
               "stop_coordinates": [[49.85, 40.38], *path.feature["properties"]["stop_coordinates"][1:]]}}
    with pytest.raises(ValueError):
        validate_feature(shifted)
    bus = SimpleNamespace(route_id="MISSING", direction_id="LOOP",
                          distance_along_route_m=10, speed_kmh=20,
                          latitude=40.38, longitude=49.85, updated_at=None)
    move_bus(bus, [], 5, datetime(2026, 10, 31))
    assert bus.latitude == 40.38
    assert eta_minutes(bus, [object()], 0) is None


def test_bus_stays_on_road_vertices_and_eta_uses_same_distance():
    path = road_path("D1")
    bus = SimpleNamespace(route_id="D1", direction_id="LOOP",
                          distance_along_route_m=path.stop_distances_m[0],
                          speed_kmh=30, latitude=0, longitude=0,
                          segment_index=0, segment_progress=0, heading_degrees=0,
                          updated_at=None)
    stops = [object() for _ in path.stop_distances_m]
    before = eta_minutes(bus, stops, 1)
    for sample in range(120):
        old_distance = bus.distance_along_route_m
        old_coordinate = [bus.longitude, bus.latitude] if sample else None
        move_bus(bus, stops, 5, datetime(2026, 10, 31))
        expected_distance = (old_distance + 30 * 5 / 3.6) % path.length_m
        assert bus.distance_along_route_m == pytest.approx(expected_distance)
        if old_coordinate is not None:
            assert distance_m(old_coordinate, [bus.longitude, bus.latitude]) <= 30 * 5 / 3.6 + 0.1
        lat, lon, heading, segment, fraction = path.position(bus.distance_along_route_m)
        assert (bus.latitude, bus.longitude) == pytest.approx((lat, lon), abs=1e-9)
        assert bus.heading_degrees == pytest.approx(heading)
        assert bus.segment_index == segment
        assert bus.segment_progress == pytest.approx(fraction)
        if sample == 0:
            assert eta_minutes(bus, stops, 1) <= before
    remaining = (path.stop_distances_m[1]-bus.distance_along_route_m) % path.length_m
    assert eta_minutes(bus, stops, 1) == ceil(remaining / (30/3.6) / 60)
    assert 0 <= bus.heading_degrees < 360


def test_csv_decimal_microdegrees_duplicate_header_and_invalid_rows():
    raw = (
        "ID,AD,ID,LONGITUDE,LATITUDE,Tip\n"
        "1,28 May,001003598,49.848577,40.379488,Pavilion\n"
        "2,Sahil,001003599,49848399,40379182,\n"
        "3,Yanlış,001003600,40.379,49.848,\n"
        "4,Təkrar,001003598,49.85,40.38,\n"
    ).encode("utf-8-sig")
    rows, rejected, headers = parse_rows(raw)
    assert headers == ["id", "ad", "id", "longitude", "latitude", "tip"]
    assert set(rows) == {"001003598", "001003599"}
    assert rows["001003598"]["longitude"] == pytest.approx(49.848577)
    assert rows["001003599"]["longitude"] == pytest.approx(49.848399)
    assert rows["001003599"]["latitude"] == pytest.approx(40.379182)
    assert rejected == 2
    assert coordinate("40.379488", "latitude") == pytest.approx(40.379488)
    assert coordinate("40379488", "latitude") == pytest.approx(40.379488)


def test_existing_sqlite_bus_table_is_migrated_without_data_loss(tmp_path, monkeypatch):
    from sqlalchemy import create_engine
    from app import database
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE buses (id VARCHAR PRIMARY KEY)")
        connection.exec_driver_sql("INSERT INTO buses (id) VALUES ('D1-01')")
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "DATABASE_URL", f"sqlite:///{tmp_path / 'old.db'}")
    database.migrate_existing_database()
    database.migrate_existing_database()
    with engine.connect() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(buses)")}
        ids = [row[0] for row in connection.exec_driver_sql("SELECT id FROM buses")]
    assert {"distance_along_route_m", "heading_degrees", "direction_id"} <= columns
    assert ids == ["D1-01"]
    engine.dispose()
