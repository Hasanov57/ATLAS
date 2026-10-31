import { useEffect, useMemo, useState } from "react";
import { Focus, LocateFixed, MapPin, Minus, Plus } from "lucide-react";
import { latLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Bus, RouteGeometry, Stop } from "../types";
import { labels, time } from "./Shared";
import { busIcon } from "./NetworkMap";
import { useRoadAnimatedBuses } from "../hooks/useRoadAnimatedBuses";
import { usePolling } from "../hooks/usePolling";
import { api } from "../services/api";
import { FloatingMapButton } from "./Buttons";
import "leaflet/dist/leaflet.css";

function RouteCamera({ stops }: { stops: Stop[] }) {
  const map = useMap();
  const stopKey = stops.map((stop) => stop.id).join(",");
  useEffect(() => {
    if (stops.length) {
      map.fitBounds(
        latLngBounds(
          stops.map(
            (stop) => [stop.latitude, stop.longitude] as [number, number],
          ),
        ),
        { padding: [48, 48], maxZoom: 14 },
      );
    }
  }, [map, stopKey]);
  return null;
}

type OfficialBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

function OfficialMapViewport({
  onChange,
}: {
  onChange: (bounds: OfficialBounds) => void;
}) {
  const map = useMapEvents({
    moveend: () => update(),
    zoomend: () => update(),
  });
  const update = () => {
    const bounds = map.getBounds();
    const next = {
      minLat: Math.max(39, Number(bounds.getSouth().toFixed(4))),
      maxLat: Math.min(42, Number(bounds.getNorth().toFixed(4))),
      minLon: Math.max(48, Number(bounds.getWest().toFixed(4))),
      maxLon: Math.min(51.5, Number(bounds.getEast().toFixed(4))),
    };
    if (next.minLat < next.maxLat && next.minLon < next.maxLon) onChange(next);
  };
  useEffect(update, [map]);
  return null;
}

function MapActions({
  stops,
  showOfficial,
  onToggleOfficial,
  userPoint,
  locationMessage,
  onLocate,
}: {
  stops: Stop[];
  showOfficial: boolean;
  onToggleOfficial: () => void;
  userPoint: [number, number] | null;
  locationMessage: string;
  onLocate: () => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (userPoint) map.flyTo(userPoint, 15, { duration: 0.8 });
  }, [map, userPoint]);
  const centerRoute = () => {
    if (stops.length)
      map.fitBounds(
        latLngBounds(
          stops.map(
            (stop) => [stop.latitude, stop.longitude] as [number, number],
          ),
        ),
        { padding: [48, 48], maxZoom: 14 },
      );
  };
  return (
    <>
      <div className="passenger-map-actions">
        <FloatingMapButton
          type="button"
          className={showOfficial ? "active" : ""}
          aria-label={
            showOfficial
              ? "Rəsmi dayanacaqları gizlət"
              : "Rəsmi dayanacaqları göstər"
          }
          aria-pressed={showOfficial}
          onClick={onToggleOfficial}
        >
          <MapPin size={18} />
        </FloatingMapButton>
        <FloatingMapButton
          type="button"
          aria-label="Yerimi göstər"
          onClick={onLocate}
        >
          <LocateFixed size={18} />
        </FloatingMapButton>
        <FloatingMapButton
          type="button"
          aria-label="Marşrutu mərkəzləşdir"
          onClick={centerRoute}
        >
          <Focus size={18} />
        </FloatingMapButton>
        <FloatingMapButton
          type="button"
          aria-label="Xəritəni böyüt"
          onClick={() => map.zoomIn()}
        >
          <Plus size={18} />
        </FloatingMapButton>
        <FloatingMapButton
          type="button"
          aria-label="Xəritəni kiçilt"
          onClick={() => map.zoomOut()}
        >
          <Minus size={18} />
        </FloatingMapButton>
      </div>
      {userPoint && (
        <CircleMarker
          center={userPoint}
          radius={8}
          pathOptions={{
            color: "#fff",
            fillColor: "#0868f9",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Tooltip>Mənim yerim · yalnız bu cihazda göstərilir</Tooltip>
        </CircleMarker>
      )}
      {locationMessage && (
        <div className="map-location-status" role="status">
          {locationMessage}
        </div>
      )}
    </>
  );
}

export function TransitMap({
  stops,
  geometry,
  buses,
  color,
  selectedStopId,
  selectedBusId,
  onSelectBus,
  userPoint,
  locationMessage,
  onLocate,
}: {
  stops: Stop[];
  geometry: RouteGeometry;
  buses: Bus[];
  color: string;

  selectedStopId: string;
  selectedBusId: string;
  onSelectBus: (busId: string) => void;
  userPoint: [number, number] | null;
  locationMessage: string;
  onLocate: () => void;
}) {
  const [showOfficial, setShowOfficial] = useState(true);
  const [viewBounds, setViewBounds] = useState<OfficialBounds | null>(null);
  const official = usePolling(
    () =>
      showOfficial && viewBounds
        ? api.officialStops(viewBounds)
        : Promise.resolve(null),
    [
      showOfficial,
      viewBounds?.minLat,
      viewBounds?.maxLat,
      viewBounds?.minLon,
      viewBounds?.maxLon,
    ],
    60000,
  );
  const geometries = useMemo(() => [geometry], [geometry]);
  const animatedBuses = useRoadAnimatedBuses(buses, geometries);
  const path =
    geometry.geometry?.coordinates.map(
      ([lon, lat]) => [lat, lon] as [number, number],
    ) || [];
  return (
    <div className="passenger-map">
      <MapContainer
        center={[40.374, 49.845]}
        zoom={13}
        zoomControl={false}
        scrollWheelZoom={false}
        className="leaflet-surface"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RouteCamera stops={stops} />
        <OfficialMapViewport
          onChange={(next) =>
            setViewBounds((previous) =>
              previous &&
              Object.keys(next).every(
                (key) =>
                  previous[key as keyof OfficialBounds] ===
                  next[key as keyof OfficialBounds],
              )
                ? previous
                : next,
            )
          }
        />
        <MapActions
          stops={stops}
          showOfficial={showOfficial}
          onToggleOfficial={() => setShowOfficial((value) => !value)}
          userPoint={userPoint}
          locationMessage={locationMessage}
          onLocate={onLocate}
        />
        {!geometry.geometry && (
          <div className="geometry-warning">
            Yol xətti mövcud deyil · ETA göstərilmir.
          </div>
        )}
        {path.length > 1 && (
          <Polyline
            positions={path}
            pathOptions={{ color, weight: 5, opacity: 0.96 }}
          />
        )}
        {showOfficial &&
          official.data?.stops.map((stop) => (
            <CircleMarker
              key={"official-" + stop.id}
              center={[stop.latitude, stop.longitude]}
              radius={3}
              pathOptions={{
                color: "#45688c",
                fillColor: "#fff",
                fillOpacity: 1,
                weight: 1.4,
              }}
            >
              <Tooltip>{stop.name} · rəsmi dayanacaq</Tooltip>
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                Rəsmi dayanacaq · ID: {stop.id}
                <br />
                Bu dayanacağın nümunə marşrutlara aidiyyəti təsdiqlənməyib; ETA
                göstərilmir.
              </Popup>
            </CircleMarker>
          ))}
        {stops.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.latitude, stop.longitude]}
            radius={stop.id === selectedStopId ? 7 : 4.5}
            pathOptions={{
              color: "#fff",
              fillColor: stop.id === selectedStopId ? color : "#fff",
              fillOpacity: 1,
              weight: 2.5,
            }}
          >
            <Tooltip
              permanent={stop.id === selectedStopId}
              direction="top"
              offset={[0, -8]}
            >
              {stop.name}
              {stop.id !== selectedStopId && " · Nümunə dayanacaq"}
            </Tooltip>
          </CircleMarker>
        ))}
        {animatedBuses
          .filter((bus) => bus.position_valid && !!geometry.geometry)
          .map((bus) => (
            <Marker
              key={bus.id}
              position={[bus.latitude, bus.longitude]}
              icon={busIcon(
                bus.occupancy_level,
                bus.id === selectedBusId,
                bus.gps_stale,
                bus.route_id,
                bus.heading_degrees,
                bus.id,
                bus.turn_direction || null,
              )}
              zIndexOffset={bus.id === selectedBusId ? 1000 : 0}
              eventHandlers={{ click: () => onSelectBus(bus.id) }}
            >
              <Popup>
                <strong>{bus.id}</strong>
                <br />
                Marşrut: {bus.route_id}
                <br />
                Sürət: {bus.speed_kmh} km/saat
                <br />
                Sıxlıq: {labels[bus.occupancy_level]}
                <br />
                Son GPS: {time(bus.updated_at)}{" "}
                {bus.gps_stale && "· GPS köhnəlib"}
                <br />
                <small>Simulyasiya məlumatı</small>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
      {showOfficial && (
        <div className="official-layer-note">
          {official.error
            ? "Rəsmi dayanacaqlar yüklənmədi"
            : official.data
              ? official.data.stops.length
                ? `Rəsmi dayanacaqlar: ${official.data.total_in_area} · Marşrut aidiyyəti təsdiqlənməyib`
                : "Rəsmi dayanacaq məlumatı idxal edilməyib"
              : "Rəsmi dayanacaqlar yüklənir…"}
        </div>
      )}
    </div>
  );
}
