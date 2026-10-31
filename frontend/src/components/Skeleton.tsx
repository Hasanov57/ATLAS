export function SkeletonText({ width = "100%" }: { width?: string }) {
  return (
    <span className="skeleton-line" style={{ width }} aria-hidden="true" />
  );
}

export const SkeletonLine = SkeletonText;

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-label="Məlumat yüklənir" role="status">
      <SkeletonText width="40%" />
      <SkeletonText width="80%" />
      <SkeletonText width="65%" />
    </div>
  );
}

export function SkeletonRow({ columns = 6 }: { columns?: number }) {
  return (
    <tr aria-label="Marşrut yüklənir">
      {Array.from({ length: columns }, (_, cell) => (
        <td key={cell}>
          <SkeletonText width={cell === 0 ? "55%" : "75%"} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonRouteTable() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <SkeletonRow key={index} />
      ))}
    </>
  );
}

export function SkeletonArrivalCard() {
  return (
    <div
      className="skeleton-arrival"
      role="status"
      aria-label="Avtobus məlumatı yüklənir"
    >
      <span className="skeleton-arrival-icon" />
      <span className="skeleton-arrival-copy">
        <SkeletonText width="70%" />
        <SkeletonText width="95%" />
      </span>
      <SkeletonText width="74px" />
    </div>
  );
}

export function SkeletonMapOverlay() {
  return (
    <div
      className="passenger-map-loading skeleton-map-overlay"
      role="status"
      aria-label="Xəritə yüklənir"
    >
      <SkeletonText width="160px" />
      <SkeletonText width="100px" />
    </div>
  );
}

export function SkeletonReportSheet() {
  return (
    <div
      className="report-sheet-skeleton"
      role="status"
      aria-label="Bildirişlər yüklənir"
    >
      <SkeletonText width="86%" />
      <div className="report-skeleton-options">
        {[0, 1, 2].map((item) => (
          <span key={item} />
        ))}
      </div>
      <SkeletonText width="36%" />
      <SkeletonText width="100%" />
      <SkeletonText width="100%" />
      <div className="report-skeleton-list">
        <SkeletonText width="38%" />
        {[0, 1, 2].map((item) => (
          <SkeletonText key={item} width="100%" />
        ))}
      </div>
    </div>
  );
}
