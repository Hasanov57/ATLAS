import { Component, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Passenger } from "./pages/Passenger";
import { Operator } from "./pages/Operator";
class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("ATLAS ekran xətası", error);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="app-error-recovery">
          <h1>Tətbiq yüklənmədi</h1>
          <p>Səhifəni yeniləyərək yenidən cəhd edin.</p>
          <button onClick={() => window.location.reload()}>Yenilə</button>
        </main>
      );
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    const preventPageSelectAll = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a")
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable], [role='textbox']")
      )
        return;
      event.preventDefault();
    };
    document.addEventListener("keydown", preventPageSelectAll);
    return () => document.removeEventListener("keydown", preventPageSelectAll);
  }, []);
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Passenger />} />
          <Route path="/operator" element={<Operator />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
