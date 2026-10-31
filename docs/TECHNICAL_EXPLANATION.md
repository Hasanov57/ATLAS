# Technical explanation

## Problem and solution

Passengers often lack reliable bus arrival and crowding information. BakuTransit AI demonstrates a shared passenger and operator view without depending on an official transit feed. A GPS simulator and crowdsourced reports make the end-to-end workflow reproducible locally.

## Algorithms

- **GPS:** Each bus has a distance along a cached OSM-derived drivable road path, a heading and a speed. Every server tick converts elapsed time to meters and advances along adjacent road vertices. The browser interpolates between server positions on that same path, with reduced-motion support and no off-road jump.
- **GPS freshness:** A position older than 30 seconds is stale. Its ETA is null in the API, the UI warns clearly, and alternative advice is withheld if any compared position is stale.
- **ETA:** Use the remaining cached road-path distance to the chosen demo stop, including wraparound, then compute ceil(distance / speed × 60). Haversine measures the short path edges. Missing geometry or zero speed yields no ETA and an explicit reason.
- **Alternative bus:** Consider only the first approaching bus when it has evidence-backed HIGH crowding. Recommend a later bus on the same route only if its bus-specific crowding is LOW or MEDIUM and both GPS records are fresh.
- **Confidence:** Fewer than three distinct latest votes, or no report within two minutes, is insufficient. Five distinct votes with a report in the last minute give high confidence; other valid evidence gives medium confidence. Counts and last timestamps are exposed.
- **Crowding:** Query reports in a 600-second window, retain the latest vote per anonymous reporter, require three distinct reporters, and classify HIGH at 60%. Evidence older than 120 seconds is treated as stale.
- **Anomaly:** Persist state and `high_since`. Re-evaluate periodically. Only 600 continuous seconds of fresh HIGH confirms an incident and creates an idempotent alert with evidence, severity, duration and an operator recommendation.
- **Operator plan history:** A protected endpoint records one of four planned responses against an unresolved alert with a naive UTC timestamp. Demo reset removes demo plans only. This never represents dispatch.
- **Historical demo:** Write four HIGH votes at each of 16 historical minute marks, evaluate at each mark, and return each minute of the resulting timeline for the one-click presentation. The alert is never inserted directly by the demo endpoint.

## Verification and future work

Backend tests exercise API routes, stop order, cached road geometry, coordinate order and bounds, bus motion, road-distance ETA, official CSV parsing, safe SQLite column migration, validation/cooldown, aggregation, evidence freshness, alert timing, replay, reset, acknowledgment and dashboard counts. The frontend TypeScript production build verifies the client bundle. The official IDDA CSV supplies stop coordinates only; its records stay independent of demo route membership. A production system should ingest verified route geometry and realtime feeds, model traffic, add authenticated operators, stronger anti-abuse controls, monitoring and multi-worker coordination.
