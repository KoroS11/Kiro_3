# The Data Weaver - Project Blueprint

This document is the authoritative blueprint for the Data Weaver project.

Goals
- Robust CSV ingestion and validation
- Deterministic date normalization before any analysis
- Safe merging with explicit missing-data semantics
- Reproducible metrics and pre-aggregations for charts
- Production-friendly failure modes and debugging checkpoints

Non-goals (for MVP)
- Backend persistence
- User authentication
- Advanced forecast modeling


## 1) Repository Structure

Proposed structure:

```
data-weaver/
├── public/
│   └── sample-data/
│       ├── orders.csv
│       └── weather.csv
├── src/
│   ├── components/
│   │   ├── DataLoader.jsx
│   │   ├── KPICard.jsx
│   │   └── charts/
│   │       ├── OrdersChart.jsx
│   │       ├── WeatherImpactChart.jsx
│   │       └── TempScatterChart.jsx
│   ├── utils/
│   │   ├── csvParser.js
│   │   ├── dateNormalizer.js
│   │   ├── dataMerger.js
│   │   └── metricsCalculator.js
│   ├── App.jsx
│   └── main.jsx
└── package.json
```


## 2) Data Contracts

These are the minimum contracts. CSV headers can vary, but must map to these canonical fields.

### 2.1 Orders CSV Contract

Required columns (aliases accepted):
- date: header must include one of [date]
- total_orders: header must include one of [order_count, total_orders]

Minimum rows
- At least 7 distinct dates after normalization

Recommended columns
- hour (if available): enables hourly internal processing
- location/store_id (if multi-store): optional future extension

Canonical normalized row shape
- date_iso: string (YYYY-MM-DD)
- total_orders: number
- hour: number | null

Example

```
date,total_orders
2024-01-01,245
2024-01-02,312
```


### 2.2 Weather CSV Contract

Required columns (aliases accepted):
- date: header must include one of [date]
- temperature_c: header must include one of [temperature, temp]
- rainfall_mm: header must include one of [rainfall, precipitation]

Minimum rows
- At least 7 distinct dates after normalization

Optional columns
- humidity_pct
- rain_duration_minutes (if present, can support richer rain definition)

Canonical normalized row shape
- date_iso: string (YYYY-MM-DD)
- temperature_c: number
- rainfall_mm: number
- humidity_pct: number | null
- rain_duration_minutes: number | null

Example

```
date,temperature,rainfall,humidity
2024-01-01,22.5,0,65
2024-01-02,18.3,5.2,82
```


## 3) CSV Loading State Machine

All CSV ingestion flows through the same state machine. This prevents silent failures and makes the UI predictable.

States
1. LOADING
   - Show spinner
2. VALIDATING
   - Verify headers
   - Detect delimiter (comma, semicolon, tab)
   - Enforce minimum rows and required columns
   - Validate basic types (numeric columns must parse as finite numbers)
   - Detect encoding anomalies when possible
3. TRANSFORMING
   - Normalize headers and row shapes
   - Normalize dates to ISO strings
4. READY
   - Enable dashboard
5. ERROR
   - Provide an actionable message
   - Provide recovery options (re-upload, download sample, open troubleshooting)


## 4) Date Normalization Strategy

Date normalization must happen before merges, aggregations, and chart formatting.

### 4.1 Accepted inputs
- YYYY-MM-DD
- DD/MM/YYYY
- MM/DD/YYYY
- ISO timestamps (YYYY-MM-DDTHH:mm:ssZ) are accepted but will be truncated to date in a chosen timezone policy.

### 4.2 Timezone policy
- Default: treat date-only strings as local calendar dates (no timezone shift).
- For timestamps: convert to local date before truncation.

If your datasets span multiple timezones, do not guess. Require an explicit dataset timezone setting.

### 4.3 Format detection and ambiguity
- The format detector must reject ambiguous values when both day and month are <= 12 and there is no disambiguation rule.
- A file with mixed formats must fail validation with a clear error.

### 4.4 Output
- Persist normalized dates as ISO date strings: YYYY-MM-DD
- Keep original raw date string for debugging


## 5) Missing Data Semantics and Merge Rules

A date row must exist in the merged dataset only if it has orders.

Completeness Matrix
- A: orders present and weather present -> keep
- B: orders present and weather missing -> keep, impute weather
- C: orders missing and weather present -> drop
- D: both missing -> drop

Imputation rules (weather)
- Nearest-day imputation using +/- 1 day preference
- If both sides are available, choose the closest by absolute day distance
- If equidistant, prefer previous day (deterministic)
- If no neighbor within a configured maximum gap (default 3 days), mark as not imputable and drop row with a warning

This preserves interpretability: missing orders are not treated as zero.


## 6) Classification Rules

### 6.1 Rain classification (MVP)
- is_rainy = rainfall_mm > 1
- is_non_rainy = rainfall_mm <= 1

Keep the threshold as a constant so it can be changed later.

### 6.2 Temperature buckets (percentile-based)
Compute over the merged dataset (after imputation and dropping rows):
- cold: temperature < p25
- moderate: p25 <= temperature <= p75
- hot: temperature > p75

The percentile approach adapts to local climate and seasonality.


## 7) Aggregation Hierarchy

Internal processing order
1. Hourly (if data supports it)
2. Daily (primary UI)
3. Weekly (trend)
4. Day-of-week (pattern)

Implementation note
- Always compute from the most granular available dataset to avoid double-aggregation errors.


## 8) KPIs and Chart Contracts

### 8.1 KPIs (minimum)
- totalOrders
- avgOrdersPerDay
- rainyDayAvg
- nonRainyDayAvg
- percentIncrease

Percent increase definition
- percentIncrease = (rainyDayAvg - nonRainyDayAvg) / nonRainyDayAvg
- If nonRainyDayAvg == 0, return null and display "not available"

### 8.2 Chart datasets
- ordersOverTime: [{ date_iso, total_orders, is_rainy }]
- weatherImpact: { rainyAvg, nonRainyAvg, percentDifference }
- tempCorrelation: [{ date_iso, temperature_c, total_orders, is_rainy }]


## 9) Testing Checklist

### 9.1 Date formats
- DD/MM/YYYY
- MM/DD/YYYY
- YYYY-MM-DD
- Mixed formats within file -> must error
- Leap year dates (2024-02-29)
- Invalid dates (2024-13-01, 31/02/2024)

### 9.2 Missing data
- Complete data
- Missing weather on scattered days -> impute
- Missing weather consecutive days > max gap -> warn and drop
- Missing orders days -> must not appear in merged output

### 9.3 Edge conditions
- Single day dataset -> warn and disable advanced charts
- Minimum rows threshold enforcement
- Extremely high values -> numeric parsing should still work


## 10) Launch Checklist

- All charts render with sample data
- CSV upload works with different delimiters
- Clear error messages for missing headers and bad dates
- Loading state and validation state visible
- No console errors during happy path
- Debug checkpoint: merged dataset logged once before metrics calculation
- README (or Quick Start) explains how to run
- Sample CSVs included
