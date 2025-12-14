import argparse
import csv
import re
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Dict, Optional, Tuple


_MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def detect_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        return dialect.delimiter
    except Exception:
        return ","


def to_iso_from_month_name(value: str) -> str:
    s = value.strip().strip('"')
    if not s:
        raise ValueError("Empty date")

    # Example: "11:38 PM, September 10 2024"
    # Keep the part after the last comma.
    if "," in s:
        s = s.split(",")[-1].strip()

    m = re.match(r"^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})$", s)
    if not m:
        raise ValueError(f"Unsupported date format: {value}")

    month_token = m.group(1).lower()
    month = _MONTHS.get(month_token)
    if not month:
        raise ValueError(f"Unknown month token: {month_token}")

    day = int(m.group(2))
    year = int(m.group(3))

    dt = date(year, month, day)
    return dt.isoformat()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Convert the Kaggle order history export into canonical daily orders CSV: date,total_orders. "
            "This script parses month-name dates like '11:38 PM, September 10 2024'."
        )
    )
    parser.add_argument("--in", dest="in_path", required=True, help="Input CSV path.")
    parser.add_argument("--out", required=True, help="Output CSV path.")
    parser.add_argument(
        "--status",
        default="Delivered",
        help="Only include rows where Order Status matches this value (case-insensitive). Set to '' to include all.",
    )
    parser.add_argument(
        "--date-col",
        default="Order Placed At",
        help="Column name for the order date/time.",
    )
    parser.add_argument(
        "--status-col",
        default="Order Status",
        help="Column name for the order status.",
    )

    args = parser.parse_args()

    in_path = Path(args.in_path).resolve()
    out_path = Path(args.out).resolve()

    text = in_path.read_text(encoding="utf-8", errors="replace")
    sample = "\n".join(text.splitlines()[:25])
    delimiter = detect_delimiter(sample)

    counts: Counter[str] = Counter()

    with in_path.open("r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        if reader.fieldnames is None:
            raise SystemExit("Input CSV missing header row")

        if args.date_col not in reader.fieldnames:
            raise SystemExit(f"Missing date column: {args.date_col}")

        status_filter = args.status.strip().lower()
        has_status = args.status_col in reader.fieldnames

        for row in reader:
            if status_filter and has_status:
                status_val = (row.get(args.status_col) or "").strip().lower()
                if status_val != status_filter:
                    continue

            raw_dt = (row.get(args.date_col) or "").strip()
            if not raw_dt:
                continue

            iso = to_iso_from_month_name(raw_dt)
            counts[iso] += 1

    if len(counts) < 7:
        raise SystemExit(f"Too few distinct dates after conversion: {len(counts)}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "total_orders"])
        for d in sorted(counts.keys()):
            writer.writerow([d, counts[d]])

    print("Wrote:", str(out_path))
    print("Distinct dates:", len(counts))
    print("Date range:", min(counts.keys()), "to", max(counts.keys()))


if __name__ == "__main__":
    main()
