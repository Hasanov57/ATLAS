from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base

class Route(Base):
    __tablename__ = "routes"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    color: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class Stop(Base):
    __tablename__ = "stops"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id"))
    name: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    sequence: Mapped[int] = mapped_column(Integer)
    __table_args__ = (UniqueConstraint("route_id", "sequence"),)

class Bus(Base):
    __tablename__ = "buses"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id"))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    speed_kmh: Mapped[float] = mapped_column(Float)
    segment_index: Mapped[int] = mapped_column(Integer)
    segment_progress: Mapped[float] = mapped_column(Float)
    distance_along_route_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading_degrees: Mapped[float | None] = mapped_column(Float, nullable=True)
    direction_id: Mapped[str] = mapped_column(String, default="LOOP")
    updated_at: Mapped[datetime] = mapped_column(DateTime)

class CrowdReport(Base):
    __tablename__ = "crowd_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id"))
    bus_id: Mapped[str | None] = mapped_column(ForeignKey("buses.id"), nullable=True)
    anonymous_reporter_id: Mapped[str] = mapped_column(String)
    occupancy_level: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

class RouteStatus(Base):
    __tablename__ = "route_statuses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id"), unique=True)
    occupancy_level: Mapped[str] = mapped_column(String, default="UNKNOWN")
    detection_state: Mapped[str] = mapped_column(String, default="NORMAL")
    high_since: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_report_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id"))
    alert_type: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    recent_report_count: Mapped[int] = mapped_column(Integer)
    high_percentage: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class OperatorAction(Base):
    __tablename__ = "operator_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"))
    action_code: Mapped[str] = mapped_column(String)
    planned_action: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

class SimulationState(Base):
    __tablename__ = "simulation_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    running: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

class OfficialStop(Base):
    """Official stop locations, independent of unverified demo route membership."""
    __tablename__ = "official_stops"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    stop_type: Mapped[str | None] = mapped_column(String, nullable=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String, default="OFFICIAL_STATIC")
    source_url: Mapped[str] = mapped_column(String)
