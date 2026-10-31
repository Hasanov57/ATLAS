# BakuTransit AI

**Smarter Mobility. Better Baku.** A local hackathon prototype with an Azerbaijani passenger app and an operator control center. Three clearly labeled demonstration routes and six buses move through a shared server-side GPS simulation. Passenger reports are stored in SQLite and feed a deterministic crowding and alert engine.

## Stack

React 18, TypeScript, Vite, Tailwind CSS, React Router, React Leaflet, OpenStreetMap; FastAPI, SQLAlchemy, Pydantic, SQLite; Pytest; Docker Compose.

## Local startup

Requires Python 3.11+ and Node.js 20+ with npm. Open **two terminals** in the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

On macOS/Linux, activate with `source .venv/bin/activate`. The frontend also works with `corepack pnpm install` and `corepack pnpm dev`.

- Passenger app: http://localhost:5173
- Operator dashboard: http://localhost:5173/operator
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

For Android testing on the same Wi-Fi, run both servers with `--host 0.0.0.0` as above and open `http://COMPUTER_LAN_IP:5173` on the phone. Allow inbound ports 5173 and 8000 in the local firewall if needed. The frontend proxies `/api` to the backend on the development computer, so the phone never calls its own `localhost`. A web manifest and icons support installation where the browser permits it; offline API data is not available.

## Docker

```powershell
docker compose up --build
```

The same URLs apply. SQLite persists in the `transit_data` volume. Docker was not available in the development environment, so this configuration is supplied but not runtime verified there.

## Demo workflow

1. Open the passenger page. Select **D1**, choose a stop, inspect the moving buses and ETA, then submit **Yüksək sıxlıq**. A successful message appears only after the API saves the report.
2. Open **/operator**. The new report appears in the feed and KPIs update. One browser cannot alone establish high occupancy: three distinct reporters are required.
3. In the demo panel, click **Yüksək sıxlıq ssenarisini başlat**. The backend inserts 16 minutes of simulated reports from four distinct reporters and evaluates the actual rule at each historical minute. The one-click presentation automatically plays the report counts, independent sources, ten-minute HIGH detection, alert creation, and additional-bus planning recommendation.
4. Record a planned response on the alert, then acknowledge it. The plan history records a timestamp but never represents a real dispatch. Use **Demonu sıfırla** to remove only simulated reports, alerts, and plans; genuine data remain.

Demo/operator mutations require `X-Operator-Key`. The default development key is `local-demo-key` and can be changed with `OPERATOR_KEY`; enter the corresponding key in the operator demo panel. This is lightweight development-only access control. A production deployment needs real authentication, roles, rate limiting and HTTPS. Do not deploy the default key publicly.

## Tests

```powershell
cd backend
python -m pytest -q
cd ../frontend
npm run build
```

## Road geometry and official stops

The three D1/D2/D3 routes are **demonstration routes**, not verified BakuBus itineraries. Their cached road paths in `backend/data/geometry/` were generated from OpenStreetMap routing through OSRM. Buses travel along those paths, headings follow adjacent path vertices, and ETA uses the remaining path distance to a selected demo stop. The browser animates between server positions on the same road path. Invalid or missing geometry suppresses the route line and ETA rather than drawing a straight shortcut. Road geometry is cached locally; runtime simulation does not call OSRM.

To regenerate the demo paths (requires network access to the OSRM public demo server):

```powershell
cd backend
python scripts/build_demo_geometry.py
```

Stop locations can be imported separately from the [official IDDA open-data CSV](https://opendata.az/@baki-metropoliteni/bakubus-mmc-ye-mexsus-avtobus-marsrutlari-uzre-dayanacaqlarin-cografi-koordinatlari):

```powershell
cd backend
python scripts/import_official_stops.py --download
```

The import performed in this workspace loaded 3,600 official stop coordinates into the local SQLite database; that database is not versioned. The public CSV does **not** provide verified membership or order for these demo routes, so official stops are an optional map layer and are never used to invent route stops or ETA. The importer handles decimal degrees and microdegrees, duplicate `ID` headers, invalid bounds and repeat imports. `GET /api/official-stops` returns the source and an explicit `route_membership_verified: false` flag. Demo routes, demo route stops, simulated GPS and estimated ETA have separate source labels in the API.

## Limits

There is no official route geometry, live vehicle GPS, traffic feed or verified route-stop membership. OSRM's drivable path is a road-based approximation for the demo itinerary; it does not prove that a real bus follows that route. The D2 demo's old Bulvar waypoint snapped about 452 m to a drivable road, so its label is approximate. Stale GPS (older than 30 seconds), missing road geometry or zero speed yields a null ETA with an explicit reason. Crowding comes from anonymous passenger reports, not vehicle sensors. A less crowded later bus is suggested only when both same-route buses have fresh GPS and reliable bus-specific crowd evidence; no route connection is inferred. The sustained alert is advisory and does not dispatch a bus.

The SQLite simulator assumes one Uvicorn worker. Map tiles and the Google font request require internet; the local API, cached paths and bus positions remain available without them. No offline service worker is included. Development operator access uses a shared key; production needs authenticated roles, rate limiting, HTTPS, monitored data feeds and verified transport geometries.
