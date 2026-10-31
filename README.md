# ATLAS — BakuTransit AI

**Smarter Mobility. Better Baku.** An Azerbaijani transit demonstration with a map-first passenger app and an operator dashboard. Three clearly labeled demo routes and six buses use a shared FastAPI/SQLite GPS simulation. Passenger reports feed deterministic crowding and alert rules. The interface and app icon use the ATLAS brand.

## Stack

React 18, TypeScript, Vite, Tailwind CSS, React Router, React Leaflet, OpenStreetMap; FastAPI, SQLAlchemy, Pydantic, SQLite; Pytest; Docker Compose.

## Local startup

Requires Python 3.11+ and Node.js 20+. The frontend lockfile uses pnpm (via Corepack). Open **two terminals** in the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```powershell
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm dev -- --host 0.0.0.0
```

On macOS/Linux, activate with `source .venv/bin/activate`. `npm install` and `npm run dev` also work, but pnpm matches the committed lockfile.

- Passenger app: http://localhost:5173
- Operator dashboard: http://localhost:5173/operator
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

For Android testing on the same Wi-Fi, run both servers with `--host 0.0.0.0` as above and open `http://COMPUTER_LAN_IP:5173` on the phone. Allow inbound ports 5173 and 8000 in the local firewall if needed. The frontend proxies `/api` to the backend on the development computer, so the phone never calls its own `localhost`. A web manifest and icons support installation where the browser permits it; offline API data is not available.

## Docker

```powershell
docker compose up --build
```

The same URLs apply. SQLite persists in the `transit_data` volume. The backend image includes the cached demo road geometry. Docker was not available in the development environment, so the Compose startup has not been runtime verified here. A fresh SQLite volume does not include the official stops. To load them into Docker after startup, run `docker compose exec backend python scripts/import_official_stops.py --download`.

## Demo workflow

1. Open the passenger page. The first visit shows a local **demo** login screen with mygov ID, SİMA, ASAN, identification and anonymous choices. These choices do not contact a government identity service or verify a person. The chosen label is stored in browser local storage and can be changed from the profile. The QR graphic is only a demo placeholder.
2. Anonymous mode can view the map but the passenger UI blocks crowd reports. Choose a non-anonymous demo method to submit a report. This is a **client-side demo restriction**, not server-side authentication; the reports API still accepts a valid anonymous reporter ID.
3. Select **D1**, choose a demo stop, inspect moving buses and ETA, then submit **Yüksək sıxlıq**. The report is stored in SQLite. The bell in the header opens a swipeable panel with the latest 100 passenger reports and all operator alerts, with loading skeletons.
4. Open **/operator**. Reports appear in the feed and KPIs update. Three independent recent reporters are required before a route has reliable crowd evidence.
5. In the demo panel, click **Yüksək sıxlıq ssenarisini başlat**. Historical replay runs the production rules over 16 simulated minutes and presents report aggregation, sustained HIGH detection, alert generation, and an additional-bus planning recommendation.
6. Record a planned response on the alert, then acknowledge it. The action history stores the plan and timestamp; it does not represent an actual dispatch. **Demonu sıfırla** removes simulated reports, alerts and plans while keeping genuine reports.

Operator mutations require `X-Operator-Key`. The default development key is `local-demo-key` and can be changed with `OPERATOR_KEY`; enter the matching key in the operator dashboard. This is development-only access control. Use real authentication and role checks before public deployment.

## Tests

```powershell
cd backend
python -m pytest -q
cd ../frontend
corepack pnpm build
```

## Road geometry and official stops

The three D1/D2/D3 routes are **demonstration routes**, not verified BakuBus itineraries. Their cached road paths in `backend/data/geometry/` were generated from OpenStreetMap routing through OSRM. Buses travel along those paths, GPS heading follows adjacent path vertices, and ETA uses the remaining path distance to a selected demo stop. The bus icon remains upright while a separate badge signals an upcoming left or right turn. The browser animates between server positions on the same road path. Invalid or missing geometry suppresses the route line and ETA rather than drawing a straight shortcut. Road geometry is cached locally; runtime simulation does not call OSRM.

To regenerate the demo paths (requires network access to the OSRM public demo server):

```powershell
cd backend
python scripts/build_demo_geometry.py
```

Stop locations can be imported separately from the [official IDDA open-data dataset](https://opendata.az/@baki-metropoliteni/bakubus-mmc-ye-mexsus-avtobus-marsrutlari-uzre-dayanacaqlarin-cografi-koordinatlari):

```powershell
cd backend
python scripts/import_official_stops.py --download
```

The importer reads the current CSV resource URL from the dataset metadata API. The import performed in this workspace loaded 3,600 official stop coordinates into the local SQLite database; that database is not versioned. A new clone must run the import to populate its own database. The public CSV does **not** provide verified membership or order for these demo routes, so official stops are an optional map layer and are never used to invent route stops or ETA. The importer handles decimal degrees and microdegrees, duplicate `ID` headers, invalid bounds and repeat imports. `GET /api/official-stops` returns the source and an explicit `route_membership_verified: false` flag. Demo routes, demo route stops, simulated GPS and estimated ETA have separate source labels in the API.

## Limits

There is no official route geometry, live vehicle GPS, traffic feed or verified route-stop membership. OSRM's drivable path is a road-based approximation for the demo itinerary; it does not prove that a real bus follows that route. The D2 demo's old Bulvar waypoint snapped about 452 m to a drivable road, so its label is approximate. Stale GPS (older than 30 seconds), missing road geometry or zero speed yields a null ETA with an explicit reason. Crowding comes from anonymous passenger reports, not vehicle sensors. A less crowded later bus is suggested only when both same-route buses have fresh GPS and reliable bus-specific crowd evidence; no route connection is inferred. The sustained alert is advisory and does not dispatch a bus.

The SQLite simulator assumes one Uvicorn worker. OpenStreetMap map tiles require internet; the Manrope font is bundled locally. The local API, cached paths and bus positions remain available without internet. No offline service worker is included. Development operator access uses a shared key; production needs authenticated roles, rate limiting, HTTPS, monitored data feeds and verified transport geometries.
