import os
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Alert, CrowdReport, RouteStatus

WINDOW_SECONDS = 600
MIN_REPORTERS = 3
HIGH_THRESHOLD = 60
FRESHNESS_SECONDS = int(os.getenv("REPORT_FRESHNESS_SECONDS", "120"))

def aggregate(db: Session, route_id: str, at: datetime, bus_id: str | None = None):
    conditions = [
        CrowdReport.route_id == route_id,
        CrowdReport.created_at > at - timedelta(seconds=WINDOW_SECONDS),
        CrowdReport.created_at <= at,
    ]
    if bus_id is not None:
        conditions.append(CrowdReport.bus_id == bus_id)
    reports = db.scalars(select(CrowdReport).where(*conditions).order_by(CrowdReport.created_at.desc())).all()
    latest = {}
    for report in reports:
        latest.setdefault(report.anonymous_reporter_id, report)
    votes = list(latest.values())
    high = 100 * sum(r.occupancy_level == "HIGH" for r in votes) / len(votes) if votes else 0.0
    latest_age = (at - reports[0].created_at).total_seconds() if reports else None
    if len(votes) < MIN_REPORTERS:
        confidence = "INSUFFICIENT"
        confidence_reason = "Ən azı 3 müstəqil sərnişin bildirişi lazımdır."
    elif latest_age is None or latest_age > FRESHNESS_SECONDS:
        confidence = "INSUFFICIENT"
        confidence_reason = "Son bildiriş köhnəlib; yeni təsdiq lazımdır."
    elif len(votes) >= 5 and latest_age <= 60:
        confidence = "HIGH"
        confidence_reason = "Ən azı 5 müstəqil və son 1 dəqiqədə yenilənmiş bildiriş var."
    else:
        confidence = "MEDIUM"
        confidence_reason = "Ən azı 3 müstəqil və son 2 dəqiqədə yenilənmiş bildiriş var."
    if confidence == "INSUFFICIENT":
        level = "UNKNOWN"
    elif high >= HIGH_THRESHOLD:
        level = "HIGH"
    else:
        medium = sum(r.occupancy_level == "MEDIUM" for r in votes)
        low = sum(r.occupancy_level == "LOW" for r in votes)
        level = "MEDIUM" if medium >= low else "LOW"
    return {"route_id": route_id, "occupancy_level": level, "recent_report_count": len(reports),
            "distinct_reporter_count": len(votes), "high_percentage": round(high, 1),
            "last_report_at": reports[0].created_at if reports else None,
            "confidence_level": confidence, "confidence_reason": confidence_reason,
            "simulated": bool(reports) and all(r.is_demo for r in reports)}

def evaluate(db: Session, route_id: str, at: datetime):
    data = aggregate(db, route_id, at)
    status = db.scalar(select(RouteStatus).where(RouteStatus.route_id == route_id))
    if status is None:
        status = RouteStatus(route_id=route_id, occupancy_level="UNKNOWN", detection_state="NORMAL")
        db.add(status)
    if data["occupancy_level"] == "HIGH":
        if status.detection_state == "NORMAL" or status.high_since is None:
            status.high_since = at
            status.detection_state = "HIGH_PENDING"
        elif status.detection_state == "HIGH_PENDING" and (at-status.high_since).total_seconds() >= 600:
            status.detection_state = "HIGH_CONFIRMED"
            existing = db.scalar(select(Alert).where(Alert.route_id == route_id, Alert.status != "RESOLVED"))
            if existing is None:
                duration = int((at-status.high_since).total_seconds())
                db.add(Alert(route_id=route_id, alert_type="SUSTAINED_HIGH", severity="HIGH",
                    message="YÜKSƏK SIXLIQ AŞKARLANDI", recommendation="Əlavə avtobus ehtiyatı ayrılmalıdır.",
                    explanation=f"{route_id} marşrutunda {duration//60} dəqiqə davamlı yüksək sıxlıq; "
                                f"{data['recent_report_count']} bildiriş, {data['distinct_reporter_count']} fərqli mənbə, "
                                f"{data['high_percentage']}% yüksək sıxlıq.",
                    duration_seconds=duration, recent_report_count=data["recent_report_count"],
                    high_percentage=data["high_percentage"], status="ACTIVE", is_demo=data["simulated"], created_at=at))
    else:
        status.detection_state = "NORMAL"
        status.high_since = None
        for alert in db.scalars(select(Alert).where(Alert.route_id == route_id, Alert.status != "RESOLVED")).all():
            alert.status = "RESOLVED"
            alert.resolved_at = at
    status.occupancy_level = data["occupancy_level"]
    status.last_evaluated_at = at
    status.last_report_at = data["last_report_at"]
    db.flush()
    return {**data, "detection_state": status.detection_state, "high_since": status.high_since}
