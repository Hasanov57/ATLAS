import { Fragment, useEffect, useMemo } from "react";
import { Focus, Minus, Plus } from "lucide-react";
import { divIcon, latLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Bus, Level, RouteGeometry, Stop } from "../types";
import { labels, time } from "./Shared";
import { useRoadAnimatedBuses } from "../hooks/useRoadAnimatedBuses";
import "leaflet/dist/leaflet.css";

const busSvg =
  '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2.5" width="14" height="17" rx="3"/><path d="M7.5 6h9v6h-9zM8 19.5v2m8-2v2"/><circle cx="8.5" cy="16" r="0.7" fill="white" stroke="none"/><circle cx="15.5" cy="16" r="0.7" fill="white" stroke="none"/></svg>';

export function busIcon(
  level: Level,
  selected = false,
  stale = false,
  routeId = "",
  _headingDegrees: number | null = null,
  busId = "",
  turnDirection: "left" | "right" | null = null,
) {
  const safeRoute = routeId.replace(/[^A-Za-z0-9]/g, "");
  const safeBus = busId.replace(/[^A-Za-z0-9-]/g, "");
  const label = safeBus ? safeBus.replace("-", "·") : safeRoute;
  const palette = [
    "#175CD3",
    "#22577A",
    "#1C7A74",
    "#6B4FA3",
    "#9C5C2A",
    "#9D4666",
  ];
  const match = /^D([1-3])-0([1-2])$/.exec(safeBus);
  const paletteIndex = match
    ? (Number(match[1]) - 1) * 2 + Number(match[2]) - 1
    : Array.from(safeBus).reduce(
        (value, char) => value + char.charCodeAt(0),
        0,
      ) % palette.length;
  const color = palette[paletteIndex];
  const turnSvg =
    turnDirection === "left"
      ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 15V9a5 5 0 0 0-5-5H4"/><path d="M7 1 4 4l3 3"/></svg>'
      : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15V9a5 5 0 0 1 5-5h7"/><path d="m13 1 3 3-3 3"/></svg>';
  return divIcon({
    className: "bus-pin-wrap",
    html: `<span class="bus-pin ${selected ? "bus-pin-selected" : ""} ${stale ? "bus-pin-stale" : ""}" style="--bus-color:${color}">${turnDirection ? `<span class="bus-turn bus-turn-${turnDirection}" aria-hidden="true">${turnSvg}</span>` : ""}<span class="bus-pin-status bus-pin-status-${level.toLowerCase()}"></span><span class="bus-pin-direction">${busSvg}</span><span class="bus-pin-route">${label}</span></span>`,
    iconSize: [44, 54],
    iconAnchor: [22, 52],
    popupAnchor: [0, -48],
  });
}

export interface MapRoute {
  id: string;
  color: string;
  stops: Stop[];
  geometry: RouteGeometry | null;
}

const pointsFor = (route: MapRoute): [number, number][] =>
  route.geometry?.geometry?.coordinates.map(([lon, lat]) => [lat, lon]) ||
  route.stops.map((stop) => [stop.latitude, stop.longitude]);

function FitNetwork({ routes }: { routes: MapRoute[] }) {
  const map = useMap();
  const key = routes
    .map(
      (route) =>
        route.geometry?.geometry?.coordinates.length ||
        route.stops.map((stop) => stop.id).join(","),
    )
    .join("|");
  useEffect(() => {
    const points = routes.flatMap(pointsFor);
    if (points.length)
      map.fitBounds(latLngBounds(points), { padding: [24, 24], maxZoom: 12 });
  }, [key, map]);
  return null;
}

function MapTools({ routes }: { routes: MapRoute[] }) {
  const map = useMap();
  const fit = () => {
    const points = routes.flatMap(pointsFor);
    if (points.length)
      map.fitBounds(latLngBounds(points), { padding: [24, 24], maxZoom: 12 });
  };
  return (
    <div className="network-map-tools">
      <button type="button" aria-label="Marşrutları mərkəzləşdir" onClick={fit}>
        <Focus size={15} />
      </button>
      <button
        type="button"
        aria-label="Xəritəni böyüt"
        onClick={() => map.zoomIn()}
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        aria-label="Xəritəni kiçilt"
        onClick={() => map.zoomOut()}
      >
        <Minus size={16} />
      </button>
    </div>
  );
}

export function NetworkMap({
  routes,
  buses,
  selectedRoute,
}: {
  routes: MapRoute[];
  buses: Bus[];
  selectedRoute: string;
}) {
  const visibleRoutes = useMemo(
    () =>
      selectedRoute === "ALL"
        ? routes
        : routes.filter((route) => route.id === selectedRoute),
    [routes, selectedRoute],
  );
  const visibleBuses =
    selectedRoute === "ALL"
      ? buses
      : buses.filter((bus) => bus.route_id === selectedRoute);
  const geometries = useMemo(
    () =>
      visibleRoutes
        .map((route) => route.geometry)
        .filter((geometry): geometry is RouteGeometry => geometry !== null),
    [visibleRoutes],
  );
  const animatedBuses = useRoadAnimatedBuses(visibleBuses, geometries);
  return (
    <div className="network-map">
      <MapContainer
        center={[40.384, 49.858]}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom={false}
        className="leaflet-surface"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitNetwork routes={visibleRoutes} />
        <MapTools routes={visibleRoutes} />
        {visibleRoutes.some((route) => !route.geometry?.geometry) && (
          <div className="geometry-warning">
            Bəzi marşrutların yol xətti mövcud deyil.
          </div>
        )}
        {visibleRoutes.map((route) => {
          const points =
            route.geometry?.geometry?.coordinates.map(
              ([lon, lat]) => [lat, lon] as [number, number],
            ) || [];
          return (
            <Fragment key={route.id}>
              {points.length > 1 && (
                <Polyline
                  positions={points}
                  pathOptions={{ color: route.color, weight: 4, opacity: 0.88 }}
                />
              )}
              {route.stops.map((stop) => (
                <CircleMarker
                  key={stop.id}
                  center={[stop.latitude, stop.longitude]}
                  radius={4.5}
                  pathOptions={{
                    color: route.color,
                    fillColor: "#fff",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Tooltip>
                    {route.id} · {stop.name}
                  </Tooltip>
                </CircleMarker>
              ))}
            </Fragment>
          );
        })}
        {animatedBuses
          .filter(
            (bus) =>
              bus.position_valid &&
              visibleRoutes.some(
                (route) =>
                  route.id === bus.route_id && route.geometry?.geometry,
              ),
          )
          .map((bus) => (
            <Marker
              key={bus.id}
              position={[bus.latitude, bus.longitude]}
              icon={busIcon(
                bus.occupancy_level,
                false,
                bus.gps_stale,
                bus.route_id,
                bus.heading_degrees,
                bus.id,
                bus.turn_direction || null,
              )}
            >
              <Popup>
                <strong>{bus.id}</strong>
                <br />
                Marşrut: {bus.route_id}
                <br />
                Sıxlıq: {labels[bus.occupancy_level]}
                <br />
                Sürət: {bus.speed_kmh} km/saat
                <br />
                Son GPS: {time(bus.updated_at)}{" "}
                {bus.gps_stale && "· GPS köhnəlib"}
                <br />
                <small>GPS simulyasiyası</small>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
