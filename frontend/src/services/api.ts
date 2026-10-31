import type {
  Alert,
  Bus,
  Eta,
  Occupancy,
  OperatorRoute,
  OperatorAction,
  PlannedActionCode,
  Overview,
  Report,
  Route,
  RouteGeometry,
  OfficialStopsResponse,
  Stop,
  Level,
} from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, init);
  } catch {
    throw new Error(
      "Serverə qoşulmaq mümkün olmadı. Backendin işlədiyini yoxlayın.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : `Sorğu alınmadı (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
const json = () => ({ "Content-Type": "application/json" });
const operator = () => ({
  "X-Operator-Key": sessionStorage.getItem("operator-key") || "local-demo-key",
});
export const api = {
  routes: () => request<Route[]>("/routes"),
  geometry: (id: string) => request<RouteGeometry>(`/routes/${id}/geometry`),
  geometries: () => request<RouteGeometry[]>("/route-geometries"),
  officialStops: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }) =>
    request<OfficialStopsResponse>(
      `/official-stops?min_lat=${bounds.minLat}&max_lat=${bounds.maxLat}&min_lon=${bounds.minLon}&max_lon=${bounds.maxLon}&limit=120`,
    ),
  stops: (id: string) => request<Stop[]>(`/routes/${id}/stops`),
  buses: (id: string) => request<Bus[]>(`/routes/${id}/buses`),
  eta: (route: string, stop: string) =>
    request<Eta>(
      `/eta?route_id=${encodeURIComponent(route)}&stop_id=${encodeURIComponent(stop)}`,
    ),
  occupancy: (id: string) => request<Occupancy>(`/routes/${id}/occupancy`),
  report: (body: {
    route_id: string;
    bus_id: string | null;
    occupancy_level: Level;
    anonymous_reporter_id: string;
  }) =>
    request<Report>("/reports", {
      method: "POST",
      headers: json(),
      body: JSON.stringify(body),
    }),
  overview: () => request<Overview>("/operator/overview"),
  operatorRoutes: () => request<OperatorRoute[]>("/operator/routes"),
  reports: (limit = 30) =>
    request<Report[]>(`/operator/reports?limit=${limit}`),
  alerts: () => request<Alert[]>("/operator/alerts"),
  actions: () => request<OperatorAction[]>("/operator/actions"),
  recordAction: (alertId: number, actionCode: PlannedActionCode) =>
    request<OperatorAction>(`/operator/alerts/${alertId}/actions`, {
      method: "POST",
      headers: { ...json(), ...operator() },
      body: JSON.stringify({ action_code: actionCode }),
    }),
  simulation: () =>
    request<{ running: boolean; updated_at: string }>("/simulation/status"),
  mutate: (path: string) =>
    request<any>(path, { method: "POST", headers: operator() }),
};
