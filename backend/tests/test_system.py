from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import sessionmaker
from app import main
from app.database import Base, get_db
from app.models import Alert, Bus, CrowdReport, OperatorAction, RouteStatus
from app.seed import seed
from app.services.analytics import aggregate, evaluate
from app.services.transit import eta_minutes, move_bus, stops_for

KEY = {"X-Operator-Key": "local-demo-key"}
T = datetime(2026, 10, 31, 10, 0)

@pytest.fixture
def system(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    with Session() as db:
        seed(db)
    def override_db():
        with Session() as db:
            yield db
    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "SessionLocal", Session)
    client = TestClient(main.app)
    yield client, Session
    main.app.dependency_overrides.clear()
    engine.dispose()

def add_high(db, at, reporters=3, route="D1"):
    for i in range(reporters):
        db.add(CrowdReport(route_id=route, bus_id=None, anonymous_reporter_id=f"user_{i}",
                           occupancy_level="HIGH", created_at=at, is_demo=False))
    db.flush()

def test_health_routes_stops_and_buses(system):
    client, _ = system
    assert client.get("/api/health").json()["status"] == "ok"
    routes = client.get("/api/routes").json()
    assert len(routes) == 3 and all(r["simulated"] for r in routes)
    for route in routes:
        stops = client.get(f"/api/routes/{route['id']}/stops").json()
        assert len(stops) >= 4
        assert [s["sequence"] for s in stops] == list(range(len(stops)))
        assert len(client.get(f"/api/routes/{route['id']}/buses").json()) == 2

def test_gps_and_directional_eta(system):
    _, Session = system
    with Session() as db:
        stops = stops_for(db, "D1")
        bus = db.get(Bus, "D1-01")
        initial = (bus.latitude, bus.longitude)
        assert bus.distance_along_route_m == 0
        assert eta_minutes(bus, stops, 0) == 0
        before_next = eta_minutes(bus, stops, 1)
        move_bus(bus, stops, 5, T)
        assert (bus.latitude, bus.longitude) != initial
        assert bus.distance_along_route_m > 0
        to_next = eta_minutes(bus, stops, 1)
        to_previous = eta_minutes(bus, stops, 0)
        assert to_previous > to_next > 0
        assert to_next <= before_next
        bus.speed_kmh = 0
        assert eta_minutes(bus, stops, 1) is None

def test_eta_api(system):
    client, _ = system
    payload = client.get("/api/eta", params={"route_id": "D1", "stop_id": "D1-S2"}).json()
    assert payload["label"] == "Simulyasiya əsasında təxmini vaxt"
    assert len(payload["arrivals"]) == 2
    assert payload["arrivals"] == sorted(payload["arrivals"], key=lambda a: a["eta_minutes"])

def test_report_validation_cooldown_and_feed(system):
    client, _ = system
    base = {"route_id": "D1", "bus_id": "D1-01", "anonymous_reporter_id": "client_123"}
    assert client.post("/api/reports", json={**base, "occupancy_level": "LOW"}).status_code == 201
    assert client.post("/api/reports", json={**base, "occupancy_level": "HIGH"}).status_code == 429
    assert client.post("/api/reports", json={**base, "anonymous_reporter_id": "client_124", "occupancy_level": "HIGH"}).status_code == 201
    assert client.post("/api/reports", json={**base, "anonymous_reporter_id": "client_125", "occupancy_level": "BAD"}).status_code == 422
    assert client.post("/api/reports", json={**base, "route_id": "D2", "occupancy_level": "LOW"}).status_code == 422
    assert client.get("/api/operator/reports").json()[0]["occupancy_level"] == "HIGH"

def test_aggregation_evidence_and_staleness(system):
    _, Session = system
    with Session() as db:
        add_high(db, T, 2)
        assert aggregate(db, "D1", T)["occupancy_level"] == "UNKNOWN"
        add_high(db, T + timedelta(seconds=1), 3)
        result = aggregate(db, "D1", T + timedelta(seconds=1))
        assert result["occupancy_level"] == "HIGH"
        assert result["distinct_reporter_count"] == 3
        assert result["high_percentage"] == 100
        assert aggregate(db, "D1", T + timedelta(minutes=3))["occupancy_level"] == "UNKNOWN"
        assert aggregate(db, "D1", T + timedelta(minutes=11))["occupancy_level"] == "UNKNOWN"

def test_anomaly_timing_reset_and_idempotency(system):
    _, Session = system
    with Session() as db:
        add_high(db, T)
        assert evaluate(db, "D1", T)["detection_state"] == "HIGH_PENDING"
        for minute in range(1, 10):
            add_high(db, T + timedelta(minutes=minute))
            result = evaluate(db, "D1", T + timedelta(minutes=minute))
            assert result["detection_state"] == "HIGH_PENDING"
        assert db.scalar(select(func.count()).select_from(Alert)) == 0
        add_high(db, T + timedelta(minutes=10))
        assert evaluate(db, "D1", T + timedelta(minutes=10))["detection_state"] == "HIGH_CONFIRMED"
        evaluate(db, "D1", T + timedelta(minutes=10, seconds=1))
        assert db.scalar(select(func.count()).select_from(Alert)) == 1
        assert db.scalar(select(Alert)).recommendation == "Əlavə avtobus ehtiyatı ayrılmalıdır."
        assert evaluate(db, "D1", T + timedelta(minutes=21))["detection_state"] == "NORMAL"
        assert db.scalar(select(Alert)).status == "RESOLVED"

def test_single_high_does_not_trigger(system):
    _, Session = system
    with Session() as db:
        add_high(db, T, 1)
        assert evaluate(db, "D1", T)["detection_state"] == "NORMAL"
        assert evaluate(db, "D1", T + timedelta(minutes=10))["detection_state"] == "NORMAL"
        assert db.scalar(select(func.count()).select_from(Alert)) == 0

def test_pending_resets_when_fresh_evidence_stops(system):
    _, Session = system
    with Session() as db:
        add_high(db, T)
        assert evaluate(db, "D1", T)["detection_state"] == "HIGH_PENDING"
        assert evaluate(db, "D1", T + timedelta(minutes=3))["detection_state"] == "NORMAL"
        add_high(db, T + timedelta(minutes=4))
        outcome = evaluate(db, "D1", T + timedelta(minutes=4))
        assert outcome["high_since"] == T + timedelta(minutes=4)
        assert outcome["detection_state"] == "HIGH_PENDING"

def test_bus_specific_occupancy_in_map_and_eta(system):
    client, Session = system
    with Session() as db:
        now = main.utcnow()
        for i in range(3):
            db.add(CrowdReport(
                route_id="D1", bus_id="D1-01",
                anonymous_reporter_id=f"bus_reporter_{i}",
                occupancy_level="HIGH", created_at=now, is_demo=False,
            ))
        db.commit()
    buses = client.get("/api/routes/D1/buses").json()
    by_id = {bus["id"]: bus for bus in buses}
    assert by_id["D1-01"]["occupancy_level"] == "HIGH"
    assert by_id["D1-02"]["occupancy_level"] == "UNKNOWN"
    assert 40 < by_id["D1-01"]["latitude"] < 41
    arrivals = client.get("/api/eta", params={"route_id": "D1", "stop_id": "D1-S2"}).json()["arrivals"]
    by_bus = {item["bus_id"]: item for item in arrivals}
    assert by_bus["D1-01"]["occupancy_level"] == "HIGH"
    assert by_bus["D1-02"]["occupancy_level"] == "UNKNOWN"


def test_demo_replay_ack_reset_and_permissions(system):
    client, Session = system
    assert client.post("/api/demo/high-crowding").status_code == 403
    genuine = client.post("/api/reports", json={"route_id": "D1", "occupancy_level": "LOW",
        "anonymous_reporter_id": "genuine_123"}).json()["id"]
    result = client.post("/api/demo/high-crowding", headers=KEY).json()
    assert result["transitions"] == ["NORMAL", "HIGH_PENDING", "HIGH_CONFIRMED"]
    assert len(result["timeline"]) == 16
    assert result["timeline"][0]["detection_state"] == "HIGH_PENDING"
    assert result["timeline"][9]["detection_state"] == "HIGH_PENDING"
    assert result["timeline"][10]["detection_state"] == "HIGH_CONFIRMED"
    assert result["timeline"][10]["alert_created"] is True
    assert result["timeline"][10]["sustained_minutes"] == 10
    assert result["timeline"][-1]["total_demo_reports"] == 64
    assert result["alert"]["message"] == "YÜKSƏK SIXLIQ AŞKARLANDI"
    alert_id = result["alert"]["id"]
    assert client.post(f"/api/operator/alerts/{alert_id}/acknowledge", headers=KEY).json()["status"] == "ACKNOWLEDGED"
    assert client.post(f"/api/operator/alerts/{alert_id}/acknowledge", headers=KEY).status_code == 409
    reset = client.post("/api/demo/reset", headers=KEY).json()
    assert reset["simulated_reports_removed"] == 64
    with Session() as db:
        assert db.get(CrowdReport, genuine) is not None
        assert db.scalar(select(func.count()).select_from(Alert)) == 0

def test_dashboard_consistency_and_simulation_controls(system):
    client, Session = system
    overview = client.get("/api/operator/overview").json()
    assert overview["active_routes"] == 3 and overview["active_buses"] == 6
    assert overview["recent_reports"] == 0 and overview["active_alerts"] == 0
    rows = client.get("/api/operator/routes").json()
    assert len(rows) == 3 and all(row["occupancy_level"] == "UNKNOWN" for row in rows)
    assert client.post("/api/demo/simulation/stop", headers=KEY).json()["running"] is False
    assert client.get("/api/simulation/status").json()["running"] is False
    assert client.post("/api/demo/simulation/reset", headers=KEY).json()["reset"] is True
    assert client.post("/api/demo/simulation/start", headers=KEY).json()["running"] is True


def test_alternative_bus_requires_independent_evidence_and_fresh_gps(system):
    client, Session = system
    now = main.utcnow()
    with Session() as db:
        first = db.get(Bus, "D1-01")
        second = db.get(Bus, "D1-02")
        first.segment_index, first.segment_progress, first.updated_at = 0, 0, now
        second.segment_index, second.segment_progress, second.updated_at = 2, 0, now
        for i in range(3):
            db.add(CrowdReport(route_id="D1", bus_id=first.id, anonymous_reporter_id=f"high_{i}",
                               occupancy_level="HIGH", created_at=now, is_demo=False))
            db.add(CrowdReport(route_id="D1", bus_id=second.id, anonymous_reporter_id=f"low_{i}",
                               occupancy_level="LOW", created_at=now, is_demo=False))
        db.commit()
    payload = client.get("/api/eta", params={"route_id": "D1", "stop_id": "D1-S2"}).json()
    assert payload["arrivals"][0]["bus_id"] == "D1-01"
    assert payload["suggestion"] == {
        "overcrowded_bus_id": "D1-01", "recommended_bus_id": "D1-02",
        "recommended_eta_minutes": payload["arrivals"][1]["eta_minutes"],
        "additional_wait_minutes": payload["arrivals"][1]["eta_minutes"] - payload["arrivals"][0]["eta_minutes"],
        "recommended_occupancy_level": "LOW",
    }
    with Session() as db:
        db.execute(delete(CrowdReport).where(CrowdReport.bus_id == "D1-02"))
        db.commit()
    assert client.get("/api/eta", params={"route_id": "D1", "stop_id": "D1-S2"}).json()["suggestion"] is None
    with Session() as db:
        for i in range(3):
            db.add(CrowdReport(route_id="D1", bus_id="D1-02", anonymous_reporter_id=f"fresh_{i}",
                               occupancy_level="LOW", created_at=now, is_demo=False))
        db.get(Bus, "D1-02").updated_at = now - timedelta(seconds=31)
        db.commit()
    assert client.get("/api/eta", params={"route_id": "D1", "stop_id": "D1-S2"}).json()["suggestion"] is None


def test_confidence_tracks_independent_reports_and_freshness(system):
    client, Session = system
    with Session() as db:
        empty = aggregate(db, "D2", T)
        assert empty["confidence_level"] == "INSUFFICIENT"
        assert empty["distinct_reporter_count"] == 0
        add_high(db, T, 2, route="D2")
        two = aggregate(db, "D2", T)
        assert two["confidence_level"] == "INSUFFICIENT"
        assert two["occupancy_level"] == "UNKNOWN"
        for i in range(2, 5):
            db.add(CrowdReport(route_id="D2", bus_id=None, anonymous_reporter_id=f"user_{i}",
                               occupancy_level="HIGH", created_at=T, is_demo=False))
        db.flush()
        strong = aggregate(db, "D2", T)
        assert strong["confidence_level"] == "HIGH"
        assert strong["distinct_reporter_count"] == 5
        assert strong["last_report_at"] == T
        assert aggregate(db, "D2", T + timedelta(seconds=61))["confidence_level"] == "MEDIUM"
        stale = aggregate(db, "D2", T + timedelta(seconds=121))
        assert stale["confidence_level"] == "INSUFFICIENT"
        assert stale["occupancy_level"] == "UNKNOWN"
    payload = client.get("/api/routes/D2/occupancy").json()
    assert "confidence_level" in payload and "confidence_reason" in payload
    arrival = client.get("/api/eta", params={"route_id": "D2", "stop_id": "D2-S1"}).json()["arrivals"][0]
    assert {"independent_report_count", "last_report_at", "confidence_level"} <= arrival.keys()


def test_operator_planned_action_history_is_not_dispatch(system):
    client, Session = system
    alert = client.post("/api/demo/high-crowding", headers=KEY).json()["alert"]
    path = f"/api/operator/alerts/{alert['id']}/actions"
    assert client.post(path, json={"action_code": "RESERVE_BUS"}).status_code == 403
    assert client.post(path, headers=KEY, json={"action_code": "DISPATCHED"}).status_code == 422
    saved = client.post(path, headers=KEY, json={"action_code": "RESERVE_BUS"})
    assert saved.status_code == 201
    body = saved.json()
    assert body["alert_id"] == alert["id"]
    assert body["planned_action"] == "Əlavə avtobus ehtiyatını planlaşdır"
    assert "dispatch" not in str(body).lower()
    assert body["created_at"].endswith("Z")
    assert client.get("/api/operator/actions").json()[0]["id"] == body["id"]
    with Session() as db:
        assert db.get(OperatorAction, body["id"]).created_at.tzinfo is None
    reset = client.post("/api/demo/reset", headers=KEY).json()
    assert reset["simulated_actions_removed"] == 1
    assert client.get("/api/operator/actions").json() == []


def test_stale_gps_is_warned_and_eta_is_withheld(system):
    client, Session = system
    now = main.utcnow()
    with Session() as db:
        db.get(Bus, "D1-01").updated_at = now - timedelta(seconds=31)
        db.get(Bus, "D1-02").updated_at = now
        db.commit()
    buses = {item["id"]: item for item in client.get("/api/routes/D1/buses").json()}
    assert buses["D1-01"]["gps_stale"] is True
    assert buses["D1-01"]["gps_age_seconds"] >= 31
    assert buses["D1-02"]["gps_stale"] is False
    payload = client.get("/api/eta", params={"route_id": "D1", "stop_id": "D1-S2"}).json()
    assert payload["label"] == "Bəzi GPS məlumatları köhnəlib"
    by_bus = {item["bus_id"]: item for item in payload["arrivals"]}
    assert by_bus["D1-01"]["gps_stale"] is True
    assert by_bus["D1-01"]["eta_minutes"] is None
    assert by_bus["D1-02"]["eta_minutes"] is not None
    assert payload["suggestion"] is None


def test_genuine_planned_action_survives_demo_reset(system):
    client, Session = system
    with Session() as db:
        alert = Alert(route_id="D2", alert_type="SUSTAINED_HIGH", severity="HIGH",
                      message="YÜKSƏK SIXLIQ AŞKARLANDI", recommendation="Əlavə avtobus ehtiyatı ayrılmalıdır.",
                      explanation="Test", duration_seconds=600, recent_report_count=3,
                      high_percentage=100, status="ACTIVE", is_demo=False, created_at=main.utcnow())
        db.add(alert)
        db.commit()
        alert_id = alert.id
    saved = client.post(f"/api/operator/alerts/{alert_id}/actions", headers=KEY,
                        json={"action_code": "MONITOR_ROUTE"}).json()
    assert saved["is_demo"] is False
    client.post("/api/demo/high-crowding", headers=KEY)
    client.post("/api/demo/reset", headers=KEY)
    with Session() as db:
        assert db.get(OperatorAction, saved["id"]) is not None
        assert db.get(Alert, alert_id) is not None


def test_official_stops_api_keeps_unverified_membership_separate(system):
    from app.models import OfficialStop
    client, Session = system
    with Session() as db:
        db.add(OfficialStop(id="OFF-1", name="Rəsmi dayanacaq", stop_type="Pavilion",
                            latitude=40.38, longitude=49.85, source="OFFICIAL_STATIC",
                            source_url="https://opendata.az/"))
        db.commit()
    response = client.get("/api/official-stops", params={
        "min_lat": 40.37, "max_lat": 40.39, "min_lon": 49.84, "max_lon": 49.86,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["route_membership_verified"] is False
    assert data["total_in_area"] == 1
    assert data["stops"][0]["id"] == "OFF-1"
    assert "route_id" not in data["stops"][0]
    assert client.get("/api/routes/D1/geometry").json()["official_route"] is False
    assert client.get("/api/official-stops", params={
        "min_lat": 41, "max_lat": 40, "min_lon": 49, "max_lon": 50,
    }).status_code == 422


def test_missing_geometry_suppresses_eta_and_map_position(system, monkeypatch):
    client, _ = system
    monkeypatch.setattr(main, "road_path", lambda route_id, direction_id="LOOP": None)
    shape = client.get("/api/routes/D1/geometry").json()
    assert shape["geometry"] is None
    assert shape["geometry_source"] == "UNVERIFIED"
    buses = client.get("/api/routes/D1/buses").json()
    assert all(bus["position_valid"] is False for bus in buses)
    stop_id = client.get("/api/routes/D1/stops").json()[0]["id"]
    arrivals = client.get("/api/eta", params={"route_id": "D1", "stop_id": stop_id}).json()["arrivals"]
    assert all(arrival["eta_minutes"] is None for arrival in arrivals)
    assert all(arrival["eta_unavailable_reason"] == "NO_GEOMETRY" for arrival in arrivals)
