# The Data Weaver - Implementation Guide

This guide is step-by-step and designed to prevent breakage by enforcing sequencing.


## 0) Core Principle

Do not visualize until the data pipeline is proven correct.

The required order is:
1. Load and validate CSVs
2. Normalize dates
3. Merge with explicit missing data rules
4. Compute metrics and aggregations
5. Format chart datasets
6. Render UI


## 1) Phase 1: Data Pipeline (Non-Visual)

### 1.1 Implement csvParser.js

Responsibilities
- Accept file content as string
- Detect delimiter among [',', ';', '\t']
- Parse header row
- Produce rows as objects keyed by raw header
- Trim whitespace
- Preserve empty cells as null (not zero)

Validation outputs
- ok: boolean
- data: parsed rows if ok
- warnings: string[]
- error: { code, message, details? } if not ok

Header mapping
- Normalize header tokens: lowercase, trim, replace spaces with underscore
- Map aliases to canonical names

Minimum required validations
- File is non-empty
- Header row exists
- Row count >= 7

Delimiter detection
- Prefer the delimiter that yields the most columns consistently across the first N lines


### 1.2 Implement dateNormalizer.js

Responsibilities
- Accept an array of rows and a key for date
- Detect per-value format
- Normalize to ISO date string YYYY-MM-DD
- Reject ambiguous values
- Reject mixed formats within a file
- Return normalized rows with:
  - date_raw
  - date_iso

Format detection strategy
- If matches /^\d{4}-\d{2}-\d{2}$/ => ISO date
- If matches /^\d{2}\/\d{2}\/\d{4}$/ => ambiguous; disambiguate only when day > 12 or month > 12
- If matches ISO timestamp => parse and truncate based on timezone policy

Gap detection
- After normalization, sort dates and identify missing days in the range
- Return gaps as warnings


### 1.3 Implement dataMerger.js

Inputs
- normalizedOrders: rows with date_iso and total_orders
- normalizedWeather: rows with date_iso and weather fields

Rules
- Build a full date range from min to max orders date
- Keep only dates that have orders (drop any date without orders)
- Join weather by date_iso
- For orders dates missing weather -> impute nearest day weather
- If weather cannot be imputed within max gap (default 3 days) -> drop that orders row and warn

Determinism requirements
- Imputation must be deterministic for equal distance: prefer previous day

Outputs
- merged rows containing:
  - date_iso
  - total_orders
  - temperature_c
  - rainfall_mm
  - imputed_weather: boolean

Checkpoint
- After merging and before metrics: log merged rows count, sample rows, warnings


### 1.4 Implement metricsCalculator.js

Responsibilities
- Add derived fields per day:
  - is_rainy (rainfall_mm > 1)
  - day_of_week (0-6 or string label)
  - temp_category via percentiles (cold/moderate/hot)
- Compute KPIs
- Compute aggregations

Percentiles
- Calculate percentiles over temperature values in merged data
- Use a stable percentile method (nearest-rank or linear interpolation) and document it

Moving average
- Implement 7-day moving average over daily orders
- Do not compute moving average for datasets shorter than window length; return nulls or skip

Edge cases
- If nonRainyDayAvg == 0 => percentIncrease is null
- If there are no rainy days or no non-rainy days => corresponding averages are null


## 2) Phase 2: State Architecture (React)

State shape (baseline)

```
{
  rawOrders: [],
  rawWeather: [],
  mergedData: [],
  kpis: {
    totalOrders: 0,
    avgOrdersPerDay: 0,
    rainyDayAvg: null,
    nonRainyDayAvg: null,
    percentIncrease: null
  },
  loading: false,
  error: null,
  viewMode: 'daily',
  chartData: {
    ordersOverTime: null,
    weatherImpact: null,
    tempCorrelation: null
  }
}
```

Guidelines
- Keep raw and processed separate
- Never compute derived data inside render; compute once after pipeline completes
- Store pipeline warnings separately from errors so the UI can show non-blocking warnings


## 3) Phase 3: Component Build Order (Bottom-Up)

1. DataLoader.jsx
   - Handles upload and pipeline orchestration
   - Emits { rawOrders, rawWeather, mergedData, kpis, chartData, warnings }

2. KPICard.jsx
   - Presentational only
   - No data parsing inside

3. Chart shell components
   - Layout only initially

4. Wire pipeline to KPIs
   - Validate numbers against sample data

5. Wire pipeline to charts

6. Add viewMode toggle
   - daily, weekly, day-of-week

7. Add error boundaries and loading states


## 4) UI Failure Modes and Recovery

Error codes to standardize
- FILE_NOT_SELECTED
- FILE_READ_FAILED
- CSV_EMPTY
- CSV_INVALID_HEADER
- CSV_TOO_FEW_ROWS
- DATE_INVALID
- DATE_AMBIGUOUS
- DATE_MIXED_FORMATS
- MISSING_REQUIRED_COLUMN
- MERGE_NO_ROWS
- WEATHER_IMPUTATION_FAILED

Recovery actions
- Re-upload file
- Download sample files
- Show which columns were detected
- Show example of expected headers


## 5) Kiro Prompt Templates

Template 1: Date normalization review
"Review my date normalization logic. It must reject ambiguous DD/MM vs MM/DD values and mixed formats. Suggest test cases and improvements."

Template 2: CSV validation
"Review my CSV loader state machine and validation rules. Identify missing failure modes and propose clear error messages."

Template 3: React state architecture
"Review my state shape and component boundaries. Ensure raw vs processed separation and deterministic recomputation when inputs change."
