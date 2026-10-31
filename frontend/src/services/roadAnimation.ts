import type { RouteGeometry } from "../types";

export interface RoadModel {
  points: [number, number][];
  cumulative: number[];
  length: number;
}

const meters = (a: [number, number], b: [number, number]) => {
  const radians = Math.PI / 180;
  const lat1 = a[1] * radians;
  const lat2 = b[1] * radians;
  const deltaLat = (b[1] - a[1]) * radians;
  const deltaLon = (b[0] - a[0]) * radians;
  const half =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(half)));
};

export function roadModel(geometry: RouteGeometry): RoadModel | null {
  const points = geometry.geometry?.coordinates;
  if (!points || points.length < 2) return null;
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + meters(points[i - 1], points[i]));
  return { points, cumulative, length: cumulative[cumulative.length - 1] };
}

export function roadPosition(model: RoadModel, progress: number) {
  const distance = ((progress % model.length) + model.length) % model.length;
  let low = 0;
  let high = model.cumulative.length - 2;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (model.cumulative[mid] <= distance) low = mid;
    else high = mid - 1;
  }
  const fraction =
    (distance - model.cumulative[low]) /
    (model.cumulative[low + 1] - model.cumulative[low]);
  const a = model.points[low];
  const b = model.points[low + 1];
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const lonDelta = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(lonDelta) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lonDelta);
  return {
    longitude: a[0] + (b[0] - a[0]) * fraction,
    latitude: a[1] + (b[1] - a[1]) * fraction,
    heading_degrees: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
  };
}

export function roadTurn(
  model: RoadModel,
  progress: number,
): "left" | "right" | null {
  if (model.length <= 0) return null;
  const current = roadPosition(model, progress).heading_degrees;
  const ahead = roadPosition(model, progress + 55).heading_degrees;
  const delta = ((ahead - current + 540) % 360) - 180;
  if (delta >= 40) return "right";
  if (delta <= -40) return "left";
  return null;
}
