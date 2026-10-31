# Architecture

The React/Vite app has two routes: `/` for passengers and `/operator` for operators. Both poll the same REST API every five seconds. Vite proxies `/api` to FastAPI, including on a phone using the computer's LAN IP. The frontend never generates bus positions or dashboard metrics.

FastAPI persists routes, ordered stops, buses, anonymous reports, route states, simulation state, alerts and planned operator actions in SQLite via SQLAlchemy. A single background task ticks roughly every five seconds. It advances each bus by speed × elapsed time along a cached OSM-derived circular road path, then re-evaluates every route. One backend worker avoids duplicate loops.

Bus markers and per-bus ETA badges use crowd reports tied to that bus; the route-wide status and sustained alert use all reports for the route. Without enough bus-specific evidence a bus remains UNKNOWN. A same-route alternative appears only when the approaching bus is HIGH, a later bus is LOW or MEDIUM, and both GPS positions are fresh.

The cached road geometry has cumulative edge distances and ordered demo-stop offsets. ETA uses the forward road distance from bus progress to the selected stop. Missing or invalid geometry, zero speed or GPS older than 30 seconds makes ETA null with a reason. The optional official IDDA stop layer is stored in a separate table because the public CSV does not verify demo route membership.

Analytics uses a ten-minute rolling window. Each reporter contributes only their latest vote. Fewer than three distinct reporters or no fresh report in two minutes yields UNKNOWN. At least 60% HIGH votes yields HIGH; otherwise a deterministic LOW/MEDIUM count decides. Reports and server timestamps are authoritative in SQLite. Confidence is HIGH for at least five independent votes updated within one minute, MEDIUM for other sufficient fresh evidence, and INSUFFICIENT otherwise.

The anomaly state machine is NORMAL → HIGH_PENDING → HIGH_CONFIRMED. The first qualifying HIGH records `high_since`; only uninterrupted fresh HIGH for 600 seconds creates one alert. A lapse resets the timer and resolves any active incident. Alert creation checks for an existing unresolved alert. The demo inserts historical reports and replays these same functions with explicit timestamps. It returns each evaluated minute for the judge presentation. Operators can record planned responses; no endpoint dispatches a bus.

SQLite stores UTC timestamps. API responses include `Z`; the UI renders times in `Asia/Baku`. Demo/operator mutations require a development key. Production needs a stronger identity system.
