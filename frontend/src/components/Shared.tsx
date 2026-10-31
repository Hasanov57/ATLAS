import type { Level } from "../types";
export const labels: Record<Level, string> = {
  LOW: "Az sıxlıq",
  MEDIUM: "Orta sıxlıq",
  HIGH: "Yüksək sıxlıq",
  UNKNOWN: "Məlumat yoxdur",
};
export function Badge({ level }: { level: Level }) {
  return (
    <span className={`badge badge-${level.toLowerCase()}`}>
      <span className="badge-dot" /> {labels[level]}
    </span>
  );
}
export function time(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("az-AZ", {
        timeZone: "Asia/Baku",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(value))
    : "—";
}
export function ErrorBox({ text }: { text: string }) {
  return (
    <div role="alert" className="error-box">
      {text}
    </div>
  );
}
