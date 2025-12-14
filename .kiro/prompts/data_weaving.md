Prompt:
What is the safest merge strategy when combining demand data with partially missing
weather data?

Outcome:
Use orders as the primary dataset and impute missing weather values to avoid
dropping demand records.

Notes:
- Keep only dates where orders exist.
- Join weather on date; if weather missing, impute from nearest day within a small max gap.
- If weather cannot be imputed within the gap, drop the affected day with an explicit warning.
