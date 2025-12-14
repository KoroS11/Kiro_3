# Phase 1 – Planning and core implementation

Goal
- Build a pipeline-first dashboard that reliably normalizes dates, merges daily orders with historical weather, and produces useful, non-misleading summaries.

Key prompts and decisions (high level)
- Date normalization first: treat date parsing/validation as a gate before any aggregation or visualization.
- Explicit missing-data semantics:
  - Orders: allow dropping rows with missing dates (with warnings).
  - Weather: prefer deterministic imputation from nearest day within a bounded gap.
- Avoid leaking secrets: WeatherAPI key must not be shipped to the browser. Use a server-side dev proxy and local `.env`.

Implementation outline (what was built)
- App scaffolded as Vite + React under `data-weaver/`.
- Data pipeline utilities implemented:
  - CSV parsing with schema/header normalization and numeric coercion.
  - Date normalization to ISO `YYYY-MM-DD` with rejection of ambiguous slash dates.
  - Merge logic using orders as the primary dataset and weather as enrichment with bounded nearest-day imputation.
  - Metrics/KPIs and lightweight SVG charts for trend + comparison + correlation.

Operational fixes captured during development
- Performance: avoid single long-running weather fetch by batching requests and showing progress.
- Reliability: ensure auto-fetched weather rows are normalized (have `date_iso`) before merging.
- Dev ergonomics: fixed port guidance (`--port 5176 --strictPort`) and caching/timeouts for weather requests.

What was accepted vs rejected
Accepted
- Strong input validation and deterministic warnings.
- Server-side proxy approach for WeatherAPI to keep the key out of the frontend.
- Simple, direct visualizations (trend, rainy vs non-rainy comparison, scatter) without implying causality.

Rejected / avoided
- Shipping secrets in frontend bundles.
- Silent coercion of ambiguous dates.
- Overly complex visualization libraries for a small pipeline-first demo.
