import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./baku_transit.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    with SessionLocal() as db:
        yield db

def migrate_existing_database():
    """Add nullable movement fields without deleting existing SQLite data."""
    if not DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import text
    with engine.begin() as connection:
        names = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(buses)")}
        additions = {
            "distance_along_route_m": "REAL",
            "heading_degrees": "REAL",
            "direction_id": "VARCHAR DEFAULT 'LOOP'",
        }
        for column, definition in additions.items():
            if column not in names:
                connection.exec_driver_sql(f"ALTER TABLE buses ADD COLUMN {column} {definition}")
