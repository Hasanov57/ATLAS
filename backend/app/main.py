import asyncio
import os
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from .database import Base, SessionLocal, engine, get_db, migrate_existing_database
from .models import Alert, Bus, CrowdReport, OfficialStop, OperatorAction, Route, RouteStatus, SimulationState, Stop
from .seed import align_demo_records, seed, utcnow
from .services.analytics import aggregate, evaluate
from .services.transit import eta_minutes, gps_is_fresh, move_bus, stops_for, suggest_alternative
from .services.geometry import road_path

OPERATOR_KEY = os.getenv("OPERATOR_KEY", "local-demo-key")
COOLDOWN = int(os.getenv("REPORT_COOLDOWN_SECONDS", "60"))

def iso(value):
    return value.isoformat() + "Z" if value else None

def route_json(r):
    path = road_path(r.id)
    return dict(id=r.id, name=r.name, description=r.description, color=r.color,
                is_active=r.is_active, simulated=True, official_route=False,
                geometry_source="OSM_DERIVED" if path else "UNVERIFIED",
                vehicle_position_source="SIMULATED", eta_source="SIMULATED",
                live_gps_available=False)

def geometry_json(route_id):
    path = road_path(route_id)
    return {"route_id": route_id, "direction_id": path.direction_id if path else "LOOP",
            "geometry_source": "OSM_DERIVED" if path else "UNVERIFIED",
            "official_route": False,
            "label": "OSM/OSRM yol xətti · nümunə marşrut" if path else "Yol geometriyası mövcud deyil",
            "geometry": path.feature["geometry"] if path else None}

def stop_json(s):
    return dict(id=s.id, route_id=s.route_id, name=s.name, latitude=s.latitude,
                longitude=s.longitude, sequence=s.sequence, source="SIMULATED",
                route_membership_source="SIMULATED")

def bus_json(b, occupancy, now):
    valid = road_path(b.route_id, b.direction_id or "LOOP") is not None
    return dict(id=b.id, route_id=b.route_id, latitude=b.latitude, longitude=b.longitude,
                speed_kmh=b.speed_kmh, segment_index=b.segment_index, segment_progress=b.segment_progress,
                distance_along_route_m=b.distance_along_route_m, heading_degrees=b.heading_degrees,
                direction_id=b.direction_id, position_valid=valid,
                vehicle_position_source="SIMULATED",
                occupancy_level=occupancy["occupancy_level"],
                independent_report_count=occupancy["distinct_reporter_count"],
                last_report_at=iso(occupancy["last_report_at"]),
                confidence_level=occupancy["confidence_level"],
                gps_stale=not gps_is_fresh(b.updated_at, now) or not valid,
                gps_age_seconds=max(0, int((now - b.updated_at).total_seconds())),
                updated_at=iso(b.updated_at), simulated=True)

def report_json(r):
    return dict(id=r.id, route_id=r.route_id, bus_id=r.bus_id, occupancy_level=r.occupancy_level,
                created_at=iso(r.created_at), is_demo=r.is_demo)

def alert_json(a):
    return dict(id=a.id, route_id=a.route_id, alert_type=a.alert_type, severity=a.severity,
                message=a.message, recommendation=a.recommendation, explanation=a.explanation,
                duration_seconds=a.duration_seconds, recent_report_count=a.recent_report_count,
                high_percentage=a.high_percentage, status=a.status, is_demo=a.is_demo,
                created_at=iso(a.created_at), acknowledged_at=iso(a.acknowledged_at), resolved_at=iso(a.resolved_at))

def action_json(action):
    return dict(id=action.id, alert_id=action.alert_id, action_code=action.action_code,
                planned_action=action.planned_action, created_at=iso(action.created_at), is_demo=action.is_demo)

PLANNED_ACTIONS = {
    "RESERVE_BUS": "Əlavə avtobus ehtiyatını planlaşdır",
    "CONTACT_DISPATCH": "Dispetçerlə əlaqəni planlaşdır",
    "MONITOR_ROUTE": "Marşrutu yaxından izləməyi planlaşdır",
    "REVIEW_REPORTS": "Sərnişin bildirişlərini yoxlamağı planlaşdır",
}

def occupancy_json(data):
    return {**data, "last_report_at": iso(data["last_report_at"]), "high_since": iso(data.get("high_since"))}

def require_operator(x_operator_key: str | None = Header(default=None)):
    if not x_operator_key or x_operator_key != OPERATOR_KEY:
        raise HTTPException(403, "Operator key tələb olunur")

def ensure_route(db, rid):
    route = db.get(Route, rid)
    if route is None:
        raise HTTPException(404, "Marşrut tapılmadı")
    return route

def tick(db, now):
    state = db.get(SimulationState, 1)
    if state and state.running:
        for bus in db.scalars(select(Bus)).all():
            seconds = max(0, (now - bus.updated_at).total_seconds())
            move_bus(bus, stops_for(db, bus.route_id), seconds, now)
        state.updated_at = now
    for route in db.scalars(select(Route)).all():
        evaluate(db, route.id, now)
    db.commit()

async def background_loop():
    while True:
        try:
            with SessionLocal() as db:
                tick(db, utcnow())
        except Exception:
            import logging
            logging.exception("Simulation tick failed")
        await asyncio.sleep(5)

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    migrate_existing_database()
    with SessionLocal() as db:
        seed(db)
        align_demo_records(db)
    task = asyncio.create_task(background_loop())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task

app = FastAPI(title="BakuTransit AI API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class ReportIn(BaseModel):
    route_id: str
    bus_id: str | None = None
    occupancy_level: str
    anonymous_reporter_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")

class PlannedActionIn(BaseModel):
    action_code: str

@app.get("/api/health")
def health():
    return {"status": "ok", "time": iso(utcnow())}

@app.get("/api/routes")
def routes(db: Session = Depends(get_db)):
    return [route_json(r) for r in db.scalars(select(Route).order_by(Route.id)).all()]

@app.get("/api/routes/{route_id}/geometry")
def route_geometry(route_id: str, db: Session = Depends(get_db)):
    ensure_route(db, route_id)
    return geometry_json(route_id)

@app.get("/api/route-geometries")
def route_geometries(db: Session = Depends(get_db)):
    return [geometry_json(route.id) for route in db.scalars(select(Route).order_by(Route.id)).all()]

@app.get("/api/routes/{route_id}/stops")
def stops(route_id: str, db: Session = Depends(get_db)):
    ensure_route(db, route_id)
    return [stop_json(s) for s in stops_for(db, route_id)]

@app.get("/api/official-stops")
def official_stops(min_lat: float = Query(40.30), max_lat: float = Query(40.45),
                   min_lon: float = Query(49.75), max_lon: float = Query(49.95),
                   limit: int = Query(150, ge=1, le=300), db: Session = Depends(get_db)):
    if not (39 <= min_lat < max_lat <= 42 and 48 <= min_lon < max_lon <= 51.5):
        raise HTTPException(422, "Xəritə sərhədləri yanlışdır")
    conditions = (OfficialStop.latitude >= min_lat, OfficialStop.latitude <= max_lat,
                  OfficialStop.longitude >= min_lon, OfficialStop.longitude <= max_lon)
    count = db.scalar(select(func.count()).select_from(OfficialStop).where(*conditions)) or 0
    center_lat, center_lon = (min_lat + max_lat) / 2, (min_lon + max_lon) / 2
    rows = db.scalars(select(OfficialStop).where(*conditions)).all()
    rows.sort(key=lambda stop: (stop.latitude-center_lat)**2 + (stop.longitude-center_lon)**2)
    return {"source": "OFFICIAL_STATIC", "route_membership_verified": False,
            "total_in_area": count,
            "stops": [{"id": stop.id, "name": stop.name, "stop_type": stop.stop_type,
                       "latitude": stop.latitude, "longitude": stop.longitude,
                       "source": stop.source} for stop in rows[:limit]]}

@app.get("/api/routes/{route_id}/buses")
def buses(route_id: str, db: Session = Depends(get_db)):
    ensure_route(db, route_id)
    now = utcnow()
    return [bus_json(b, aggregate(db, route_id, now, b.id), now)
            for b in db.scalars(select(Bus).where(Bus.route_id == route_id).order_by(Bus.id)).all()]

@app.get("/api/eta")
def eta(route_id: str, stop_id: str, db: Session = Depends(get_db)):
    ensure_route(db, route_id)
    ordered = stops_for(db, route_id)
    target = next((i for i, s in enumerate(ordered) if s.id == stop_id), None)
    if target is None:
        raise HTTPException(404, "Dayanacaq tapılmadı")
    now = utcnow()
    arrivals = []
    for bus in db.scalars(select(Bus).where(Bus.route_id == route_id)).all():
        evidence = aggregate(db, route_id, now, bus.id)
        fresh = gps_is_fresh(bus.updated_at, now)
        path = road_path(bus.route_id, bus.direction_id or "LOOP")
        reason = ("STALE_GPS" if not fresh else "NO_GEOMETRY" if path is None
                  else "NO_SPEED" if bus.speed_kmh <= 0 else None)
        arrivals.append(dict(bus_id=bus.id, route_id=route_id,
                             eta_minutes=eta_minutes(bus, ordered, target) if reason is None else None,
                             eta_unavailable_reason=reason,
                             gps_stale=not fresh,
                             occupancy_level=evidence["occupancy_level"], speed_kmh=bus.speed_kmh,
                             independent_report_count=evidence["distinct_reporter_count"],
                             last_report_at=evidence["last_report_at"],
                             confidence_level=evidence["confidence_level"],
                             updated_at=bus.updated_at, simulated=True))
    arrivals.sort(key=lambda item: (item["eta_minutes"] is None, item["eta_minutes"] or 0))
    suggestion = suggest_alternative(arrivals, now)
    return {"route_id": route_id, "stop_id": stop_id,
            "label": "Yol geometriyası mövcud deyil" if any(item["eta_unavailable_reason"] == "NO_GEOMETRY" for item in arrivals)
                     else "Bəzi GPS məlumatları köhnəlib" if any(item["gps_stale"] for item in arrivals)
                     else "Simulyasiya əsasında təxmini vaxt",
            "arrivals": [{**item, "updated_at": iso(item["updated_at"]),
                          "last_report_at": iso(item["last_report_at"])} for item in arrivals],
            "suggestion": suggestion}

@app.post("/api/reports", status_code=201)
def submit_report(payload: ReportIn, db: Session = Depends(get_db)):
    ensure_route(db, payload.route_id)
    if payload.occupancy_level not in ("LOW", "MEDIUM", "HIGH"):
        raise HTTPException(422, "Sıxlıq səviyyəsi yanlışdır")
    if payload.bus_id:
        bus = db.get(Bus, payload.bus_id)
        if bus is None or bus.route_id != payload.route_id:
            raise HTTPException(422, "Avtobus bu marşruta aid deyil")
    now = utcnow()
    recent = db.scalar(select(CrowdReport).where(
        CrowdReport.route_id == payload.route_id,
        CrowdReport.anonymous_reporter_id == payload.anonymous_reporter_id,
        CrowdReport.is_demo == False,
        CrowdReport.created_at > now - timedelta(seconds=COOLDOWN)).order_by(CrowdReport.created_at.desc()))
    if recent:
        raise HTTPException(429, "Yeni bildiriş üçün bir az gözləyin")
    report = CrowdReport(route_id=payload.route_id, bus_id=payload.bus_id,
                         occupancy_level=payload.occupancy_level,
                         anonymous_reporter_id=payload.anonymous_reporter_id, created_at=now, is_demo=False)
    db.add(report)
    db.flush()
    evaluate(db, payload.route_id, now)
    db.commit()
    return report_json(report)

@app.get("/api/routes/{route_id}/occupancy")
def occupancy(route_id: str, db: Session = Depends(get_db)):
    ensure_route(db, route_id)
    return occupancy_json(aggregate(db, route_id, utcnow()))

@app.get("/api/operator/overview")
def overview(db: Session = Depends(get_db)):
    now = utcnow()
    rows = [aggregate(db, r.id, now) for r in db.scalars(select(Route).where(Route.is_active == True)).all()]
    return {
        "active_routes": len(rows),
        "active_buses": db.scalar(select(func.count()).select_from(Bus)) or 0,
        "recent_reports": db.scalar(select(func.count()).select_from(CrowdReport).where(CrowdReport.created_at > now-timedelta(minutes=10))) or 0,
        "high_routes": sum(row["occupancy_level"] == "HIGH" for row in rows),
        "active_alerts": db.scalar(select(func.count()).select_from(Alert).where(Alert.status == "ACTIVE")) or 0,
        "updated_at": iso(now), "simulated_gps": True}

@app.get("/api/operator/routes")
def operator_routes(db: Session = Depends(get_db)):
    now = utcnow()
    output = []
    for route in db.scalars(select(Route).order_by(Route.id)).all():
        data = aggregate(db, route.id, now)
        status = db.scalar(select(RouteStatus).where(RouteStatus.route_id == route.id))
        alert = db.scalar(select(Alert).where(Alert.route_id == route.id, Alert.status != "RESOLVED"))
        output.append({**route_json(route), **occupancy_json(data),
                       "active_buses": db.scalar(select(func.count()).select_from(Bus).where(Bus.route_id == route.id)) or 0,
                       "detection_state": status.detection_state if status else "NORMAL",
                       "alert_status": alert.status if alert else None})
    return output

@app.get("/api/operator/reports")
def operator_reports(limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)):
    return [report_json(r) for r in db.scalars(select(CrowdReport).order_by(CrowdReport.created_at.desc(), CrowdReport.id.desc()).limit(limit)).all()]

@app.get("/api/operator/alerts")
def operator_alerts(db: Session = Depends(get_db)):
    return [alert_json(a) for a in db.scalars(select(Alert).order_by(Alert.created_at.desc(), Alert.id.desc())).all()]

@app.post("/api/operator/alerts/{alert_id}/acknowledge", dependencies=[Depends(require_operator)])
def acknowledge(alert_id: int, db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Xəbərdarlıq tapılmadı")
    if alert.status != "ACTIVE":
        raise HTTPException(409, "Yalnız aktiv xəbərdarlıq təsdiqlənə bilər")
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_at = utcnow()
    db.commit()
    return alert_json(alert)

@app.get("/api/operator/actions")
def operator_actions(db: Session = Depends(get_db)):
    return [action_json(action) for action in db.scalars(
        select(OperatorAction).order_by(OperatorAction.created_at.desc(), OperatorAction.id.desc()).limit(100)
    ).all()]

@app.post("/api/operator/alerts/{alert_id}/actions", status_code=201, dependencies=[Depends(require_operator)])
def record_planned_action(alert_id: int, payload: PlannedActionIn, db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(404, "Xəbərdarlıq tapılmadı")
    if alert.status == "RESOLVED":
        raise HTTPException(409, "Həll olunmuş xəbərdarlıq üçün yeni plan yazıla bilməz")
    if payload.action_code not in PLANNED_ACTIONS:
        raise HTTPException(422, "Planlaşdırılan tədbir yanlışdır")
    action = OperatorAction(alert_id=alert.id, action_code=payload.action_code,
                            planned_action=PLANNED_ACTIONS[payload.action_code],
                            created_at=utcnow(), is_demo=alert.is_demo)
    db.add(action)
    db.commit()
    db.refresh(action)
    return action_json(action)

@app.get("/api/simulation/status")
def simulation_status(db: Session = Depends(get_db)):
    state = db.get(SimulationState, 1)
    return {"running": bool(state.running), "updated_at": iso(state.updated_at), "simulated": True}

@app.post("/api/demo/simulation/start", dependencies=[Depends(require_operator)])
def start_simulation(db: Session = Depends(get_db)):
    state = db.get(SimulationState, 1)
    state.running = True
    state.updated_at = utcnow()
    for bus in db.scalars(select(Bus)).all():
        if road_path(bus.route_id, bus.direction_id or "LOOP"):
            bus.updated_at = state.updated_at
    db.commit()
    return {"running": True, "simulated": True}

@app.post("/api/demo/simulation/stop", dependencies=[Depends(require_operator)])
def stop_simulation(db: Session = Depends(get_db)):
    state = db.get(SimulationState, 1)
    state.running = False
    state.updated_at = utcnow()
    db.commit()
    return {"running": False, "simulated": True}

@app.post("/api/demo/simulation/reset", dependencies=[Depends(require_operator)])
def reset_simulation(db: Session = Depends(get_db)):
    now = utcnow()
    for bus in db.scalars(select(Bus)).all():
        path = road_path(bus.route_id, bus.direction_id or "LOOP")
        if path is None:
            continue
        index = 0 if bus.id.endswith("01") else 2
        bus.distance_along_route_m = path.stop_distances_m[index]
        lat, lon, heading, segment, fraction = path.position(bus.distance_along_route_m)
        bus.latitude, bus.longitude = lat, lon
        bus.heading_degrees = heading
        bus.segment_index, bus.segment_progress = segment, fraction
        bus.updated_at = now
    db.commit()
    return {"reset": True, "simulated": True}

@app.post("/api/demo/high-crowding", dependencies=[Depends(require_operator)])
def demo_high_crowding(db: Session = Depends(get_db)):
    rid = "D1"
    now = utcnow().replace(microsecond=0)
    start = now - timedelta(minutes=15)
    # Clear only prior demo artifacts. Genuine passenger reports remain intact.
    db.execute(delete(OperatorAction).where(OperatorAction.is_demo == True))
    db.execute(delete(Alert).where(Alert.is_demo == True))
    db.execute(delete(CrowdReport).where(CrowdReport.is_demo == True))
    status = db.scalar(select(RouteStatus).where(RouteStatus.route_id == rid))
    status.detection_state, status.high_since = "NORMAL", None
    transitions = ["NORMAL"]
    timeline = []
    for minute in range(16):
        at = start + timedelta(minutes=minute)
        for reporter in range(4):
            db.add(CrowdReport(route_id=rid, bus_id="D1-01", occupancy_level="HIGH",
                anonymous_reporter_id=f"demo_{reporter}", created_at=at, is_demo=True))
        db.flush()
        outcome = evaluate(db, rid, at)
        if transitions[-1] != outcome["detection_state"]:
            transitions.append(outcome["detection_state"])
        created_alert = db.scalar(select(Alert).where(
            Alert.route_id == rid, Alert.is_demo == True, Alert.created_at == at))
        timeline.append({
            "minute": minute,
            "at": iso(at),
            "new_reports": 4,
            "total_demo_reports": 4 * (minute + 1),
            "recent_report_count": outcome["recent_report_count"],
            "independent_reporter_count": outcome["distinct_reporter_count"],
            "high_percentage": outcome["high_percentage"],
            "occupancy_level": outcome["occupancy_level"],
            "detection_state": outcome["detection_state"],
            "sustained_minutes": int((at - outcome["high_since"]).total_seconds() // 60)
                if outcome["high_since"] else 0,
            "alert_created": created_alert is not None,
        })
    db.commit()
    alert = db.scalar(select(Alert).where(Alert.route_id == rid, Alert.status == "ACTIVE").order_by(Alert.id.desc()))
    report_count = db.scalar(select(func.count()).select_from(CrowdReport).where(CrowdReport.route_id == rid, CrowdReport.is_demo == True)) or 0
    return {"simulated": True, "route_id": rid, "transitions": transitions,
            "report_count": report_count, "alert": alert_json(alert) if alert else None,
            "timeline": timeline}

@app.post("/api/demo/reset", dependencies=[Depends(require_operator)])
def demo_reset(db: Session = Depends(get_db)):
    report_count = db.execute(delete(CrowdReport).where(CrowdReport.is_demo == True)).rowcount
    action_count = db.execute(delete(OperatorAction).where(OperatorAction.is_demo == True)).rowcount
    alert_count = db.execute(delete(Alert).where(Alert.is_demo == True)).rowcount
    now = utcnow()
    for route in db.scalars(select(Route)).all():
        status = db.scalar(select(RouteStatus).where(RouteStatus.route_id == route.id))
        status.detection_state, status.high_since = "NORMAL", None
        evaluate(db, route.id, now)
    db.commit()
    return {"simulated_reports_removed": report_count, "simulated_alerts_removed": alert_count,
            "simulated_actions_removed": action_count,
            "genuine_reports_preserved": True}
