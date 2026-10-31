import { useEffect, useState } from "react";
export function usePolling<T>(
  load: () => Promise<T>,
  deps: unknown[],
  interval = 5000,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    let live = true;
    const run = async () => {
      try {
        const value = await load();
        if (live) {
          setData(value);
          setError("");
          setUpdated(new Date());
        }
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Məlumat yenilənmədi");
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), interval);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, updated };
}
