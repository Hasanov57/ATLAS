import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  Pause,
  Play,
  RotateCcw,
  UsersRound,
  X,
} from "lucide-react";
import type { DemoResult } from "../types";

const stateLabels = {
  NORMAL: "Normal vəziyyət",
  HIGH_PENDING: "Yüksək sıxlıq izlənir",
  HIGH_CONFIRMED: "Davamlı yüksək sıxlıq təsdiqləndi",
};

export function JudgeDemo({
  result,
  onClose,
}: {
  result: DemoResult;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const frame = result.timeline[index];
  const alertMinute = result.timeline.find(
    (item) => item.alert_created,
  )?.minute;
  const alertVisible =
    !!result.alert && frame.detection_state === "HIGH_CONFIRMED";
  useEffect(() => {
    if (!playing) return;
    if (index >= result.timeline.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setIndex(index + 1), 650);
    return () => window.clearTimeout(timer);
  }, [index, playing, result.timeline.length]);
  useEffect(() => {
    if (alertVisible && stageRef.current)
      stageRef.current.scrollTop = stageRef.current.scrollHeight;
  }, [alertVisible]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="judge-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Münsif demosu"
    >
      <div className="judge-stage" ref={stageRef}>
        <header className="judge-top">
          <div className="judge-brand">
            <span className="judge-app-icon" aria-hidden="true">
              <img src="/atlas-app-icon.png" alt="" />
            </span>
            <div>
              <strong>ATLAS</strong>
              <small>Münsif təqdimatı · tarixi ssenari</small>
            </div>
          </div>
          <button onClick={onClose} aria-label="Təqdimatı bağla">
            <X size={20} />
          </button>
        </header>
        <div className="judge-intro">
          <div>
            <span className="judge-kicker">CANLI QAYDALARLA TARİXİ TƏKRAR</span>
            <h1>Yüksək sıxlıq necə aşkar olunur?</h1>
            <p>
              {result.route_id} marşrutunda sərnişin bildirişlərindən operator
              tövsiyəsinə qədər bütün addımlar göstərilir.
            </p>
          </div>
          <span className="judge-time">Dəqiqə {frame.minute} / 15</span>
        </div>
        <div className="judge-progress" aria-label="Ssenari vaxt xətti">
          {result.timeline.map((item, position) => (
            <button
              key={item.minute}
              aria-label={String(item.minute) + "-ci dəqiqəyə keç"}
              className={position <= index ? "reached" : ""}
              onClick={() => {
                setIndex(position);
                setPlaying(false);
              }}
            />
          ))}
        </div>
        <div className="judge-state">
          <div>
            <span>MARŞRUT VƏZİYYƏTİ</span>
            <h2>{stateLabels[frame.detection_state]}</h2>
            <p>
              {frame.sustained_minutes} dəqiqə davamlı yüksək sıxlıq ·{" "}
              {frame.high_percentage}% yüksək bildiriş
            </p>
          </div>
          <b
            className={
              frame.detection_state === "HIGH_CONFIRMED"
                ? "confirmed"
                : "pending"
            }
          >
            {frame.detection_state === "HIGH_CONFIRMED"
              ? "TƏSDİQLƏNDİ"
              : "İZLƏNİR"}
          </b>
        </div>
        <div className="judge-steps">
          <article className="done">
            <span className="judge-step-icon">
              <UsersRound size={21} />
            </span>
            <small>01 · SƏRNİŞİN SƏSİ</small>
            <h3>Bildirişlər daxil olur</h3>
            <strong>{frame.total_demo_reports}</strong>
            <p>
              Ssenaridə toplanan anonim bildiriş · hər dəqiqə 4 yeni bildiriş
            </p>
          </article>
          <article
            className={frame.independent_reporter_count >= 3 ? "done" : ""}
          >
            <span className="judge-step-icon">
              <Check size={21} />
            </span>
            <small>02 · AQREQASİYA</small>
            <h3>Müstəqil mənbələr</h3>
            <strong>{frame.independent_reporter_count}</strong>
            <p>
              Son 10 dəqiqədə fərqli sərnişin · {frame.recent_report_count}{" "}
              bildiriş
            </p>
          </article>
          <article className={frame.sustained_minutes >= 10 ? "done" : ""}>
            <span className="judge-step-icon">
              <RotateCcw size={21} />
            </span>
            <small>03 · DAVAMLILIQ</small>
            <h3>10 dəqiqə qaydası</h3>
            <strong>{frame.sustained_minutes}/10</strong>
            <p>Yüksək sıxlığın davam etdiyi dəqiqə</p>
          </article>
          <article className={alertVisible ? "done urgent" : ""}>
            <span className="judge-step-icon">
              <Bell size={21} />
            </span>
            <small>04 · AVTOMATİK SİQNAL</small>
            <h3>Xəbərdarlıq</h3>
            <strong>
              {alertVisible
                ? alertMinute === undefined
                  ? "Mövcud"
                  : "Yaradıldı"
                : "Gözlənilir"}
            </strong>
            <p>
              {alertVisible
                ? result.alert?.message
                : "Qaydanın tamamlanması gözlənilir"}
            </p>
          </article>
        </div>
        <div
          className={"judge-recommendation" + (alertVisible ? " visible" : "")}
        >
          <AlertTriangle size={24} />
          <div>
            <small>05 · OPERATOR ÜÇÜN TÖVSİYƏ</small>
            <h3>
              {alertVisible
                ? result.alert?.recommendation
                : "Yüksək sıxlıq təsdiqləndikdə göstəriləcək"}
            </h3>
            <p>
              Bu, planlaşdırma tövsiyəsidir. Avtobus göndərilməsi barədə təsdiq
              yoxdur.
            </p>
          </div>
        </div>
        <footer className="judge-controls">
          <span>
            Tarixi simulyasiya · real bildirişlər və avtobus göndərişi deyil
          </span>
          <div>
            <button
              className="judge-secondary"
              onClick={() => {
                setIndex(0);
                setPlaying(true);
              }}
            >
              <RotateCcw size={16} /> Yenidən oynat
            </button>
            <button
              className="judge-secondary"
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "Dayandır" : "Davam et"}
            </button>
            <button className="judge-primary" onClick={onClose}>
              Operator panelinə qayıt <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
