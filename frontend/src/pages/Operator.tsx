import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BusFront,
  Check,
  ChevronDown,
  Clock3,
  FlaskConical,
  LayoutDashboard,
  Play,
  RotateCcw,
  Search,
  Square,
  UsersRound,
  X,
} from "lucide-react";
import { NetworkMap } from "../components/NetworkMap";
import {
  DestructiveButton,
  IconButton,
  PrimaryButton,
} from "../components/Buttons";
import {
  SkeletonCard,
  SkeletonLine,
  SkeletonRouteTable,
} from "../components/Skeleton";
import { JudgeDemo } from "../components/JudgeDemo";
import { Badge, ErrorBox, time } from "../components/Shared";
import { usePolling } from "../hooks/usePolling";
import { api } from "../services/api";
import type { DemoResult, Level, PlannedActionCode } from "../types";

const routeIds = ["D1", "D2", "D3"];
const detectionLabels: Record<string, string> = {
  NORMAL: "Normal",
  HIGH_PENDING: "Yüksək sıxlıq izlənir",
  HIGH_CONFIRMED: "Yüksək sıxlıq təsdiqləndi",
  ACTIVE: "Aktiv",
  ACKNOWLEDGED: "Təsdiqlənib",
  RESOLVED: "Həll olunub",
};
const plannedOptions: { code: PlannedActionCode; title: string }[] = [
  { code: "RESERVE_BUS", title: "Əlavə avtobus ehtiyatını planlaşdır" },
  { code: "CONTACT_DISPATCH", title: "Dispetçerlə əlaqəni planlaşdır" },
  { code: "MONITOR_ROUTE", title: "Marşrutu yaxından izləməyi planlaşdır" },
  { code: "REVIEW_REPORTS", title: "Bildirişləri yoxlamağı planlaşdır" },
];
const hour = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("az-AZ", {
        timeZone: "Asia/Baku",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
const relativeAge = (value: string) => {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 1
    ? "İndi"
    : minutes < 60
      ? `${minutes} dəq əvvəl`
      : `${Math.floor(minutes / 60)} saat əvvəl`;
};

export function Operator() {
  const [revision, setRevision] = useState(0);
  const overview = usePolling(api.overview, [revision]);
  const routes = usePolling(api.operatorRoutes, [revision]);
  const reports = usePolling(api.reports, [revision]);
  const alerts = usePolling(api.alerts, [revision]);
  const actions = usePolling(api.actions, [revision]);
  const simulation = usePolling(api.simulation, [revision]);
  const buses = usePolling(
    () => Promise.all(routeIds.map(api.buses)).then((groups) => groups.flat()),
    [revision],
  );
  const stopGroups = usePolling(
    () => Promise.all(routeIds.map(api.stops)),
    [revision],
  );
  const geometries = usePolling(api.geometries, [revision]);
  const [query, setQuery] = useState("");
  const [mapRoute, setMapRoute] = useState("ALL");
  const [filter, setFilter] = useState<Level | "ALL">("ALL");
  const [showAllReports, setShowAllReports] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [actionChoices, setActionChoices] = useState<
    Record<number, PlannedActionCode>
  >({});
  const [demoOptions, setDemoOptions] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [activeNav, setActiveNav] = useState("overview");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [key, setKey] = useState(
    sessionStorage.getItem("operator-key") || "local-demo-key",
  );

  const refresh = () => setRevision((current) => current + 1);
  const action = async (path: string, label: string) => {
    setBusy(path);
    setError("");
    setMessage("");
    try {
      sessionStorage.setItem("operator-key", key);
      const result = await api.mutate(path);
      if (path === "/demo/high-crowding" && result.timeline)
        setDemoResult(result as DemoResult);
      setMessage(
        path === "/demo/high-crowding"
          ? `Ssenari tamamlandı: ${result.transitions?.map((state: string) => detectionLabels[state] || state).join(" → ")}. ${result.alert ? "Xəbərdarlıq yaradıldı." : "Xəbərdarlıq yaradılmadı."}`
          : label,
      );
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Əməliyyat alınmadı");
    } finally {
      setBusy("");
    }
  };

  const savePlan = async (alertId: number) => {
    setBusy(`plan-${alertId}`);
    setError("");
    setMessage("");
    try {
      sessionStorage.setItem("operator-key", key);
      await api.recordAction(alertId, actionChoices[alertId] || "RESERVE_BUS");
      setMessage(
        "Planlaşdırılan tədbir tarixçəyə yazıldı. Avtobus göndərilməyib.",
      );
      refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Plan yadda saxlanmadı",
      );
    } finally {
      setBusy("");
    }
  };

  const matching = (value: string) =>
    value
      .toLocaleLowerCase("az-AZ")
      .includes(query.trim().toLocaleLowerCase("az-AZ"));
  const matchingRoute = (id: string) => {
    const route = routes.data?.find((item) => item.id === id);
    const index = routeIds.indexOf(id);
    const stopNames =
      stopGroups.data?.[index]?.map((stop) => stop.name).join(" ") || "";
    const busNames =
      buses.data
        ?.filter((bus) => bus.route_id === id)
        .map((bus) => bus.id)
        .join(" ") || "";
    return matching(
      id + " " + (route?.name || "") + " " + stopNames + " " + busNames,
    );
  };
  const visibleRoutes =
    routes.data?.filter(
      (route) =>
        (filter === "ALL" || route.occupancy_level === filter) &&
        (!query || matchingRoute(route.id)),
    ) || [];
  const visibleReports =
    reports.data?.filter(
      (report) =>
        !query ||
        matching(
          report.route_id +
            " " +
            (report.bus_id || "") +
            " " +
            report.occupancy_level,
        ) ||
        matchingRoute(report.route_id),
    ) || [];
  const visibleAlerts = (
    alerts.data?.filter(
      (alert) =>
        !query ||
        matching(alert.route_id + " " + alert.message) ||
        matchingRoute(alert.route_id),
    ) || []
  ).sort(
    (a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"),
  );
  const priorityAlerts = showAllAlerts
    ? visibleAlerts
    : visibleAlerts.filter((alert) => alert.status === "ACTIVE");
  const mapRoutes = routeIds
    .map((id, index) => ({
      id,
      color:
        routes.data?.find((route) => route.id === id)?.color ||
        ["#1769f6", "#08a66a", "#8b5cf6"][index],
      stops: stopGroups.data?.[index] || [],
      geometry: geometries.data?.find((item) => item.route_id === id) || null,
    }))
    .filter((route) => !query || matchingRoute(route.id));
  const staleBusCount = buses.data?.filter((bus) => bus.gps_stale).length || 0;
  const activeAlerts =
    alerts.data?.filter((alert) => alert.status === "ACTIVE").length || 0;
  const tiles = [
    {
      title: "Aktiv marşrutlar",
      value: overview.data?.active_routes,
      icon: Activity,
      tone: "blue",
    },
    {
      title: "Aktiv avtobuslar",
      value: overview.data?.active_buses,
      icon: BusFront,
      tone: "indigo",
    },
    {
      title: "Son 10 dəqiqəlik bildirişlər",
      value: overview.data?.recent_reports,
      icon: UsersRound,
      tone: "teal",
    },
    {
      title: "Aktiv xəbərdarlıqlar",
      value: overview.data?.active_alerts,
      icon: Bell,
      tone: "amber",
    },
  ];
  const navigation = [
    { id: "overview", title: "İdarəetmə paneli", icon: LayoutDashboard },
    { id: "routes", title: "Marşrutlar", icon: BusFront },
    {
      id: "alerts",
      title: "Xəbərdarlıqlar",
      icon: AlertTriangle,
      count: activeAlerts,
    },
    { id: "demo", title: "Demo rejimi", icon: FlaskConical },
  ];
  const dataError =
    overview.error ||
    routes.error ||
    reports.error ||
    alerts.error ||
    actions.error ||
    buses.error ||
    stopGroups.error ||
    geometries.error;

  return (
    <div className="operator-shell">
      <aside className="operator-sidebar">
        <div className="operator-logo">
          <span className="operator-app-icon" aria-hidden="true">
            <img src="/atlas-app-icon.png" alt="" />
          </span>
          <div>
            <strong>ATLAS</strong>
            <small>Şəhər mobilliyi</small>
          </div>
        </div>
        <nav aria-label="Operator naviqasiyası">
          {navigation.map(({ id, title, icon: Icon, count }) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeNav === id ? "selected" : ""}
              onClick={() => setActiveNav(id)}
            >
              <Icon size={18} />
              <span>{title}</span>
              {!!count && <b>{count}</b>}
            </a>
          ))}
        </nav>
        <div className="operator-sidebar-foot">
          <div className="system-card">
            <div>
              <i className={simulation.data?.running ? "system-on" : ""} />
              <strong>
                Sistem {simulation.data?.running ? "aktivdir" : "dayandırılıb"}
              </strong>
            </div>
            <small>Son yenilənmə</small>
            <span>{time(overview.data?.updated_at)}</span>
            <p>
              <Activity size={15} /> GPS simulyasiyası{" "}
              {simulation.data?.running ? "aktivdir" : "dayandırılıb"}
            </p>
          </div>
          <Link to="/">
            <ArrowRight size={15} /> Sərnişin ekranı
          </Link>
        </div>
      </aside>

      <main className="operator-main">
        <header className="operator-topbar">
          <label className="operator-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Marşrut, avtobus və ya dayanacaq axtarın..."
              aria-label="Axtarış"
            />
            {query && (
              <button
                aria-label="Axtarışı təmizlə"
                onClick={() => setQuery("")}
              >
                <X size={15} />
              </button>
            )}
          </label>
          <div className="operator-top-actions">
            <a
              href="#alerts"
              onClick={() => setActiveNav("alerts")}
              aria-label="Xəbərdarlıqlar"
            >
              <Bell size={19} />
              {activeAlerts > 0 && <i />}
            </a>
            <span className="operator-avatar">OA</span>
            <span>Operator</span>
          </div>
        </header>
        {dataError && <ErrorBox text={dataError} />}
        {staleBusCount > 0 && (
          <div className="operator-gps-warning" role="alert">
            <AlertTriangle size={16} /> {staleBusCount} avtobusun GPS məlumatı
            köhnəlib. Həmin ETA-lar canlı hesab edilmir.
          </div>
        )}
        <section id="overview" className="overview-section">
          <div className="operator-title-row">
            <div>
              <h1>Ümumi mənzərə</h1>
              <p>Bütün marşrutların canlı vəziyyəti və əsas göstəricilər</p>
            </div>
            <span className="period-select">
              <Clock3 size={15} /> Son 10 dəqiqə
            </span>
          </div>
          <div className="operator-kpis">
            {tiles.map(({ title, value, icon: Icon, tone }) => (
              <div className={`operator-kpi ${tone}`} key={title}>
                <Icon size={19} />
                <span>{title}</span>
                <strong>{value ?? <SkeletonLine width="60%" />}</strong>
              </div>
            ))}
          </div>
        </section>

        <div className="operator-grid">
          <section id="alerts" className="operator-panel alerts-panel">
            <div className="panel-head">
              <h2>Yüksək prioritetli xəbərdarlıqlar</h2>
              <button
                className="panel-link"
                onClick={() => setShowAllAlerts((value) => !value)}
              >
                {showAllAlerts ? "Tarixçəni gizlət" : "Tarixçəni göstər"}{" "}
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="alert-list">
              {!alerts.data && !alerts.error ? (
                <SkeletonCard />
              ) : priorityAlerts.length ? (
                priorityAlerts
                  .slice(0, showAllAlerts ? undefined : 2)
                  .map((alert) => (
                    <article
                      className={`operator-alert ${alert.status.toLowerCase()}`}
                      key={alert.id}
                    >
                      <AlertTriangle size={18} />
                      <div>
                        <div className="alert-heading">
                          <strong>{alert.message}</strong>
                          <small>{relativeAge(alert.created_at)}</small>
                        </div>
                        <p>{alert.explanation}</p>
                        <span>
                          <BusFront size={14} /> {alert.recommendation}
                        </span>
                        <div className="alert-actions">
                          <small>
                            {alert.route_id} · {time(alert.created_at)}{" "}
                            {alert.is_demo && "· Demo"}
                          </small>
                          {alert.status === "ACTIVE" && (
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                action(
                                  `/operator/alerts/${alert.id}/acknowledge`,
                                  "Xəbərdarlıq təsdiqləndi",
                                )
                              }
                            >
                              <Check size={14} /> Təsdiqlə
                            </button>
                          )}
                        </div>
                        {alert.status !== "RESOLVED" && (
                          <div className="planned-action-form">
                            <label htmlFor={`plan-${alert.id}`}>
                              Planlaşdırılan tədbir
                            </label>
                            <div>
                              <select
                                id={`plan-${alert.id}`}
                                value={actionChoices[alert.id] || "RESERVE_BUS"}
                                onChange={(event) =>
                                  setActionChoices((current) => ({
                                    ...current,
                                    [alert.id]: event.target
                                      .value as PlannedActionCode,
                                  }))
                                }
                              >
                                {plannedOptions.map((option) => (
                                  <option key={option.code} value={option.code}>
                                    {option.title}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={!!busy}
                                onClick={() => savePlan(alert.id)}
                              >
                                Planı qeyd et
                              </button>
                            </div>
                          </div>
                        )}
                        {(
                          actions.data?.filter(
                            (item) => item.alert_id === alert.id,
                          ) || []
                        ).map((item) => (
                          <div className="planned-action-history" key={item.id}>
                            <Clock3 size={12} />
                            <span>
                              {item.planned_action} · {time(item.created_at)} ·
                              Yalnız plan
                            </span>
                          </div>
                        ))}
                      </div>
                      <b>
                        {alert.status === "ACTIVE"
                          ? "Aktiv"
                          : alert.status === "ACKNOWLEDGED"
                            ? "Təsdiqlənib"
                            : "Həll olunub"}
                      </b>
                    </article>
                  ))
              ) : (
                <div className="operator-empty">
                  <Check size={16} /> Hazırda aktiv yüksək prioritetli
                  xəbərdarlıq yoxdur.
                </div>
              )}
            </div>
          </section>
          <section id="routes" className="operator-panel route-panel">
            <div className="panel-head">
              <h2>Marşrutların vəziyyəti</h2>
              <label className="panel-select narrow">
                <select
                  aria-label="Sıxlıq süzgəci"
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as Level | "ALL")
                  }
                >
                  <option value="ALL">Hamısı</option>
                  <option value="LOW">Az</option>
                  <option value="MEDIUM">Orta</option>
                  <option value="HIGH">Yüksək</option>
                  <option value="UNKNOWN">Məlum deyil</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <div className="operator-table-scroll">
              <table className="operator-table">
                <thead>
                  <tr>
                    <th>Marşrut</th>
                    <th>Aktiv avtobuslar</th>
                    <th>Son bildirişlər</th>
                    <th>Sıxlıq vəziyyəti</th>
                    <th>Yenilənmə</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!routes.data && !routes.error && <SkeletonRouteTable />}
                  {visibleRoutes.map((route) => (
                    <tr key={route.id}>
                      <td>
                        <span
                          className={`route-text route-text-${route.id.toLowerCase()}`}
                        >
                          {route.id}
                        </span>
                      </td>
                      <td>{route.active_buses}</td>
                      <td>{route.recent_report_count}</td>
                      <td>
                        <Badge level={route.occupancy_level} />
                      </td>
                      <td>
                        {route.last_report_at
                          ? relativeAge(route.last_report_at)
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`status-dot ${route.alert_status === "ACTIVE" ? "red" : "green"}`}
                          title={
                            detectionLabels[
                              route.alert_status || route.detection_state
                            ] || "İzlənir"
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!!routes.data && !visibleRoutes.length && (
                <div className="operator-empty">Marşrut tapılmadı.</div>
              )}
            </div>
          </section>

          <section id="map" className="operator-panel map-panel">
            <div className="panel-head">
              <h2>Canlı xəritə</h2>
              <label className="panel-select">
                <select
                  value={mapRoute}
                  onChange={(event) => setMapRoute(event.target.value)}
                  aria-label="Xəritə marşrutu"
                >
                  <option value="ALL">Bütün marşrutlar</option>
                  {routes.data?.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.id}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <NetworkMap
              routes={mapRoutes}
              buses={buses.data || []}
              selectedRoute={query ? "ALL" : mapRoute}
            />
            <div className="map-legend">
              <span>
                <i className="low" /> Az sıxlıq
              </span>
              <span>
                <i className="medium" /> Orta sıxlıq
              </span>
              <span>
                <i className="high" /> Yüksək sıxlıq
              </span>
              <span>
                <i className="unknown" /> Məlumat yoxdur
              </span>
            </div>
          </section>

          <section id="reports" className="operator-panel reports-panel">
            <div className="panel-head">
              <h2>Son bildirişlər</h2>
              <button
                className="panel-link"
                onClick={() => setShowAllReports((value) => !value)}
              >
                {showAllReports ? "Yığışdır" : "Hamısına bax"}{" "}
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="operator-table-scroll">
              <table className="operator-table">
                <thead>
                  <tr>
                    <th>Vaxt</th>
                    <th>Marşrut</th>
                    <th>Avtobus</th>
                    <th>Sıxlıq</th>
                    <th>Mənbə</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReports
                    .slice(0, showAllReports ? undefined : 6)
                    .map((report) => (
                      <tr key={report.id}>
                        <td>{hour(report.created_at)}</td>
                        <td>
                          <span
                            className={`route-id route-${report.route_id.toLowerCase()}`}
                          >
                            {report.route_id}
                          </span>
                        </td>
                        <td>{report.bus_id || "—"}</td>
                        <td>
                          <Badge level={report.occupancy_level} />
                        </td>
                        <td>{report.is_demo ? "Demo" : "İstifadəçi"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!visibleReports.length && (
                <div className="operator-empty">Bildiriş tapılmadı.</div>
              )}
            </div>
          </section>
        </div>

        <section id="demo" className="operator-demo">
          <FlaskConical size={25} />
          <div className="demo-copy">
            <h2>Demo rejimi</h2>
            <p>
              Test ssenariləri ilə sistemi sınayın. 10 dəqiqəlik yüksək sıxlıq
              ssenarisini sürətli şəkildə işə salın.
            </p>
          </div>
          <div className="demo-main-actions">
            <PrimaryButton
              className="demo-primary"
              disabled={!!busy}
              onClick={() =>
                action("/demo/high-crowding", "Ssenari tamamlandı")
              }
            >
              <Play size={15} /> Yüksək sıxlıq ssenarisini başlat
            </PrimaryButton>
            <DestructiveButton
              className="demo-reset"
              disabled={!!busy}
              onClick={() =>
                action("/demo/reset", "Demo məlumatları sıfırlandı")
              }
            >
              <RotateCcw size={15} /> Demo məlumatlarını sıfırla
            </DestructiveButton>
            <IconButton
              className="demo-more"
              aria-label="Əlavə demo seçimləri"
              aria-expanded={demoOptions}
              onClick={() => setDemoOptions((value) => !value)}
            >
              <ChevronDown size={17} />
            </IconButton>
          </div>
          {demoOptions && (
            <div className="demo-extra">
              <label>
                Operator açarı
                <input
                  type="password"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                />
              </label>
              <button
                disabled={!!busy}
                onClick={() =>
                  action(
                    simulation.data?.running
                      ? "/demo/simulation/stop"
                      : "/demo/simulation/start",
                    "GPS simulyasiyası yeniləndi",
                  )
                }
              >
                {simulation.data?.running ? (
                  <Square size={15} />
                ) : (
                  <Play size={15} />
                )}
                {simulation.data?.running ? "GPS dayandır" : "GPS başlat"}
              </button>
              <button
                disabled={!!busy}
                onClick={() =>
                  action(
                    "/demo/simulation/reset",
                    "Avtobus mövqeləri sıfırlandı",
                  )
                }
              >
                <RotateCcw size={15} /> GPS sıfırla
              </button>
            </div>
          )}
        </section>
        {(message || error) && (
          <div className="operator-feedback">
            {message && (
              <p role="status">
                <Check size={16} /> {message}
              </p>
            )}
            {error && <ErrorBox text={error} />}
          </div>
        )}
        <footer className="operator-footer">
          ATLAS · Simulyasiya əsasında qərar dəstəyi ·{" "}
          {time(overview.data?.updated_at)}
        </footer>
      </main>
      {demoResult && (
        <JudgeDemo result={demoResult} onClose={() => setDemoResult(null)} />
      )}
    </div>
  );
}
