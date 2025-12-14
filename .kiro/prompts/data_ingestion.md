Prompt:
Given a Kaggle food delivery dataset and a weather API providing historical data,
how should both datasets be normalized for daily-level analysis?

Outcome:
Standardized both datasets to daily granularity and aligned on date as the join key.

Notes:
- Orders: normalize to YYYY-MM-DD and aggregate total_orders per day.
- Weather: fetch/derive daily aggregates (avg temp, total precip, avg humidity).
- Validate inputs early (missing/ambiguous dates) and surface warnings deterministically.
