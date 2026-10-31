import { useEffect, useMemo, useRef, useState } from "react";
import type { Bus, RouteGeometry } from "../types";
import { roadModel, roadPosition, roadTurn } from "../services/roadAnimation";

export function useRoadAnimatedBuses(
  buses: Bus[],
  geometries: RouteGeometry[],
): Bus[] {
  const models = useMemo(
    () =>
      new Map(
        geometries.map((geometry) => [
          geometry.route_id + ":" + geometry.direction_id,
          roadModel(geometry),
        ]),
      ),
    [geometries],
  );
  const [displayed, setDisplayed] = useState(buses);
  const displayedRef = useRef(buses);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const previous = new Map(displayedRef.current.map((bus) => [bus.id, bus]));
    if (reducedMotion) {
      displayedRef.current = buses;
      setDisplayed(buses);
      return;
    }
    let request = 0;
    const started = performance.now();
    const render = (now: number) => {
      const fraction = Math.min(1, (now - started) / 3500);
      const next = buses.map((bus) => {
        const old = previous.get(bus.id);
        const model = models.get(bus.route_id + ":" + bus.direction_id);
        if (
          !old ||
          !model ||
          bus.distance_along_route_m === null ||
          old.distance_along_route_m === null
        )
          return bus;
        const forward =
          (bus.distance_along_route_m -
            old.distance_along_route_m +
            model.length) %
          model.length;
        if (forward > 500) return bus; // Reset or discontinuity: do not animate across the map.
        const progress =
          (old.distance_along_route_m + forward * fraction) % model.length;
        return {
          ...bus,
          ...roadPosition(model, progress),
          turn_direction: roadTurn(model, progress),
          distance_along_route_m: progress,
        };
      });
      displayedRef.current = next;
      setDisplayed(next);
      if (fraction < 1) request = window.requestAnimationFrame(render);
    };
    request = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(request);
  }, [buses, models]);

  return displayed;
}
