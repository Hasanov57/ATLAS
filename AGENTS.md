# ATLAS guide
- Keep shared transit state in FastAPI/SQLite; React renders API data.
- Store naive UTC timestamps in SQLite; serialize with Z and render in Asia/Baku.
- Keep GPS, ETA, analytics and alerts deterministic. Demo replay uses production rules.
- Backend: `cd backend; python -m uvicorn app.main:app --reload --port 8000`
- Frontend: `cd frontend; npm install; npm run dev -- --host 0.0.0.0`
- Verify: `cd backend; python -m pytest -q`; `cd frontend; npm run build`.
- Format frontend code with `cd frontend; npm run format`.
- Do not commit secrets, databases, environments or generated assets.
