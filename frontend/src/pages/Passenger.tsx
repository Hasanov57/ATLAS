import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  AlertTriangle,
  Bell,
  BusFront,
  ChevronDown,
  CircleHelp,
  Copy,
  QrCode,
  Check,
  Home,
  Info,
  Lightbulb,
  ChevronUp,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Search,
  ShieldCheck,
  UsersRound,
  UserRound,
  X,
} from "lucide-react";
import { TransitMap } from "../components/TransitMap";
import { IconButton, PrimaryButton } from "../components/Buttons";
import {
  SkeletonArrivalCard,
  SkeletonMapOverlay,
  SkeletonReportSheet,
} from "../components/Skeleton";
import { Badge, ErrorBox, labels, time } from "../components/Shared";
import { usePolling } from "../hooks/usePolling";
import { api } from "../services/api";
import type { Alert, ConfidenceLevel, Level, Report } from "../types";

const confidenceLabels: Record<ConfidenceLevel, string> = {
  HIGH: "Yüksək",
  MEDIUM: "Orta",
  INSUFFICIENT: "Məlumat yetərsizdir",
};

const referenceSchedule = [
  ["1", "28 May m/st", "Neftçilər m/st", "06:00", "23:59"],
  ["2", "Bakı Avtovağzalı", "Dərnəgül m/st", "05:48", "23:30"],
  ["3", "Badamdar qəs.", "Dərnəgül m/st", "06:00", "23:30"],
  ["4", "Ağ Şəhər", "Montin", "06:30", "22:05"],
  ["5", "Nərimanov m/st", "20-ci Sahə", "05:55", "23:59"],
  ["6", "20-ci Sahə", "Azadlıq m/st", "05:50", "23:30"],
  ["7A", "Bakı Avtovağzalı", "Gəncə pr.", "06:00", "23:30"],
  ["7B", "Yeni Yasamal", "Koroğlu m/st", "06:00", "23:30"],
  ["10", "MİDA", "Ağ Şəhər", "06:00", "23:00"],
  ["11", "S. Rəhimov küç.", "Sadiqcan küç.", "06:00", "23:30"],
] as const;

type SheetMode = "minimized" | "peek" | "expanded";
type DemoLogin = "anonymous" | "mygov" | "sima" | "asan" | "pin";

function clientId() {
  let value = localStorage.getItem("baku-anonymous-id");
  if (!value) {
    value = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem("baku-anonymous-id", value);
  }
  return value;
}

export function Passenger() {
  const [loginTab, setLoginTab] = useState<"qr" | "other">("qr");
  const [demoLogin, setDemoLogin] = useState<DemoLogin | null>(() => {
    try {
      const saved = localStorage.getItem("atlas-demo-login");
      return saved === "anonymous" ||
        saved === "mygov" ||
        saved === "sima" ||
        saved === "asan" ||
        saved === "pin"
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const chooseDemoLogin = (method: DemoLogin) => {
    try {
      localStorage.setItem("atlas-demo-login", method);
    } catch {
      /* private mode */
    }
    setDemoLogin(method);
    setNotice("");
  };
  const loginLabel =
    demoLogin === "mygov"
      ? "mygov ID"
      : demoLogin === "sima"
        ? "SİMA İmza"
        : demoLogin === "asan"
          ? "ASAN İmza"
          : demoLogin === "pin"
            ? "FİN/PİN demo"
            : "Anonim";
  const routes = usePolling(api.routes, []);
  const [routeId, setRouteId] = useState("D1");
  const stops = usePolling(() => api.stops(routeId), [routeId]);
  const geometry = usePolling(() => api.geometry(routeId), [routeId]);
  const buses = usePolling(() => api.buses(routeId), [routeId]);
  const occupancy = usePolling(() => api.occupancy(routeId), [routeId]);
  const simulation = usePolling(api.simulation, []);
  const [stopId, setStopId] = useState("");
  const eta = usePolling(
    () => (stopId ? api.eta(routeId, stopId) : Promise.resolve(null)),
    [routeId, stopId],
  );
  const [busId, setBusId] = useState("");
  const [level, setLevel] = useState<Level>("MEDIUM");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationClosing, setNotificationClosing] = useState(false);
  const [notificationExpanded, setNotificationExpanded] = useState(false);
  const notificationTouchStart = useRef<{
    y: number;
    scrollTop: number;
  } | null>(null);
  const [notificationReady, setNotificationReady] = useState(false);
  const [notificationError, setNotificationError] = useState(false);
  const [notificationItems, setNotificationItems] = useState<
    Array<{
      id: string;
      title: string;
      detail: string;
      created_at: string;
      is_demo: boolean;
      kind: "alert" | "report";
    }>
  >([]);
  const [mapFocus, setMapFocus] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("peek");
  const touchStart = useRef<{ y: number; scrollTop: number } | null>(null);
  const pointerStart = useRef<number | null>(null);
  const lastDragAt = useRef(0);
  const sheetRef = useRef<HTMLElement>(null);
  const appRef = useRef<HTMLElement>(null);
  const [reportReady, setReportReady] = useState(false);
  const [reportClosing, setReportClosing] = useState(false);
  const [recentReports, setRecentReports] = useState<Report[] | null>(null);
  const [recentReportsError, setRecentReportsError] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [userPoint, setUserPoint] = useState<[number, number] | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Cihazın məkan xidməti mövcud deyil.");
      return;
    }
    setLocationMessage("Yer müəyyənləşdirilir…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserPoint([coords.latitude, coords.longitude]);
        setLocationMessage("");
      },
      () => setLocationMessage("Məkan icazəsi verilmədi və ya yer alınmadı."),
      { timeout: 10000, maximumAge: 60000 },
    );
  };
  useEffect(() => {
    requestLocation();
  }, []);
  useEffect(() => {
    if (!locationMessage || locationMessage === "Yer müəyyənləşdirilir…")
      return;
    const timer = window.setTimeout(() => setLocationMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [locationMessage]);

  const currentStops =
    stops.data?.[0]?.route_id === routeId ? stops.data : null;
  const currentBuses =
    buses.data?.[0]?.route_id === routeId ? buses.data : null;
  const currentGeometry =
    geometry.data?.route_id === routeId ? geometry.data : null;
  const currentOccupancy =
    occupancy.data?.route_id === routeId ? occupancy.data : null;
  const currentEta =
    !eta.error && eta.data?.route_id === routeId && eta.data?.stop_id === stopId
      ? eta.data
      : null;

  useEffect(() => {
    setStopId("");
    setBusId("");
    setSheetMode("peek");
  }, [routeId]);
  useEffect(() => {
    if (
      currentStops?.length &&
      !currentStops.some((stop) => stop.id === stopId)
    ) {
      setStopId(
        (routeId === "D1"
          ? currentStops.find((stop) => stop.name === "28 May")
          : null
        )?.id || currentStops[0].id,
      );
    }
  }, [currentStops, stopId, routeId]);

  useEffect(() => {
    const panel = sheetRef.current;
    const app = appRef.current;
    if (!panel || !app) return;
    const syncHeight = () =>
      app.style.setProperty(
        "--sheet-height",
        panel.getBoundingClientRect().height + "px",
      );
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [demoLogin]);

  useEffect(() => {
    if (!notificationOpen) return;
    let active = true;
    setNotificationReady(false);
    setNotificationError(false);
    const fetchAll = Promise.all([api.reports(100), api.alerts()]);
    const timeout = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("Sorğu vaxtı bitdi")), 8000),
    );
    Promise.allSettled([
      Promise.race([fetchAll, timeout]),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1000)),
    ]).then(([result]) => {
      if (!active) return;
      if (result.status === "fulfilled") {
        const [reports, alerts] = result.value as [Report[], Alert[]];
        const items = [
          ...reports.map((report) => ({
            id: `report-${report.id}`,
            title: `${report.route_id} · ${labels[report.occupancy_level]}`,
            detail: report.bus_id
              ? `${report.bus_id} avtobusu üzrə sərnişin bildirişi`
              : "Marşrut üzrə sərnişin bildirişi",
            created_at: report.created_at,
            is_demo: report.is_demo,
            kind: "report" as const,
          })),
          ...alerts.map((alert) => ({
            id: `alert-${alert.id}`,
            title: `${alert.route_id} · Yüksək sıxlıq xəbərdarlığı`,
            detail: alert.message,
            created_at: alert.created_at,
            is_demo: alert.is_demo,
            kind: "alert" as const,
          })),
        ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        setNotificationItems(items);
      } else setNotificationError(true);
      setNotificationReady(true);
    });
    return () => {
      active = false;
    };
  }, [notificationOpen]);
  const closeNotifications = () => {
    if (notificationClosing) return;
    setNotificationClosing(true);
    window.setTimeout(() => {
      setNotificationOpen(false);
      setNotificationExpanded(false);
      setNotificationClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (!reportOpen) return;
    let active = true;
    setReportReady(false);
    setRecentReports(null);
    setRecentReportsError(false);
    const delay = new Promise<void>((resolve) =>
      window.setTimeout(resolve, 1000),
    );
    Promise.allSettled([
      Promise.race([
        api.reports(),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("Sorğu vaxtı bitdi")), 8000),
        ),
      ]),
      delay,
    ]).then(([result]) => {
      if (!active) return;
      if (result.status === "fulfilled") setRecentReports(result.value);
      else setRecentReportsError(true);
      setReportReady(true);
    });
    return () => {
      active = false;
    };
  }, [reportOpen]);

  const closeReport = () => {
    if (reportClosing) return;
    setReportClosing(true);
    window.setTimeout(() => {
      setReportOpen(false);
      setReportClosing(false);
    }, 300);
  };

  const selectedRoute = routes.data?.find((route) => route.id === routeId);
  const selectedStop = currentStops?.find((stop) => stop.id === stopId);
  const nextArrival = currentEta?.arrivals[0];
  const changeSheet = (direction: "up" | "down") => {
    setSheetMode((mode) => {
      if (direction === "up") return mode === "minimized" ? "peek" : "expanded";
      return mode === "expanded" ? "peek" : "minimized";
    });
  };
  const gpsStale =
    !!currentBuses?.some((bus) => bus.gps_stale) ||
    !!currentEta?.arrivals.some((arrival) => arrival.gps_stale);
  const error =
    routes.error ||
    stops.error ||
    geometry.error ||
    buses.error ||
    eta.error ||
    occupancy.error ||
    simulation.error;

  const openReport = () => {
    if (demoLogin === "anonymous") {
      setNotice("Sıxlıq bildirmək üçün demo giriş üsulu seçin.");
      setProfileOpen(true);
      setPickerOpen(false);
      return;
    }
    setProfileOpen(false);
    setPickerOpen(false);
    setNotificationOpen(false);
    setReportOpen(true);
  };

  const submit = async () => {
    setSending(true);
    setNotice("");
    setSubmitError("");
    try {
      await api.report({
        route_id: routeId,
        bus_id: busId || null,
        occupancy_level: level,
        anonymous_reporter_id: clientId(),
      });
      setNotice("Bildiriş qəbul edildi. Təşəkkür edirik!");
      closeReport();
      setMapFocus(false);
    } catch (cause) {
      setSubmitError(
        cause instanceof Error ? cause.message : "Bildiriş göndərilmədi",
      );
    } finally {
      setSending(false);
    }
  };

  if (!demoLogin) {
    return (
      <main className="mygov-demo-page">
        <div className="mygov-demo-wrap">
          <div className="mygov-demo-wordmark" aria-label="mygov ID">
            mygov
            <span />
            ID
          </div>
          <div className="mygov-demo-intro">
            <span className="mygov-demo-symbol">mygov</span>
            <p>
              <b>mygov</b> sisteminə daxil olmaq üçün <b>“mygov ID”</b>-dən
              istifadə edirsiniz.
            </p>
          </div>
          <section className="mygov-demo-card" aria-label="Demo giriş üsulları">
            <div
              className="mygov-demo-tabs"
              role="tablist"
              aria-label="Giriş üsulu"
            >
              <button
                role="tab"
                aria-selected={loginTab === "qr"}
                className={loginTab === "qr" ? "selected" : ""}
                onClick={() => setLoginTab("qr")}
              >
                QR kod
              </button>
              <button
                role="tab"
                aria-selected={loginTab === "other"}
                className={loginTab === "other" ? "selected" : ""}
                onClick={() => setLoginTab("other")}
              >
                Digər üsullar
              </button>
            </div>
            {loginTab === "qr" ? (
              <div className="mygov-demo-qr">
                <div>
                  <h1>
                    <span>mygov</span> mobil tətbiqi ilə giriş edin!
                  </h1>
                  <ol>
                    <li>Tətbiqi açın.</li>
                    <li>QR skan bölməsinə keçin.</li>
                    <li>Demo giriş üçün aşağıdakı düyməni seçin.</li>
                  </ol>
                  <p>QR təsviri yalnız demodur; real hesabla əlaqə yaratmır.</p>
                </div>
                <div className="mygov-demo-qr-placeholder">
                  <QrCode size={80} strokeWidth={1.2} />
                  <small>DEMO QR</small>
                </div>
                <button
                  className="mygov-demo-qr-enter"
                  onClick={() => chooseDemoLogin("mygov")}
                >
                  mygov ilə demo giriş <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <div className="mygov-demo-methods">
                {(
                  [
                    ["SİMA İmza ilə", "sima", "sima.svg"],
                    ["ASAN İmza ilə", "asan", "asan-imza.svg"],
                    [
                      "SİMA Token (Elektron İmza) ilə",
                      "sima",
                      "sima-token.png",
                    ],
                    ["İdentifikasiya nömrəsi ilə", "pin", "identification.png"],
                    ["BSXM Elektron İmza ilə", "pin", "bsxm.png"],
                    [
                      "Xarici vətəndaşlar üçün ziyarətçi hesabı",
                      "pin",
                      "visitor.png",
                    ],
                  ] as const
                ).map(([title, method, mark]) => (
                  <button key={title} onClick={() => chooseDemoLogin(method)}>
                    <span className="mygov-demo-method-mark">
                      <img src={`/auth/${mark}`} alt="" />
                    </span>
                    <strong>{title}</strong>
                    <Info size={18} />
                  </button>
                ))}
              </div>
            )}
          </section>
          <button
            className="mygov-demo-anonymous"
            onClick={() => chooseDemoLogin("anonymous")}
          >
            Anonim davam et <ArrowRight size={16} />
          </button>
          <p className="mygov-demo-notice">
            ATLAS demo ekranı · Rəsmi mygov ID xidməti ilə bağlantı yoxdur.
            Şəxsi məlumat toplanmır. Anonim rejimdə sıxlıq bildirişi
            göndərilmir.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="passenger-shell">
      <main
        ref={appRef}
        className={`passenger-app ${mapFocus ? "is-map-focus" : ""} ${pickerOpen ? "is-picker-open" : ""}`}
      >
        {currentStops && currentBuses && currentGeometry ? (
          <TransitMap
            key={routeId}
            stops={currentStops}
            geometry={currentGeometry}
            buses={currentBuses}
            color={selectedRoute?.color || "#0868f9"}
            selectedStopId={stopId}
            selectedBusId={busId || currentBuses[0]?.id || ""}
            onSelectBus={setBusId}
            userPoint={userPoint}
            locationMessage={locationMessage}
            onLocate={requestLocation}
          />
        ) : geometry.error || routes.error ? (
          <div className="passenger-map-loading" role="alert">
            Xəritə məlumatı alınmadı
          </div>
        ) : (
          <SkeletonMapOverlay />
        )}

        <header className="mobile-header">
          <div className="mobile-brand-new">
            <img src="/atlas-app-icon.png" alt="" />
            <span>ATLAS</span>
          </div>
          <button
            className="mobile-bell"
            aria-label="Bildirişlər"
            onClick={() => {
              setNotificationOpen(true);
              setPickerOpen(false);
              setReportOpen(false);
              setProfileOpen(false);
            }}
          >
            <Bell size={21} />
            {currentOccupancy?.occupancy_level === "HIGH" && <i />}
          </button>
        </header>

        <div className="route-picker">
          <button
            className="route-picker-trigger"
            onClick={() => {
              setPickerOpen((open) => !open);
            }}
            aria-expanded={pickerOpen}
          >
            <Search size={19} />
            <span>
              <b>{routeId}</b> · {selectedStop?.name || "Dayanacaq seçin"}
            </span>
            <ChevronDown size={18} className={pickerOpen ? "rotated" : ""} />
          </button>
          {pickerOpen && (
            <div className="route-picker-panel">
              <p>
                Marşrut seçin <small>Nümunə marşrutlar</small>
              </p>
              <div className="picker-route-list">
                {!routes.data &&
                  !routes.error &&
                  [1, 2, 3].map((item) => (
                    <div
                      className="picker-route-skeleton skeleton-shimmer"
                      key={item}
                      aria-hidden="true"
                    />
                  ))}
                {routes.data?.map((route) => (
                  <button
                    key={route.id}
                    className={route.id === routeId ? "active" : ""}
                    onClick={() => setRouteId(route.id)}
                  >
                    <span style={{ background: route.color }}>{route.id}</span>
                    {route.name.split("—")[1]?.trim()}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="schedule-toggle"
                aria-expanded={scheduleOpen}
                onClick={() => setScheduleOpen((open) => !open)}
              >
                Şəkildəki marşrut cədvəli
                <ChevronDown
                  size={15}
                  className={scheduleOpen ? "rotated" : ""}
                />
              </button>
              {scheduleOpen && (
                <div className="schedule-reference">
                  <small>
                    Göndərilən cədvəldən ilk 10 marşrut · çıxış vaxtları arayış
                    üçündür. Canlı GPS/ETA yalnız yuxarıdakı nümunə
                    marşrutlardadır.
                  </small>
                  {referenceSchedule.map(([number, from, to, first, last]) => (
                    <div className="schedule-reference-row" key={number}>
                      <b>{number}</b>
                      <span>
                        {from} → {to}
                      </span>
                      <time>
                        {first}–{last}
                      </time>
                    </div>
                  ))}
                </div>
              )}
              <label htmlFor="passenger-stop">Dayanacaq</label>
              {!currentStops && !stops.error && (
                <div
                  className="picker-stop-skeleton skeleton-shimmer"
                  aria-hidden="true"
                />
              )}
              <select
                id="passenger-stop"
                value={stopId}
                onChange={(event) => setStopId(event.target.value)}
              >
                {currentStops?.map((stop) => (
                  <option key={stop.id} value={stop.id}>
                    {stop.name}
                  </option>
                ))}
              </select>
              <button
                className="picker-done"
                onClick={() => setPickerOpen(false)}
              >
                Xəritəyə qayıt <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>

        <section
          ref={sheetRef}
          className={"arrival-sheet " + (mapFocus ? "" : sheetMode)}
          onTouchStart={(event) => {
            touchStart.current = {
              y: event.touches[0].clientY,
              scrollTop: sheetRef.current?.scrollTop || 0,
            };
          }}
          onTouchEnd={(event) => {
            if (!touchStart.current || mapFocus) return;
            const distance =
              touchStart.current.y - event.changedTouches[0].clientY;
            const startedAtTop = touchStart.current.scrollTop === 0;
            touchStart.current = null;
            if (distance > 55) {
              lastDragAt.current = Date.now();
              changeSheet("up");
            }
            if (distance < -55 && startedAtTop) {
              lastDragAt.current = Date.now();
              changeSheet("down");
            }
          }}
        >
          <button
            className="sheet-toggle"
            aria-label={
              sheetMode === "expanded"
                ? "Məlumatları yığışdır"
                : "Məlumatları genişləndir"
            }
            aria-expanded={sheetMode === "expanded"}
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") return;
              pointerStart.current = event.clientY;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              if (pointerStart.current === null) return;
              const distance = pointerStart.current - event.clientY;
              pointerStart.current = null;
              if (Math.abs(distance) < 35) return;
              lastDragAt.current = Date.now();
              changeSheet(distance > 0 ? "up" : "down");
            }}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
            onClick={() => {
              if (Date.now() - lastDragAt.current < 300) return;
              setSheetMode((mode) =>
                mode === "expanded"
                  ? "peek"
                  : mode === "peek"
                    ? "expanded"
                    : "peek",
              );
            }}
          >
            <span className="sheet-grabber" />
          </button>
          {!mapFocus && sheetMode === "minimized" ? (
            <div className="sheet-compact">
              <div>
                <small>{selectedStop?.name || "Dayanacaq seçin"}</small>
                <strong>
                  {nextArrival
                    ? nextArrival.bus_id +
                      " · " +
                      (nextArrival.eta_minutes === null
                        ? nextArrival.eta_unavailable_reason === "STALE_GPS"
                          ? "GPS köhnəlib"
                          : "Vaxt yoxdur"
                        : nextArrival.eta_minutes + " dəqiqə")
                    : "Növbəti avtobus"}
                </strong>
              </div>
              <IconButton
                className="sheet-restore"
                aria-label="Paneli böyüt"
                title="Paneli böyüt"
                onClick={() => setSheetMode("peek")}
              >
                <Maximize2 size={18} />
              </IconButton>
            </div>
          ) : mapFocus ? (
            <div className="map-focus-content">
              <div>
                <span className="sheet-eyebrow">CANLI XƏRİTƏ</span>
                <h2>{selectedRoute?.name || routeId}</h2>
              </div>
              <p>
                {currentBuses?.length || 0} simulyasiya avtobusu izlənir · Son
                GPS: {time(currentBuses?.[0]?.updated_at)}
              </p>
              <button onClick={() => setMapFocus(false)}>
                Növbəti avtobuslara bax <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="sheet-heading">
                <div>
                  <span className="sheet-eyebrow">
                    NÜMUNƏ DAYANACAQ · {selectedStop?.name || "—"}
                  </span>
                  <h2>Növbəti avtobus</h2>
                </div>
                <div className="sheet-heading-actions">
                  <button
                    onClick={() => {
                      setPickerOpen(true);
                    }}
                  >
                    Bütün marşrutlar <ArrowRight size={14} />
                  </button>
                  <IconButton
                    className="sheet-minimize"
                    aria-label="Paneli kiçilt"
                    title="Paneli kiçilt"
                    onClick={() => setSheetMode("minimized")}
                  >
                    <Minimize2 size={17} />
                  </IconButton>
                </div>
              </div>
              {error && <ErrorBox text={error} />}
              {gpsStale && (
                <div className="gps-warning" role="alert">
                  <AlertTriangle size={15} /> GPS məlumatı köhnəlib. Həmin
                  avtobusların çatma vaxtı canlı deyil.
                </div>
              )}
              {currentEta?.arrivals?.length && !eta.error ? (
                <div className="mobile-arrivals">
                  {currentEta.arrivals.map((arrival) => (
                    <button
                      className={`mobile-arrival ${arrival.gps_stale ? "stale" : ""}`}
                      key={arrival.bus_id}
                      onClick={() => {
                        setBusId(arrival.bus_id);
                        openReport();
                      }}
                    >
                      <span className="arrival-icon">
                        <BusFront size={24} strokeWidth={2.4} />
                      </span>
                      <span className="arrival-details">
                        <b>{arrival.bus_id}</b>
                        <small>{selectedStop?.name} istiqaməti</small>
                      </span>
                      <strong>
                        {arrival.eta_minutes === null
                          ? "GPS köhnəlib"
                          : `${arrival.eta_minutes} dəqiqə`}
                      </strong>
                      <Badge level={arrival.occupancy_level} />
                    </button>
                  ))}
                </div>
              ) : !eta.data && !eta.error ? (
                <SkeletonArrivalCard />
              ) : (
                <div className="mobile-empty">
                  {eta.error
                    ? "Çatma vaxtı yenilənmədi"
                    : "Avtobus məlumatı yoxdur"}
                </div>
              )}
              <button
                className="confidence-summary"
                onClick={() =>
                  setSheetMode((mode) =>
                    mode === "expanded" ? "peek" : "expanded",
                  )
                }
                aria-expanded={sheetMode === "expanded"}
              >
                <ShieldCheck size={15} />
                <span>
                  <b>
                    Etibar:{" "}
                    {
                      confidenceLabels[
                        currentOccupancy?.confidence_level || "INSUFFICIENT"
                      ]
                    }
                  </b>{" "}
                  · {currentOccupancy?.distinct_reporter_count || 0} müstəqil
                  bildiriş · Son: {time(currentOccupancy?.last_report_at)}
                </span>
                {sheetMode === "expanded" ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              {sheetMode === "expanded" && (
                <div className="confidence-detail">
                  <p>
                    {currentOccupancy?.confidence_reason ||
                      "Bildiriş məlumatı yüklənir."}
                  </p>
                  <strong>Avtobuslar üzrə sübut</strong>
                  {currentEta?.arrivals.map((arrival) => (
                    <div key={arrival.bus_id}>
                      <b>{arrival.bus_id}</b>
                      <span>
                        {confidenceLabels[arrival.confidence_level]} ·{" "}
                        {arrival.independent_report_count} müstəqil bildiriş ·
                        Son: {time(arrival.last_report_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {!gpsStale && currentEta?.suggestion && (
                <div className="alternative-card" role="status">
                  <Lightbulb size={17} />
                  <div>
                    <strong>Daha rahat avtobus</strong>
                    <p>
                      {currentEta.suggestion.overcrowded_bus_id} sıxdır.{" "}
                      {currentEta.suggestion.recommended_bus_id}{" "}
                      {currentEta.suggestion.recommended_eta_minutes} dəqiqəyə
                      gəlir ·{" "}
                      {labels[
                        currentEta.suggestion.recommended_occupancy_level
                      ].toLowerCase()}
                      . Əlavə gözləmə:{" "}
                      {currentEta.suggestion.additional_wait_minutes} dəqiqə.
                    </p>
                  </div>
                </div>
              )}
              <PrimaryButton className="crowd-button" onClick={openReport}>
                <UsersRound size={20} /> Sıxlıq bildir
              </PrimaryButton>
              {notice && (
                <p role="status" className="passenger-success">
                  {notice}
                </p>
              )}
              <p className="simulation-note">
                <Info size={14} />{" "}
                {gpsStale || eta.error
                  ? "GPS yenilənməyib · Çatma vaxtı canlı deyil"
                  : "Simulyasiya əsasında təxmini vaxt"}
              </p>
            </>
          )}
        </section>

        <nav className="passenger-nav" aria-label="Əsas naviqasiya">
          <button
            className={!mapFocus && !reportOpen && !profileOpen ? "active" : ""}
            onClick={() => {
              setMapFocus(false);
              setPickerOpen(false);
              setNotificationOpen(false);
              setReportOpen(false);
              setProfileOpen(false);
            }}
          >
            <Home size={21} />
            <span>Ana</span>
          </button>
          <button
            className={mapFocus ? "active" : ""}
            onClick={() => {
              setMapFocus(true);
              setPickerOpen(false);
              setNotificationOpen(false);
              setReportOpen(false);
              setProfileOpen(false);
            }}
          >
            <MapIcon size={21} />
            <span>Xəritə</span>
          </button>
          <button
            className={reportOpen ? "active" : ""}
            onClick={() => {
              openReport();
            }}
          >
            <Bell size={21} />
            <span>Bildir</span>
          </button>
          <button
            className={profileOpen ? "active" : ""}
            onClick={() => {
              setProfileOpen(true);
              setCopyStatus("idle");
              setPickerOpen(false);
              setNotificationOpen(false);
              setReportOpen(false);
            }}
          >
            <UserRound size={21} />
            <span>Profil</span>
          </button>
        </nav>

        {notificationOpen && (
          <div
            className={`modal-layer notification-layer ${notificationClosing ? "is-closing" : ""}`}
          >
            <button
              className="modal-scrim"
              aria-label="Bildirişləri bağla"
              onClick={closeNotifications}
            />
            <section
              className={`passenger-modal notification-modal ${notificationExpanded ? "is-expanded" : ""}`}
              onTouchStart={(event) => {
                notificationTouchStart.current = {
                  y: event.touches[0].clientY,
                  scrollTop: event.currentTarget.scrollTop,
                };
              }}
              onTouchEnd={(event) => {
                const start = notificationTouchStart.current;
                notificationTouchStart.current = null;
                if (!start) return;
                const delta = start.y - event.changedTouches[0].clientY;
                if (delta > 55) setNotificationExpanded(true);
                else if (delta < -65 && start.scrollTop < 3) {
                  if (notificationExpanded) setNotificationExpanded(false);
                  else closeNotifications();
                }
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Bütün bildirişlər"
            >
              <button
                type="button"
                className="notification-drag-handle"
                aria-label={
                  notificationExpanded
                    ? "Bildiriş panelini kiçilt"
                    : "Bildiriş panelini genişləndir"
                }
                onClick={() => setNotificationExpanded((value) => !value)}
              >
                <span />
              </button>
              <div className="modal-head">
                <div>
                  <span className="sheet-eyebrow">SON MƏLUMATLAR</span>
                  <h2>Bütün bildirişlər</h2>
                </div>
                <button aria-label="Bağla" onClick={closeNotifications}>
                  <X size={19} />
                </button>
              </div>
              {!notificationReady ? (
                <div
                  className="notification-skeleton"
                  role="status"
                  aria-label="Bildirişlər yüklənir"
                >
                  {[0, 1, 2, 3].map((n) => (
                    <div className="notification-skeleton-row" key={n}>
                      <span className="skeleton-line" />
                      <span className="skeleton-line" />
                    </div>
                  ))}
                </div>
              ) : notificationError ? (
                <div className="mobile-empty">
                  Bildirişlər yüklənmədi. Yenidən açıb cəhd edin.
                </div>
              ) : notificationItems.length ? (
                <div className="notification-list">
                  {notificationItems.map((item) => (
                    <article className="notification-item" key={item.id}>
                      <span className={`notification-kind ${item.kind}`}>
                        <Bell size={16} />
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        <small>
                          {item.is_demo ? "Demo · " : ""}
                          {time(item.created_at)}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mobile-empty">Hələ bildiriş yoxdur.</div>
              )}
              <p className="notification-disclaimer">
                Son 100 sərnişin bildirişi və bütün xəbərdarlıqlar · simulyasiya
                məlumatı
              </p>
            </section>
          </div>
        )}

        {reportOpen && (
          <div
            className={
              "modal-layer report-layer " + (reportClosing ? "is-closing" : "")
            }
          >
            <button
              className="modal-scrim"
              aria-label="Bildir ekranını bağla"
              onClick={closeReport}
            />
            <section
              className="passenger-modal report-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Sıxlıq bildir"
            >
              <div className="modal-head">
                <div>
                  <span className="sheet-eyebrow">ANONİM BİLDİRİŞ</span>
                  <h2>Sıxlıq bildir</h2>
                </div>
                <button aria-label="Bağla" onClick={closeReport}>
                  <X size={19} />
                </button>
              </div>
              {!reportReady ? (
                <SkeletonReportSheet />
              ) : (
                <div className="report-form-content">
                  <p className="modal-copy">
                    Gördüyünüz avtobusun sıxlıq səviyyəsini seçin. Bildiriş
                    marşrutun vəziyyətini dəqiqləşdirir.
                  </p>
                  <div className="report-levels">
                    {(["LOW", "MEDIUM", "HIGH"] as Level[]).map((item) => (
                      <button
                        key={item}
                        className={`report-level report-level-${item.toLowerCase()} ${level === item ? "active" : ""}`}
                        onClick={() => setLevel(item)}
                      >
                        <UsersRound size={19} />
                        <span>{labels[item]}</span>
                      </button>
                    ))}
                  </div>
                  <label htmlFor="report-bus">Avtobus (istəyə bağlı)</label>
                  <select
                    id="report-bus"
                    value={busId}
                    onChange={(event) => setBusId(event.target.value)}
                  >
                    <option value="">Avtobus məlum deyil</option>
                    {currentBuses?.map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.id}
                      </option>
                    ))}
                  </select>
                  <PrimaryButton
                    className="crowd-button"
                    onClick={submit}
                    disabled={sending}
                  >
                    {sending ? "Göndərilir…" : "Bildirişi göndər"}{" "}
                    <ArrowRight size={17} />
                  </PrimaryButton>
                  {submitError && <ErrorBox text={submitError} />}
                  <div className="report-recent">
                    <div className="report-recent-head">
                      <strong>Son bildirişlər</strong>
                      <small>Anonim · son məlumatlar</small>
                    </div>
                    {recentReportsError ? (
                      <p>
                        Son bildirişlər yüklənmədi. Öz bildirişinizi göndərə
                        bilərsiniz.
                      </p>
                    ) : (recentReports || [])
                        .filter((report) => report.route_id === routeId)
                        .slice(0, 3).length ? (
                      (recentReports || [])
                        .filter((report) => report.route_id === routeId)
                        .slice(0, 3)
                        .map((report) => (
                          <div className="report-recent-row" key={report.id}>
                            <span
                              className={
                                "report-recent-dot report-recent-dot-" +
                                report.occupancy_level.toLowerCase()
                              }
                            />
                            <span>
                              {report.bus_id || routeId} ·{" "}
                              {labels[report.occupancy_level]}
                            </span>
                            <small>
                              {report.is_demo ? "Demo" : "Sərnişin"} ·{" "}
                              {time(report.created_at)}
                            </small>
                          </div>
                        ))
                    ) : (
                      <p>Bu marşrut üzrə son bildiriş yoxdur.</p>
                    )}
                  </div>
                </div>
              )}
              <p className="modal-privacy">
                <ShieldCheck size={15} /> Ad, telefon və şəxsi yer məlumatı
                toplanmır.
              </p>
            </section>
          </div>
        )}

        {profileOpen && (
          <div className="modal-layer">
            <button
              className="modal-scrim"
              aria-label="Profil ekranını bağla"
              onClick={() => setProfileOpen(false)}
            />
            <section
              className="passenger-modal profile-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Profil"
            >
              <div className="modal-head">
                <div>
                  <span className="sheet-eyebrow">SƏRNİŞİN MƏLUMATI</span>
                  <h2>
                    {demoLogin === "anonymous"
                      ? "Anonim profil"
                      : "Demo profil"}
                  </h2>
                </div>
                <button
                  aria-label="Bağla"
                  onClick={() => setProfileOpen(false)}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="profile-icon">
                <UserRound size={25} />
              </div>
              <p>
                {demoLogin === "anonymous"
                  ? "Anonim rejimdə sıxlıq bildirişi göndərilmir."
                  : "Bildirişləriniz demo giriş üsulu və anonim cihaz kodu ilə göndərilir. Dövlət hesabı məlumatı alınmır."}
              </p>
              <div className="profile-login-method">
                <span>Giriş üsulu</span>
                <strong>{loginLabel} · demo</strong>
              </div>
              <button
                className="profile-switch-login"
                onClick={() => {
                  setProfileOpen(false);
                  setReportOpen(false);
                  setDemoLogin(null);
                  try {
                    localStorage.removeItem("atlas-demo-login");
                  } catch {
                    /* private mode */
                  }
                }}
              >
                Giriş üsulunu dəyiş
              </button>
              <div className="profile-code">
                <span>Bu cihazın anonim kodu</span>
                <div className="profile-code-value">
                  <b>{clientId().slice(0, 8)}…</b>
                  <button
                    type="button"
                    aria-label="Anonim kodu kopyala"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(clientId());
                        setCopyStatus("copied");
                      } catch {
                        setCopyStatus("error");
                      }
                    }}
                  >
                    {copyStatus === "copied" ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copyStatus === "copied" ? "Kopyalandı" : "Kopyala"}
                  </button>
                </div>
              </div>
              {copyStatus === "error" && (
                <p role="alert" className="profile-copy-error">
                  Kod kopyalanmadı. Brauzerin pano icazəsini yoxlayın.
                </p>
              )}
              <Link to="/operator" className="profile-operator">
                İdarəetmə paneli <ArrowRight size={16} />
              </Link>
              <p className="modal-privacy">
                <CircleHelp size={15} /> Marşrutlar və GPS məlumatları
                simulyasiyadır.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
