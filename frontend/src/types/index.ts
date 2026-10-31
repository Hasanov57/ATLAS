export type Level = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "INSUFFICIENT";
export interface Route {
  id: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
  simulated: boolean;
  official_route: boolean;
  geometry_source: "OSM_DERIVED" | "UNVERIFIED";
  vehicle_position_source: "SIMULATED";
  eta_source: "SIMULATED";
  live_gps_available: boolean;
}
export interface RouteGeometry {
  route_id: string;
  direction_id: string;
  geometry_source: "OSM_DERIVED" | "UNVERIFIED";
  official_route: boolean;
  label: string;
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
}
export interface OfficialStop {
  id: string;
  name: string;
  stop_type: string | null;
  latitude: number;
  longitude: number;
  source: "OFFICIAL_STATIC";
}
export interface OfficialStopsResponse {
  source: "OFFICIAL_STATIC";
  route_membership_verified: false;
  total_in_area: number;
  stops: OfficialStop[];
}
export interface Stop {
  id: string;
  route_id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  source: "SIMULATED";
  route_membership_source: "SIMULATED";
}
export interface Bus {
  id: string;
  route_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  segment_index: number;
  segment_progress: number;
  distance_along_route_m: number | null;
  heading_degrees: number | null;
  turn_direction?: "left" | "right" | null;
  direction_id: string;
  position_valid: boolean;
  vehicle_position_source: "SIMULATED";
  occupancy_level: Level;
  independent_report_count: number;
  last_report_at: string | null;
  confidence_level: ConfidenceLevel;
  gps_stale: boolean;
  gps_age_seconds: number;
  updated_at: string;
  simulated: boolean;
}
export interface Arrival {
  bus_id: string;
  route_id: string;
  eta_minutes: number | null;
  eta_unavailable_reason: "STALE_GPS" | "NO_GEOMETRY" | "NO_SPEED" | null;
  occupancy_level: Level;
  independent_report_count: number;
  last_report_at: string | null;
  confidence_level: ConfidenceLevel;
  gps_stale: boolean;
  speed_kmh: number;
  updated_at: string;
  simulated: boolean;
}
export interface AlternativeSuggestion {
  overcrowded_bus_id: string;
  recommended_bus_id: string;
  recommended_eta_minutes: number;
  additional_wait_minutes: number;
  recommended_occupancy_level: "LOW" | "MEDIUM";
}
export interface Eta {
  route_id: string;
  stop_id: string;
  label: string;
  arrivals: Arrival[];
  suggestion: AlternativeSuggestion | null;
}
export interface Occupancy {
  route_id: string;
  occupancy_level: Level;
  recent_report_count: number;
  distinct_reporter_count: number;
  high_percentage: number;
  last_report_at: string | null;
  confidence_level: ConfidenceLevel;
  confidence_reason: string;
  simulated: boolean;
}
export interface Overview {
  active_routes: number;
  active_buses: number;
  recent_reports: number;
  high_routes: number;
  active_alerts: number;
  updated_at: string;
  simulated_gps: boolean;
}
export interface OperatorRoute extends Route, Occupancy {
  active_buses: number;
  detection_state: string;
  alert_status: string | null;
}
export interface Report {
  id: number;
  route_id: string;
  bus_id: string | null;
  occupancy_level: Level;
  created_at: string;
  is_demo: boolean;
}
export interface Alert {
  id: number;
  route_id: string;
  message: string;
  recommendation: string;
  explanation: string;
  duration_seconds: number;
  recent_report_count: number;
  high_percentage: number;
  status: string;
  is_demo: boolean;
  created_at: string;
}

export type PlannedActionCode =
  "RESERVE_BUS" | "CONTACT_DISPATCH" | "MONITOR_ROUTE" | "REVIEW_REPORTS";
export interface OperatorAction {
  id: number;
  alert_id: number;
  action_code: PlannedActionCode;
  planned_action: string;
  created_at: string;
  is_demo: boolean;
}

export interface DemoFrame {
  minute: number;
  at: string;
  new_reports: number;
  total_demo_reports: number;
  recent_report_count: number;
  independent_reporter_count: number;
  high_percentage: number;
  occupancy_level: Level;
  detection_state: "NORMAL" | "HIGH_PENDING" | "HIGH_CONFIRMED";
  sustained_minutes: number;
  alert_created: boolean;
}
export interface DemoResult {
  simulated: boolean;
  route_id: string;
  transitions: string[];
  report_count: number;
  alert: Alert | null;
  timeline: DemoFrame[];
}
